// A side thread is a second conversation of one agent that runs next to its own chat: the agent keeps
// its identity, workspace and memories, and the thread has a provider session of its own. The agent's
// own chat (`projection_agents.thread_id`) has no row here.
//
// `projection_agent_threads`: one row for each side thread. Deleting the thread deletes the row.
// `origin` says who started it:
// the person, or the agent with its `start_task` tool. `title_source` says where the title came from:
// the first message (`auto`), the agent's `start_task` call (`agent`), or a rename (`user`). `outcome`
// is the end of the last turn, null before its first turn ends. `error` is the redacted provider error
// of the last failed turn; a new turn clears it. `archived_at` is set when the person or the agent
// archives the thread; an archived thread takes no message until it is restored. A forked thread names the
// thread it was copied from and the last message it copied; both are null for a thread that is not a fork.
// They have no foreign key: deleting the source thread must not change the fork.
//
// The title lives only here: the roster rewrites `projection_threads.title` to the agent name.
export const AGENT_THREAD_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS projection_agent_threads (
    thread_id TEXT PRIMARY KEY REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    origin TEXT NOT NULL CHECK(origin IN ('user', 'agent')),
    title TEXT NOT NULL,
    title_source TEXT NOT NULL CHECK(title_source IN ('auto', 'agent', 'user')),
    outcome TEXT CHECK(outcome IS NULL OR outcome IN ('completed', 'failed', 'interrupted')),
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    last_event_sequence INTEGER NOT NULL,
    forked_from_thread_id TEXT,
    forked_from_message_id TEXT
  );
  CREATE INDEX IF NOT EXISTS agent_threads_open ON projection_agent_threads(agent_id, updated_at DESC)
    WHERE archived_at IS NULL;
  CREATE INDEX IF NOT EXISTS agent_threads_agent ON projection_agent_threads(agent_id, created_at DESC);
`;
