# Plan 010: Work of an agent can always be stopped, and its kind and failure are visible

> **Status**: IN PROGRESS. Goals 1, 2 and 5 are done in the working tree on
> 2026-10-28 (Stop shows with the working line, a queue turn id is used, and a
> toast says why when no turn is known). Goals 3, 4 and 6 are open.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: reliability, observability
- **Reported at**: 2026-10-28

## Why this matters

A Teams agent was operating a browser and showed a warning badge. The user
could not see which error caused it, and could not stop the agent: `Esc` did not
work and no stop button appeared. The only way out was to kill the app process.

Observed on 2026-10-28:

- The warning badge has no detail view (no error text in the UI).
- No stop control while the browser work was running.
- `~/Library/Application Support/OpenBot/logs` had no entry from the run (last
  write was 2026-10-27 12:37Z), so the logs did not explain the badge either.
  The run may have used the development build with a different userData path;
  that was not confirmed.

## Goal

1. **Stop**: while an agent works in a browser (including a Teams agent), the UI
   always shows a stop control, and `Esc` triggers it. A stop request ends the
   browser operation even when the provider turn is stuck.
2. **Reason**: when stopping is not possible, the UI states why (for example the
   turn is not owned by this host, or the browser view is detached).
3. **Error detail**: the warning badge opens the error text, the time and the
   source (agent, tool, browser view).
4. **Log**: every browser warning, error, stop request and stop result writes a
   line to `logs/` of the active userData path, and the UI shows that path.

## Second case (2026-10-28, Android Dev agent)

The conversation showed the working indicator ("한 단계씩 진행 중... 15초") and two
queued messages, but the composer was empty and showed the send arrow, not the
stop button. The user could not stop the work and could not tell what kind of
work it was.

Reading of the code (not yet reproduced):

- `SendControl` in `src/renderer/src/features/conversation/ConversationComposer.tsx`
  shows stop only when `activeTurnId` is set and the composer is empty. The
  composer was empty, so `activeTurnId` was most likely null while the indicator
  still showed work.
- `activeTurns` is written only by the `turn-started` event, `turn-completed`,
  and the runtime snapshot (`src/renderer/src/features/agents/agent-event-bridge.tsx`
  lines 219, 234, 384). The indicator reads other state (turn progress, queue).
  When the two disagree, the UI shows work with no way to stop it.
- Work that is not a conversation turn (routine run, workflow run, channel
  task) may have no turn id at all.

Additional goals:

5. **One source of truth**: the stop control is shown whenever the working
   indicator is shown. If no stoppable turn id exists, stop falls back to
   interrupting all work of that agent.
6. **Kind of work**: the indicator names the work (conversation turn, routine,
   workflow run, channel task, browser) and the current tool or step.

## Where to look first

- `src/backend/browser-host.ts`, `src/main/browser-view-gateway.ts`
- `src/renderer/src/features/conversation/` (stop button, `Esc` handling, badge)
- `src/main/provider-log.ts`, IPC `browser:*` and `agent:channels:command`
  (the last one returned `error` in `trace.ndjson` before the quit)

## Acceptance

- A test where a browser tool call never returns: the stop control is visible and
  stop ends the call within a bounded time.
- A test where stop is refused: the UI shows the reason.
- A browser error produces both a badge detail and a log line.
- Add a file to `changelog.d/`.

## STOP conditions

- The cause is a provider limit that the host cannot change: report it, and keep
  goals 2 to 4.
