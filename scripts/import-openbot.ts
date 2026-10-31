// One-time move of the data of an OpenBot 0.50 build into ROBot, on the same computer. Plan 012 keeps no
// reader of old data in the app, so this script does the move once, outside the app:
//
//   node --import tsx scripts/import-openbot.ts            # dry run: reads, converts a copy, writes nothing
//   node --import tsx scripts/import-openbot.ts --apply    # writes the ROBot data
//
// Quit OpenBot and ROBot first. The script never writes, moves or deletes OpenBot data: it copies
// `openbot.db` to a temporary folder and converts the copy, and it clones files with `cp -c` (APFS
// copy-on-write, so the copies take no space until one side changes).
//
// What moves: the whole database (agents, memories, workflows, routines, chats, channels, attachments),
// the agent workspaces and shared files under `~/OpenBot`, local skills, provider accounts and provider
// session files, and the settings files without secrets. Absolute paths into the OpenBot folders are
// rewritten to the ROBot folders in every text column.
//
// What does not move: secrets. OpenBot encrypted them with the macOS keychain entry of the OpenBot app,
// which ROBot cannot read. Sign in to the ROBot account again, and enter API keys of custom providers,
// provider credentials and the Vault again. Team server identity and push registrations stay too.
// The routine feed is sealed too, so it starts off. Downloaded runtimes are downloaded again.
//
// `--only=agents,workflows,channels` moves the agents (with their memories, routines and workspaces),
// the workflows and the channels, and leaves the history behind: chats, side threads, channel messages
// and tasks, provider sessions, attachments, runs and usage. Agents always move; the other parts are
// `workflows`, `channels` and `history`. With no `--only`, everything moves.
//
// Options: --from-data=<OpenBot user data> --from-home=<folder with OpenBot/> --to-data=<ROBot user
// data> --to-home=<folder for ROBot/>. `--replace` sets an existing ROBot database aside (renamed, not
// deleted) instead of stopping; use it only for a dev profile. `--allow-running-source` copies the
// database while OpenBot runs, for a test; the copy is checked with `quick_check`.
// Writes a report to .openownbot-build/import-openbot/report.json.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_FOLDER_NAME } from "@robot/contracts/product";
import { AGENT_THREAD_SCHEMA_SQL } from "../src/backend/agent-threads/agent-thread-schema";
import {
  databaseRow,
  databaseRows,
  objectValue,
  optionalNumberColumn,
  optionalStringColumn,
  requiredNumberColumn,
  requiredStringColumn,
} from "../src/backend/database/database-rows";
import { prepareDatabaseSchema, SCHEMA_VERSION } from "../src/backend/openownbot-database-schema";
import { MANAGED_SKILL_FOLDERS, MANAGED_SKILL_SLUGS, OWNERSHIP_MARKER } from "../src/main/skills/managed-skill-service";

const OLD_FOLDER_NAME = "OpenBot";
const DATABASE = "openbot.db";
/** Migration 46 is OpenBot 0.50.0. 47 and 48 came after it, before the one-schema build. */
const OLDEST_VERSION = 46;
const NEWEST_VERSION = 48;
const OLD_MANAGED_MARKER = ".openbot-managed.json";

const option = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);
const appData = join(homedir(), "Library", "Application Support");
const fromData = resolve(option("from-data") ?? join(appData, OLD_FOLDER_NAME));
const fromRoot = join(resolve(option("from-home") ?? homedir()), OLD_FOLDER_NAME);
const toData = resolve(option("to-data") ?? join(appData, DATA_FOLDER_NAME));
const toRoot = join(resolve(option("to-home") ?? homedir()), DATA_FOLDER_NAME);
const apply = flag("apply");
const PARTS = ["agents", "workflows", "channels", "history"] as const;
type Part = (typeof PARTS)[number];
const isPart = (value: string): value is Part => PARTS.some((part) => part === value);
const onlyOption = option("only");
const parts: ReadonlySet<Part> = new Set(
  onlyOption === undefined
    ? PARTS
    : [
        "agents" as const,
        ...onlyOption.split(",").map((value) => {
          assert.ok(isPart(value), `--only takes ${PARTS.join(", ")}; got "${value}".`);
          return value;
        }),
      ],
);

/** Old path prefix, new path prefix. The user data folder goes first: it is inside neither root. */
const PATH_PREFIXES: [string, string][] = [
  [`${fromData}/`, `${toData}/`],
  [`${fromRoot}/`, `${toRoot}/`],
  [`~/${OLD_FOLDER_NAME}/`, `~/${DATA_FOLDER_NAME}/`],
];

/** Folders of the OpenBot user data folder that hold agent or provider state. */
const DATA_FOLDERS = [
  "avatars",
  "local-skills",
  "provider-accounts",
  "provider-handoffs",
  "provider-state",
  "provider-toolsets",
  "provider-work-steps",
];
/** Folders of `~/OpenBot` that the app owns. Agent workspaces are cloned one by one. */
const ROOT_FOLDERS = ["Shared", "Downloads"];
/** Settings files with no secret. `openbot-<name>-vN.json` is `<name>.json` in ROBot. */
const SETTINGS_FILES = [
  "openbot-agent-defaults-v1.json",
  "openbot-app-behavior-preference-v1.json",
  "openbot-appearance-preference-v1.json",
  "openbot-approval-automation-v3.json",
  "openbot-busy-message-mode-v1.json",
  "openbot-custom-providers-v1.json",
  "openbot-dynamic-island-preference-v1.json",
  "openbot-interface-size-preference-v1.json",
  "openbot-logo-color-preference-v1.json",
  "openbot-notification-preference-v1.json",
  "openbot-provider-accounts-v1.json",
  "openbot-provider-use-v1.json",
  "openbot-remote-network-route-v1.json",
  "openbot-remote-servers-v1.json",
  "openbot-setup-v2.json",
  "openbot-sidebar-layout-v1.json",
  "openbot-update-preference-v1.json",
  "voice-preference.json",
];
const newSettingsName = (name: string) => name.replace(/^openbot-(.+)-v\d+\.json$/, "$1.json");

interface Report {
  apply: boolean;
  from: { data: string; root: string; schemaVersion: number | null };
  to: { data: string; root: string };
  parts: string[];
  counts: Record<string, number>;
  leftOut: Record<string, number>;
  rewrittenPaths: Record<string, number>;
  schemaDifferences: string[];
  foreignKeyProblems: number;
  workspaces: { cloned: number; kept: number; missing: string[] };
  managedSkills: { adopted: number; removed: number };
  folders: Record<string, string>;
  settings: Record<string, string>;
  warnings: string[];
  passed: boolean;
}

const report: Report = {
  apply,
  from: { data: fromData, root: fromRoot, schemaVersion: null },
  to: { data: toData, root: toRoot },
  parts: [...parts],
  counts: {},
  leftOut: {},
  rewrittenPaths: {},
  schemaDifferences: [],
  foreignKeyProblems: 0,
  workspaces: { cloned: 0, kept: 0, missing: [] },
  managedSkills: { adopted: 0, removed: 0 },
  folders: {},
  settings: {},
  warnings: [],
  passed: false,
};

/**
 * Electron holds `SingletonLock` (a link to `<host>-<pid>`) while the app runs. A crash leaves the link
 * behind, so the app runs only when its process is still alive.
 */
const isRunning = (dataFolder: string) => {
  let target: string;
  try {
    target = readlinkSync(join(dataFolder, "SingletonLock"));
  } catch {
    return false;
  }
  const pid = Number(target.slice(target.lastIndexOf("-") + 1));
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
};

/**
 * Copy-on-write clone on APFS, a plain copy elsewhere. An entry that is already there is kept, and a
 * folder that both sides have is merged, so a second run adds only what is missing.
 */
function cloneTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (!existsSync(target)) {
      try {
        execFileSync("cp", ["-c", "-R", source, to], { stdio: "pipe" });
      } catch {
        execFileSync("cp", ["-R", source, to], { stdio: "pipe" });
      }
    } else if (entry.isDirectory() && statSync(target).isDirectory()) cloneTree(source, target);
  }
}

/**
 * OpenBot marked the skills it wrote into a workspace with `.openbot-managed.json`. ROBot writes the
 * same `openownbot-*` skills with `.robot-managed.json`, so their marker gets the new name and ROBot
 * keeps them up to date. The older `openbot-*` skills name OpenBot and no app updates them any more,
 * so they leave the copy. Only the ROBot copy changes.
 */
function adoptManagedSkills(workspace: string): void {
  for (const folder of MANAGED_SKILL_FOLDERS) {
    const root = join(workspace, folder);
    if (!existsSync(root)) continue;
    for (const slug of readdirSync(root)) {
      const marker = join(root, slug, OLD_MANAGED_MARKER);
      if (!existsSync(marker)) continue;
      const owner = objectValue(JSON.parse(readFileSync(marker, "utf8")))?.managedBy;
      if (owner === "openownbot" && MANAGED_SKILL_SLUGS.has(slug)) {
        if (!existsSync(join(root, slug, OWNERSHIP_MARKER))) renameSync(marker, join(root, slug, OWNERSHIP_MARKER));
        report.managedSkills.adopted += 1;
      } else if (owner === "openbot") {
        rmSync(join(root, slug), { recursive: true, force: true });
        report.managedSkills.removed += 1;
      }
    }
  }
}

function tableColumns(db: DatabaseSync): Map<string, string> {
  const shapes = new Map<string, string>();
  const rows = databaseRows(
    db.prepare("SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all(),
  );
  for (const row of rows) {
    const type = requiredStringColumn(row, "type");
    const name = requiredStringColumn(row, "name");
    if (type !== "table") {
      shapes.set(`${type} ${name}`, requiredStringColumn(row, "tbl_name"));
      continue;
    }
    const columns = databaseRows(db.prepare(`PRAGMA table_info("${name}")`).all()).map((column) =>
      ["name", "type", "notnull", "pk"].map((key) => String(column[key])).join(":"),
    );
    shapes.set(`table ${name}`, columns.join(","));
  }
  return shapes;
}

/** Brings the copy from migration 46-48 to the one schema of this build. */
function convert(db: DatabaseSync): void {
  const versions = databaseRows(db.prepare("SELECT version FROM schema_migrations").all()).map((row) =>
    requiredNumberColumn(row, "version"),
  );
  const version = Math.max(...versions);
  report.from.schemaVersion = version;
  assert.ok(
    version >= OLDEST_VERSION && version <= NEWEST_VERSION,
    `The OpenBot database has migration ${version}. Update OpenBot to 0.50 and open it once, then run this again.`,
  );
  const first = databaseRow(db.prepare("SELECT MIN(applied_at) AS at FROM schema_migrations").get());
  const createdAt = (first && optionalStringColumn(first, "at")) ?? new Date().toISOString();
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  // Migration 47 and the removal of `legacy_task_id`: each task becomes a side thread with the same
  // thread. The table is made with this build's SQL, so it matches a new database.
  if (version < 47) {
    db.exec(AGENT_THREAD_SCHEMA_SQL);
    db.exec(`
      INSERT INTO projection_agent_threads
        (thread_id, agent_id, origin, title, title_source, outcome, error, created_at, updated_at,
         archived_at, last_event_sequence)
      SELECT task.thread_id, task.agent_id, task.origin, task.title,
        CASE task.origin WHEN 'agent' THEN 'agent' ELSE 'auto' END,
        task.outcome, task.error, task.created_at, task.updated_at, task.closed_at, task.last_event_sequence
      FROM projection_agent_tasks AS task
      WHERE task.thread_id IN (SELECT thread_id FROM projection_threads);
      DROP INDEX IF EXISTS agent_tasks_agent;
      DROP TABLE projection_agent_tasks;
    `);
  } else {
    // 47 or 48 ran: rebuild the table without `legacy_task_id`, with the fork columns.
    const columns = new Set(
      databaseRows(db.prepare("PRAGMA table_info(projection_agent_threads)").all()).map((column) =>
        requiredStringColumn(column, "name"),
      ),
    );
    db.exec("ALTER TABLE projection_agent_threads RENAME TO old_agent_threads");
    db.exec("DROP INDEX IF EXISTS agent_threads_open; DROP INDEX IF EXISTS agent_threads_agent;");
    db.exec(AGENT_THREAD_SCHEMA_SQL);
    const fork = columns.has("forked_from_thread_id") ? "forked_from_thread_id, forked_from_message_id" : "NULL, NULL";
    db.exec(`
      INSERT INTO projection_agent_threads
        (thread_id, agent_id, origin, title, title_source, outcome, error, created_at, updated_at,
         archived_at, last_event_sequence, forked_from_thread_id, forked_from_message_id)
      SELECT thread_id, agent_id, origin, title, title_source, outcome, error, created_at, updated_at,
        archived_at, last_event_sequence, ${fork}
      FROM old_agent_threads;
      DROP TABLE old_agent_threads;
    `);
  }
  db.exec("DROP TABLE schema_migrations");
  db.exec(
    "CREATE TABLE database_info (id INTEGER PRIMARY KEY CHECK(id = 1), schema_version INTEGER NOT NULL, created_at TEXT NOT NULL)",
  );
  db.prepare("INSERT INTO database_info(id, schema_version, created_at) VALUES (1, ?, ?)").run(
    SCHEMA_VERSION,
    createdAt,
  );
  leaveOut(db);
  rewritePaths(db);
  db.exec("COMMIT");
  db.exec("PRAGMA foreign_keys = ON");
}

/** Rewrites the OpenBot path prefixes in every text column of every ordinary table. */
function rewritePaths(db: DatabaseSync): void {
  const tables = databaseRows(
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' AND name NOT LIKE 'agent_memory_search_%'`,
      )
      .all(),
  ).map((row) => requiredStringColumn(row, "name"));
  for (const table of tables) {
    const columns = databaseRows(db.prepare(`PRAGMA table_info("${table}")`).all())
      .filter((column) => column.type === "TEXT" || column.type === "")
      .map((column) => requiredStringColumn(column, "name"));
    for (const column of columns) {
      for (const [from, to] of PATH_PREFIXES) {
        const changed = db
          .prepare(`UPDATE "${table}" SET "${column}" = replace("${column}", ?, ?) WHERE instr("${column}", ?) > 0`)
          .run(from, to, from).changes;
        if (changed > 0) {
          const key = `${table}.${column}`;
          report.rewrittenPaths[key] = (report.rewrittenPaths[key] ?? 0) + Number(changed);
        }
      }
    }
  }
}

function compareWithNewSchema(db: DatabaseSync, folder: string): void {
  const fresh = new DatabaseSync(join(folder, "fresh.db"));
  prepareDatabaseSchema(fresh);
  const expected = tableColumns(fresh);
  fresh.close();
  const actual = tableColumns(db);
  for (const [name, shape] of expected) {
    if (!actual.has(name)) report.schemaDifferences.push(`missing ${name}`);
    else if (name.startsWith("table ") && actual.get(name) !== shape)
      report.schemaDifferences.push(`columns of ${name}`);
  }
  for (const name of actual.keys()) if (!expected.has(name)) report.schemaDifferences.push(`extra ${name}`);
}

/** The tables of each part that `--only` can leave out. Every other table is configuration and moves. */
const HISTORY_TABLES = [
  "agent_usage_activity",
  "agent_usage_checkpoints",
  "agent_usage_records",
  "agent_waits",
  "file_deletion_outbox",
  "orchestration_command_receipts",
  "projection_agent_threads",
  "projection_attachments",
  "projection_channel_assignments",
  "projection_channel_contexts",
  "projection_channel_messages",
  "projection_channel_reads",
  "projection_channel_routine_runs",
  "projection_channel_summaries",
  "projection_channel_tasks",
  "projection_deliveries",
  "projection_direct_messages",
  "projection_direct_reads",
  "projection_direct_threads",
  "projection_mailbox_messages",
  "projection_provider_sessions",
  "projection_queue_state",
  "projection_reactions",
  "projection_routine_runs",
  "projection_thread_activities",
  "projection_thread_messages",
  "projection_thread_read_baselines",
  "projection_thread_reads",
  "projection_thread_summaries",
  "projection_turns",
  "projection_webhook_receipts",
  "provider_history_imports",
  "provider_history_staging",
  "provider_history_turns",
  "routine_flow_steps",
  "routine_result_deliveries",
  "workflow_output_deliveries",
  "workflow_runs",
  "workflow_steps",
  "workflow_webhook_receipts",
];
const WORKFLOW_TABLES = [
  "workflow_output_deliveries",
  "workflow_steps",
  "workflow_runs",
  "workflow_webhook_receipts",
  "workflow_trigger_webhooks",
  "workflow_triggers",
  "workflow_edges",
  "workflow_nodes",
  "workflow_versions",
  "workflows",
];
const CHANNEL_TABLES = [
  "projection_channel_assignments",
  "projection_channel_tasks",
  "projection_channel_messages",
  "projection_channel_summaries",
  "projection_channel_reads",
  "projection_channel_contexts",
  "projection_channel_memories",
  "projection_channel_routine_runs",
  "projection_channel_routine_webhooks",
  "projection_channel_routine_triggers",
  "projection_channel_routines",
  "projection_channels",
];
/** Event aggregates that hold configuration. `agents` must stay: ROBot reads the roster from it. */
const CONFIGURATION_EVENTS = ["agents", "agent-memory", "agent-routine", "channel-memory", "channel-routine"];

/** Removes the parts that `--only` left out from the copy. */
function leaveOut(db: DatabaseSync): void {
  const clear = (tables: readonly string[]) => {
    for (const table of tables) {
      const removed = Number(db.prepare(`DELETE FROM "${table}"`).run().changes);
      if (removed > 0) report.leftOut[table] = (report.leftOut[table] ?? 0) + removed;
    }
  };
  if (!parts.has("workflows")) clear(WORKFLOW_TABLES);
  if (!parts.has("channels")) {
    clear(CHANNEL_TABLES);
    db.exec("DELETE FROM orchestration_events WHERE aggregate_type IN ('channel-memory', 'channel-routine')");
  }
  if (parts.has("history")) return;
  clear(HISTORY_TABLES);
  // Each agent keeps the empty thread of its own chat; side threads and channel contexts go.
  db.exec(`
    DELETE FROM projection_threads
      WHERE thread_id NOT IN (SELECT thread_id FROM projection_agents WHERE thread_id IS NOT NULL);
    UPDATE projection_threads SET active_turn_id = NULL;
    UPDATE projection_agents SET agent_json = json_set(agent_json, '$.preview', '');
  `);
  const kept = CONFIGURATION_EVENTS.map(() => "?").join(", ");
  const removed = db
    .prepare(`DELETE FROM orchestration_events WHERE aggregate_type NOT IN (${kept})`)
    .run(...CONFIGURATION_EVENTS).changes;
  report.leftOut.orchestration_events = Number(removed);
}

function count(db: DatabaseSync): void {
  const tables = {
    agents: "projection_agents",
    memories: "projection_agent_memories",
    routines: "projection_agent_routines",
    sideThreads: "projection_agent_threads",
    workflows: "workflows",
    workflowVersions: "workflow_versions",
    channels: "projection_channels",
    messages: "projection_thread_messages",
    attachments: "projection_attachments",
    events: "orchestration_events",
  };
  for (const [key, table] of Object.entries(tables)) {
    const row = databaseRow(db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get());
    report.counts[key] = (row && optionalNumberColumn(row, "n")) ?? 0;
  }
}

function copyFiles(workspaces: { id: string; path: string }[]): void {
  for (const workspace of workspaces) {
    const from = workspace.path.replace(`${toRoot}/`, `${fromRoot}/`);
    if (!existsSync(from)) {
      // ROBot does not make a missing workspace again. An empty one lets the agent start.
      report.workspaces.missing.push(workspace.id);
      if (apply) mkdirSync(workspace.path, { recursive: true });
      continue;
    }
    if (existsSync(workspace.path)) report.workspaces.kept += 1;
    else report.workspaces.cloned += 1;
    if (apply) {
      cloneTree(from, workspace.path);
      adoptManagedSkills(workspace.path);
    }
  }
  for (const folder of ROOT_FOLDERS) {
    const from = join(fromRoot, folder);
    report.folders[`~/${OLD_FOLDER_NAME}/${folder}`] = existsSync(from) ? "cloned" : "absent";
    if (apply && existsSync(from)) cloneTree(from, join(toRoot, folder));
  }
  for (const folder of DATA_FOLDERS) {
    const from = join(fromData, folder);
    report.folders[folder] = existsSync(from) ? "cloned" : "absent";
    if (apply && existsSync(from)) cloneTree(from, join(toData, folder));
  }
  for (const name of SETTINGS_FILES) {
    const from = join(fromData, name);
    const to = join(toData, newSettingsName(name));
    if (!existsSync(from)) continue;
    if (existsSync(to)) {
      report.settings[name] = "kept (ROBot already has it)";
      continue;
    }
    let text = readFileSync(from, "utf8");
    for (const [old, next] of PATH_PREFIXES) text = text.split(old).join(next);
    if (name === "openbot-custom-providers-v1.json") {
      // The key is sealed with OpenBot's keychain entry. The provider stays; the user enters the key again.
      const file = objectValue(JSON.parse(text));
      const providers = file?.providers;
      for (const provider of Array.isArray(providers) ? providers : [])
        if (provider && typeof provider === "object") Reflect.deleteProperty(provider, "secret");
      text = `${JSON.stringify(file, null, 2)}\n`;
    }
    report.settings[name] = newSettingsName(name);
    if (apply) writeFileSync(to, text, { flag: "wx" });
  }
}

const work = mkdtempSync(join(tmpdir(), "robot-import-"));
try {
  assert.ok(existsSync(join(fromData, DATABASE)), `No OpenBot database at ${join(fromData, DATABASE)}.`);
  if (isRunning(fromData)) {
    assert.ok(flag("allow-running-source"), "Quit OpenBot first: it still runs.");
    report.warnings.push("OpenBot ran during the copy.");
  }
  if (apply) assert.ok(!isRunning(toData), "Quit ROBot first: it still runs.");
  const target = join(toData, DATABASE);
  if (existsSync(target)) assert.ok(flag("replace"), `ROBot already has a database at ${target}. Nothing was changed.`);

  // Only the copy is opened. The WAL and shared-memory files go with it, so no committed write is lost.
  const copy = join(work, DATABASE);
  for (const suffix of ["", "-wal", "-shm"])
    if (existsSync(join(fromData, DATABASE + suffix))) copyFileSync(join(fromData, DATABASE + suffix), copy + suffix);
  const db = new DatabaseSync(copy);
  const check = databaseRows(db.prepare("PRAGMA quick_check").all());
  assert.deepEqual(
    check.map((row) => row.quick_check),
    ["ok"],
    "The copy of the OpenBot database is damaged. Quit OpenBot and try again.",
  );
  convert(db);
  compareWithNewSchema(db, work);
  report.foreignKeyProblems = db.prepare("PRAGMA foreign_key_check").all().length;
  count(db);
  const workspaces = databaseRows(
    db.prepare("SELECT agent_id, json_extract(agent_json, '$.workspacePath') AS path FROM projection_agents").all(),
  ).flatMap((row) => {
    const path = optionalStringColumn(row, "path");
    return path ? [{ id: requiredStringColumn(row, "agent_id"), path }] : [];
  });
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  // Gives back the pages of the history that was left out.
  if (!parts.has("history")) db.exec("VACUUM");
  db.close();
  assert.deepEqual(report.schemaDifferences, [], "The converted database does not match the schema of this build.");

  copyFiles(workspaces);
  if (apply) {
    mkdirSync(toData, { recursive: true });
    if (existsSync(target)) {
      const aside = `${target}.before-import-${Date.now()}`;
      for (const suffix of ["", "-wal", "-shm"])
        if (existsSync(target + suffix)) renameSync(target + suffix, aside + suffix);
      report.warnings.push(`The earlier ROBot database is at ${aside}.`);
    }
    // Written next to the target first, so the database appears whole or not at all.
    copyFileSync(copy, `${target}.importing`);
    renameSync(`${target}.importing`, target);
  }
  report.passed = true;
} finally {
  const out = resolve(import.meta.dirname, "../.openownbot-build/import-openbot");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  execFileSync("rm", ["-rf", work]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
