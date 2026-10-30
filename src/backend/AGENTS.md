# `src/backend`

The stores, the SQLite database (`openownbot-database.ts` and the controllers under `database/`), the
provider clients and `agent-service.ts`. The user's SQLite is the source of truth here, not a cache
of something remote.

## Database schema

- One schema, no migrations ([plan 012](../../plans/012-in-place-rewrite.md)). `prepareDatabaseSchema` in
  `openownbot-database-schema.ts` makes it in an empty database and refuses a database whose
  `database_info.schema_version` is not `SCHEMA_VERSION`.
- The SQL of a feature lives beside the feature (`channel-schema.ts`, `workflows/workflow-schema.ts`,
  ...). `SCHEMA_SQL` joins them in one order; a table comes before an index on it.
- A schema change edits the SQL and raises `SCHEMA_VERSION`. It does not change an existing database:
  the developer deletes it, or the app moves to a new data location.

The account service has a second, unrelated database: Cloudflare D1. Its migrations stay, because it
is a live remote database. `apps/auth-api/AGENTS.md` owns it; nothing in this directory touches
`apps/auth-api/migrations/`.

## Size

`mailbox-store.ts` owns mailbox state and database writes. `attachment-files.ts` owns draft and
transfer file operations; it must not import `MailboxStore` or write database state. Keep the staged
generated-attachment map in the store. Apply it to mailbox state only after the atomic conversation
and mailbox commit succeeds. Keep deletion-outbox completion in the store, after file removal.

The two that used to be larger are both worth copying. `agent-service.ts` was split into one
controller per concern, each constructed and owned by the service; `openownbot-database.ts` was split
into modules under `database/`, leaving a ~560-line facade that had to keep its class name, instance
identity, constructor signature and public surface because callers reach past it into `connection`
and `dispatch`. The shape in both: one class per file, kebab-case, `<Name>Options` + `<Name>`,
`readonly #` fields, a constructor that only assigns, and a doc comment saying what the class
**owns** and that it never imports the facade. No barrel file.

Two rules those controllers depend on and a reader cannot infer. They hold the core object and read
`.connection` at each use — a cached handle survives `initialize()` and then silently addresses a
closed database after `close()`. And a projection controller does not open a transaction of its own.
Four places do, and each is load-bearing: `dispatch` and `deleteEventsAndReceipt` open one only if
they find none open, which is what lets a projector nest another dispatch inside the caller's, and
`ThreadReplay.rebuildThreadProjection` and the facade's `persistConversationAndMailbox` open one
unconditionally, which is what makes the dispatch inside each of them skip its own. Open an
unconditional one anywhere else and a caller already in a transaction gets a nested `BEGIN` that
SQLite rejects; remove one of these four and the replay or the mailbox write silently stops being
atomic.

Do not add a new concern to the biggest file you can see; extract one when a change gives you the
excuse.

## The database host process

`agent-data/agent-database-host.ts` is the entry of a separate process, and the only file here that
touches the agents' shared SQLite files. Two rules keep it that way.

**Its runtime imports are limited to `node:*` and `effect`.** Every repository reference in it is an `import
type`, which both the bundler and Node's type stripping erase. The Effect v4 migration explicitly permits Effect; no other runtime dependency is allowed.
This keeps Electron and the `openbot.db` facade out of the host, and it lets a test spawn the `.ts` source under a
real `node` and drive the true host instead of a fake.

**Its isolation is the process, not a thread.** `sqlite3_step` never returns to JavaScript, so a
worker ignores `terminate()` and only a killable process bounds a runaway statement. The supervisor
sends SIGKILL on the deadline and re-dispatches the queued work to a fresh host. A packaged build
ships the `runAsNode: false` fuse, so the production host is an Electron `utilityProcess` rather
than `process.execPath` run as Node; `AgentDatabaseHostProcess` is the seam that carries both.
