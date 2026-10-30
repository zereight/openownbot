import type { DatabaseSync } from "node:sqlite";
import { isDynamicRecord, isNumber } from "@robot/contracts/runtime-values";
import { sourceText } from "@robot/i18n/source";
import { createOpenOwnBotLogger } from "@robot/logging";
import { AGENT_MEMORY_SELECTION_SCHEMA_SQL } from "./agent-memory-selection";
import { AGENT_THREAD_SCHEMA_SQL } from "./agent-threads/agent-thread-schema";
import { AGENT_WAIT_SCHEMA_SQL } from "./agent-waits/agent-wait-schema";
import { BROWSER_PROFILE_SCHEMA_SQL } from "./browser-profiles/browser-profile-schema";
import { CHANNEL_SCHEMA_SQL, CHANNEL_SETTINGS_SCHEMA_SQL } from "./channel-schema";
import { PROVIDER_HISTORY_SCHEMA_SQL } from "./database/provider-history-schema";
import { MCP_SERVERS_SCHEMA_SQL } from "./mcp-schema";
import {
  MESSAGING_ALLOWED_ROLES_SCHEMA_SQL,
  MESSAGING_MEMORY_SCHEMA_SQL,
  MESSAGING_SCHEMA_SQL,
} from "./messaging/messaging-schema";
import { ROUTINE_FLOW_SCHEMA_SQL } from "./routine-flows/routine-flow-schema";
import { ROUTINE_RESULT_SCHEMA_SQL } from "./routine-results/routine-result-schema";
import { WORKFLOW_SCHEMA_SQL } from "./workflows/workflow-schema";

/**
 * The version of the schema below. The database has no migrations (plan 012): a change to the schema
 * raises this number, and a database of another version does not open. The app keeps its data in a new
 * folder for each such change, or the developer deletes the database.
 */
export const SCHEMA_VERSION = 2;

/** One row: the schema version, and when the database was made. Usage analytics count from that time. */
const DATABASE_INFO_SQL = `
  CREATE TABLE database_info (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`;

/** Events, conversations, agents, routines, attachments, reactions and provider sessions. */
const CORE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS orchestration_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    command_id TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
  );
  CREATE INDEX IF NOT EXISTS orchestration_events_aggregate
    ON orchestration_events(aggregate_type, aggregate_id, sequence);
  CREATE INDEX IF NOT EXISTS orchestration_events_command
    ON orchestration_events(command_id);
  CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
    command_id TEXT PRIMARY KEY,
    accepted_at TEXT NOT NULL,
    first_sequence INTEGER NOT NULL,
    last_sequence INTEGER NOT NULL,
    result_json TEXT NOT NULL CHECK(json_valid(result_json))
  );
  CREATE TABLE IF NOT EXISTS projection_threads (
    thread_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    title TEXT NOT NULL,
    active_turn_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_agents (
    agent_id TEXT PRIMARY KEY,
    thread_id TEXT,
    model TEXT NOT NULL,
    updated_at TEXT,
    sort_order INTEGER NOT NULL,
    agent_json TEXT NOT NULL CHECK(json_valid(agent_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_agent_memories (
    memory_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    text TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    origin TEXT NOT NULL CHECK(origin IN ('automatic', 'manual')),
    source_turn_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL,
    UNIQUE(agent_id, normalized_text)
  );
  CREATE INDEX IF NOT EXISTS agent_memories_agent
    ON projection_agent_memories(agent_id, updated_at DESC, memory_id);
  CREATE TABLE IF NOT EXISTS projection_agent_routines (
    routine_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    instruction TEXT NOT NULL,
    active INTEGER NOT NULL CHECK(active IN (0, 1)),
    timezone TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL,
    limit_policy TEXT NOT NULL DEFAULT 'wait' CHECK(limit_policy IN ('wait', 'skip')),
    missed_policy TEXT NOT NULL DEFAULT 'skip' CHECK(missed_policy IN ('skip', 'run-once'))
  );
  CREATE INDEX IF NOT EXISTS agent_routines_agent
    ON projection_agent_routines(agent_id, updated_at DESC, routine_id);
  CREATE TABLE IF NOT EXISTS projection_routine_triggers (
    trigger_id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL REFERENCES projection_agent_routines(routine_id) ON DELETE CASCADE,
    schedule_json TEXT NOT NULL CHECK(json_valid(schedule_json)),
    next_run_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL,
    UNIQUE(routine_id)
  );
  CREATE INDEX IF NOT EXISTS routine_triggers_due
    ON projection_routine_triggers(next_run_at, routine_id);
  CREATE TABLE IF NOT EXISTS projection_routine_runs (
    run_id TEXT PRIMARY KEY,
    routine_id TEXT NOT NULL REFERENCES projection_agent_routines(routine_id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    trigger_id TEXT,
    run_kind TEXT NOT NULL CHECK(run_kind IN ('scheduled', 'manual')),
    scheduled_for TEXT NOT NULL,
    routine_name TEXT NOT NULL,
    instruction TEXT NOT NULL,
    delivery_id TEXT,
    status TEXT NOT NULL CHECK(status IN (
      'queued', 'running', 'needs-attention', 'succeeded', 'failed', 'interrupted', 'cancelled'
    )),
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL,
    missed_count INTEGER CHECK(missed_count IS NULL OR missed_count >= 1),
    missed_until TEXT,
    run_source TEXT CHECK(run_source IS NULL OR run_source IN ('test', 'script', 'webhook')),
    UNIQUE(trigger_id, scheduled_for)
  );
  CREATE INDEX IF NOT EXISTS routine_runs_routine
    ON projection_routine_runs(routine_id, created_at DESC, run_id);
  CREATE UNIQUE INDEX IF NOT EXISTS routine_runs_delivery
    ON projection_routine_runs(delivery_id) WHERE delivery_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS projection_provider_sessions (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_session_id TEXT NOT NULL,
    model TEXT NOT NULL,
    effort TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('active', 'inactive', 'failed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resume_cursor TEXT,
    last_event_sequence INTEGER NOT NULL,
    UNIQUE(provider, external_session_id)
  );
  CREATE INDEX IF NOT EXISTS provider_sessions_thread
    ON projection_provider_sessions(thread_id, provider, state);
  CREATE TABLE IF NOT EXISTS projection_turns (
    turn_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    provider_session_id TEXT REFERENCES projection_provider_sessions(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_thread_messages (
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    turn_id TEXT,
    author TEXT NOT NULL,
    status TEXT NOT NULL,
    item_type TEXT,
    created_at TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    message_json TEXT NOT NULL CHECK(json_valid(message_json)),
    last_event_sequence INTEGER NOT NULL,
    group_start TEXT,
    group_first INTEGER,
    group_id TEXT,
    turn_rank INTEGER,
    PRIMARY KEY(thread_id, message_id)
  );
  CREATE INDEX IF NOT EXISTS thread_messages_order
    ON projection_thread_messages(thread_id, created_at, ordinal);
  CREATE INDEX IF NOT EXISTS thread_messages_page_order
    ON projection_thread_messages(thread_id, created_at, ordinal, message_id);
  CREATE TABLE IF NOT EXISTS projection_thread_reads (
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    through_message_id TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(thread_id, member_id)
  );
  CREATE TABLE IF NOT EXISTS projection_thread_read_baselines (
    thread_id TEXT PRIMARY KEY REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    through_message_id TEXT,
    initialized_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_thread_activities (
    activity_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    turn_id TEXT,
    activity_type TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    created_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_mailbox_messages (
    message_id TEXT PRIMARY KEY,
    sender_kind TEXT NOT NULL,
    sender_agent_id TEXT,
    text TEXT NOT NULL,
    reply_to_message_id TEXT,
    created_at TEXT NOT NULL,
    message_json TEXT NOT NULL CHECK(json_valid(message_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_deliveries (
    delivery_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES projection_mailbox_messages(message_id) ON DELETE CASCADE,
    recipient_agent_id TEXT NOT NULL,
    status TEXT NOT NULL,
    turn_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    delivery_json TEXT NOT NULL CHECK(json_valid(delivery_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_queue_state (
    agent_id TEXT PRIMARY KEY,
    paused INTEGER NOT NULL CHECK(paused IN (0, 1)),
    metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_reactions (
    agent_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user', 'agent')),
    actor_agent_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL,
    PRIMARY KEY(agent_id, message_id, actor_kind, actor_agent_id)
  );
  CREATE TABLE IF NOT EXISTS projection_attachments (
    attachment_id TEXT PRIMARY KEY,
    owner_kind TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
    created_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_thread_summaries (
    summary_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    through_message_id TEXT,
    summary_text TEXT NOT NULL,
    estimated_tokens INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_direct_threads (
    thread_id TEXT PRIMARY KEY,
    member_a_id TEXT NOT NULL,
    member_b_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_message_id TEXT,
    last_event_sequence INTEGER NOT NULL,
    UNIQUE(member_a_id, member_b_id)
  );
  CREATE INDEX IF NOT EXISTS direct_threads_member_a
    ON projection_direct_threads(member_a_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS direct_threads_member_b
    ON projection_direct_threads(member_b_id, updated_at DESC);
  CREATE TABLE IF NOT EXISTS projection_direct_messages (
    message_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES projection_direct_threads(thread_id) ON DELETE CASCADE,
    sender_member_id TEXT NOT NULL,
    recipient_member_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    message_json TEXT NOT NULL CHECK(json_valid(message_json)),
    last_event_sequence INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS direct_messages_thread
    ON projection_direct_messages(thread_id, last_event_sequence);
  CREATE TABLE IF NOT EXISTS projection_direct_reads (
    thread_id TEXT NOT NULL REFERENCES projection_direct_threads(thread_id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    last_read_sequence INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(thread_id, member_id)
  );
  CREATE TABLE IF NOT EXISTS file_deletion_outbox (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );
`;

/** Usage records and activity of agents, for the analytics screens. */
const ANALYTICS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS agent_usage_records (
    agent_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    tokens_json TEXT NOT NULL CHECK(json_valid(tokens_json)),
    estimated_cost_usd REAL,
    rate_basis TEXT,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY(agent_id, record_id)
  );
  CREATE INDEX IF NOT EXISTS agent_usage_date ON agent_usage_records(agent_id, occurred_at);
  CREATE TABLE IF NOT EXISTS agent_usage_checkpoints (
    agent_id TEXT NOT NULL,
    counter_id TEXT NOT NULL,
    tokens_json TEXT NOT NULL CHECK(json_valid(tokens_json)),
    PRIMARY KEY(agent_id, counter_id)
  );
  CREATE TABLE IF NOT EXISTS agent_usage_activity (
    agent_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('turn', 'user', 'assistant')),
    occurred_at TEXT NOT NULL,
    PRIMARY KEY(agent_id, activity_id)
  );
  CREATE INDEX IF NOT EXISTS agent_usage_activity_date ON agent_usage_activity(agent_id, occurred_at);

  CREATE INDEX IF NOT EXISTS agent_usage_occurred ON agent_usage_records(occurred_at);
  CREATE INDEX IF NOT EXISTS agent_usage_activity_occurred ON agent_usage_activity(occurred_at);
`;

/** The read paths of the conversation and attachment tables. */
const CORE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS thread_messages_shown_order ON projection_thread_messages(
    thread_id, group_start, group_first, group_id, turn_rank, created_at, ordinal, message_id, author, item_type
  );
  CREATE INDEX IF NOT EXISTS thread_messages_turn ON projection_thread_messages(thread_id, turn_id);

  CREATE INDEX IF NOT EXISTS attachments_owner ON projection_attachments(owner_kind, owner_id);

  CREATE INDEX IF NOT EXISTS orchestration_events_thread_type
    ON orchestration_events(aggregate_id, event_type, sequence) WHERE aggregate_type = 'thread';
`;

/** Webhook triggers and received deliveries for routines. */
const WEBHOOK_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS projection_routine_webhooks (
    routine_id TEXT PRIMARY KEY REFERENCES projection_agent_routines(routine_id) ON DELETE CASCADE,
    route_id TEXT NOT NULL UNIQUE,
    event_type TEXT,
    filters_json TEXT NOT NULL CHECK(json_valid(filters_json)),
    secret_ciphertext TEXT NOT NULL,
    url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_channel_routine_webhooks (
    routine_id TEXT PRIMARY KEY REFERENCES projection_channel_routines(routine_id) ON DELETE CASCADE,
    route_id TEXT NOT NULL UNIQUE,
    event_type TEXT,
    filters_json TEXT NOT NULL CHECK(json_valid(filters_json)),
    secret_ciphertext TEXT NOT NULL,
    url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_webhook_route_revocations (
    route_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projection_webhook_receipts (
    receipt_id TEXT PRIMARY KEY,
    owner_kind TEXT NOT NULL CHECK(owner_kind IN ('agent', 'channel')),
    routine_id TEXT NOT NULL,
    delivery_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('started', 'ignored')),
    reason TEXT CHECK(reason IS NULL OR reason IN ('event-type', 'filter', 'inactive')),
    run_id TEXT,
    received_at TEXT NOT NULL,
    UNIQUE(owner_kind, routine_id, delivery_id)
  );
  CREATE INDEX IF NOT EXISTS webhook_receipts_recent
    ON projection_webhook_receipts(owner_kind, routine_id, received_at DESC, receipt_id);
  CREATE INDEX IF NOT EXISTS webhook_receipts_received ON projection_webhook_receipts(received_at);
`;

const SCHEMA_SQL =
  DATABASE_INFO_SQL +
  CORE_SCHEMA_SQL +
  ANALYTICS_SCHEMA_SQL +
  CHANNEL_SCHEMA_SQL +
  CHANNEL_SETTINGS_SCHEMA_SQL +
  MCP_SERVERS_SCHEMA_SQL +
  MESSAGING_SCHEMA_SQL +
  PROVIDER_HISTORY_SCHEMA_SQL +
  WEBHOOK_SCHEMA_SQL +
  ROUTINE_FLOW_SCHEMA_SQL +
  AGENT_MEMORY_SELECTION_SCHEMA_SQL +
  AGENT_WAIT_SCHEMA_SQL +
  MESSAGING_MEMORY_SCHEMA_SQL +
  ROUTINE_RESULT_SCHEMA_SQL +
  CORE_INDEX_SQL +
  MESSAGING_ALLOWED_ROLES_SCHEMA_SQL +
  BROWSER_PROFILE_SCHEMA_SQL +
  WORKFLOW_SCHEMA_SQL +
  AGENT_THREAD_SCHEMA_SQL;

export interface DatabaseSchemaOptions {
  /** When a new database is made. Tests pass a fixed time. */
  createdAt?: string;
  /** The last connection closed cleanly, so SQLite removed the write-ahead log. */
  closedCleanly?: boolean;
}

const logger = createOpenOwnBotLogger("openownbot-database-schema");

/**
 * Makes the schema in an empty database, or checks that a database has the schema of this build. A
 * database of another version, or one without `database_info`, stops the start: this build does not
 * change it.
 */
export function prepareDatabaseSchema(db: DatabaseSync, options: DatabaseSchemaOptions = {}): void {
  if (!hasAnyTable(db)) {
    createDatabase(db, options.createdAt ?? new Date().toISOString());
    assertQuickCheck(db);
    return;
  }
  const version = readSchemaVersion(db);
  if (version !== SCHEMA_VERSION) {
    throw new Error(
      `The database has schema version ${version ?? "unknown"}. This build reads version ${SCHEMA_VERSION} only.`,
    );
  }
  // The check reads every page, which takes minutes on a large file. Only a stop that did not close the
  // file (a crash, a kill, a disk save while it ran) can leave a damaged page.
  if (!options.closedCleanly) assertQuickCheck(db);
}

function hasAnyTable(db: DatabaseSync): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get(),
  );
}

function createDatabase(db: DatabaseSync, createdAt: string): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(SCHEMA_SQL);
    db.prepare("INSERT INTO database_info(id, schema_version, created_at) VALUES (1, ?, ?)").run(
      SCHEMA_VERSION,
      createdAt,
    );
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function readSchemaVersion(db: DatabaseSync): number | null {
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'database_info'").get();
  if (!table) return null;
  const row = db.prepare("SELECT schema_version FROM database_info WHERE id = 1").get();
  return isDynamicRecord(row) && isNumber(row.schema_version) ? row.schema_version : null;
}

function assertQuickCheck(db: DatabaseSync): void {
  const problems = db
    .prepare("PRAGMA quick_check(20)")
    .all()
    .map((row) => (isDynamicRecord(row) ? row.quick_check : row));
  if (problems.length === 1 && problems[0] === "ok") return;
  // The lines name the damaged pages and tables, which tell a page left by a disk save from a bad index.
  logger.error("The OpenOwnBot database failed its integrity check.", { problems });
  throw new Error(sourceText("error.backend.databaseIntegrity"));
}
