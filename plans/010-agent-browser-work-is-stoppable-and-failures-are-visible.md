# Plan 010: Work of an agent can always be stopped, and its kind and failure are visible

> **Status**: IN PROGRESS. Goals 1, 2 and 5 are done in the working tree on
> 2026-10-28 (Stop shows with the working line, a queue turn id is used, and a
> toast says why when no turn is known). Goals 3, 4 and 6 are open. Goal 6 is done for a
> routine run on 2026-10-30: the working line names the routine when it has no step text. The
> current tool name was already shown. The workflow run kind is open and needs a contract decision
> (see the findings of 2026-10-31). Goal 4 is done for the log on
> 2026-10-30: `logs/browser/browser.log` records failed tool calls, stop requests, stop results and
> browser warnings. Settings › General › Diagnostics › Logs opens the logs folder of this computer
> and shows its path (done 2026-10-30). The logs of a remote host are not reachable from there.

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

## Third case (2026-10-28): the sidebar keeps "working" after a restart

After the app restarted during work, the chat showed the stopped task with
Continue and Reassign, but the sidebar row kept the "working" badge. The user
noticed only by opening the chat.

Checked, not yet explained:

- The sidebar badge is `isAgentWorking` (`packages/ui/src/features/sidebar/sidebar-agent-states.ts`):
  an active turn, a queue hold, or a delivery that is `starting` or `running`.
  A channel row counts tasks in state `running` (`src/backend/channel-store.ts`).
- `ChannelService.recover` marks an active assignment `interrupted` and its task
  `paused`, which lifts the hold. It skips an assignment whose delivery is still
  `starting` or `running`, as a live turn.
- The dev database after the earlier restart had no stale row: 7 paused tasks
  count as idle, and the one running task had a running assignment.

Evidence from the dev database (2026-10-28, channel "[과제] 자체 성능 측정 메커니즘 구축 cc RUM",
agent `agent-c78695df`): delivery `f8ed645a` was `running` while its assignment
`652b12c8` was already `interrupted`. The sidebar reads deliveries
(`isAgentWorking`), the chat reads the task state, so one showed "working" and the
other showed the stopped card. A later Continue created assignment `28be15ce` with a
new delivery, and `f8ed645a` is no longer `running`. Suspects: `complete()` with
status `interrupted` (`channel-service.ts` near line 2014) and `recover`, which set the
assignment state without settling the delivery in the same step.

Next step: reproduce with a restart during a channel task, then compare the
sidebar inputs (`activeTurns`, `queues`, `activeTasks`) with the stored rows.

Goal 7 (channel row done 2026-10-28: `pausedTasks` in the channel summary and a
"Stopped" preview prefix; the agent-name row is still open): a task that a restart stopped shows in the sidebar as stopped, with the
same wording as the chat ("needs you"), and never as working.

## Findings of 2026-10-31 (code reading at `dded5a78b`, nothing reproduced)

- **Goal 6, current tool**: already done for a conversation turn. `toolProgressText`
  (`src/backend/agent/turn-lifecycle.ts`, line 1549) sends each tool step as `turn-progress`, and the
  working line shows it as `activityDetail` (`activity-store.ts`). Nothing to add.
- **Goal 6, workflow run kind**: open, and it needs a contract decision. `QueueDelivery.sender` has the
  kinds `user`, `agent` and `routine` (`packages/contracts/src/ipc-queue.ts`). The workflow code
  (`src/backend/workflows/`) sets none of them. A new kind crosses the Team API to remote hosts, and a
  released adapter must keep its meaning, so a new kind needs a capability and a fallback for older
  hosts. Decide before coding.
- **Goal 7, agent row**: the queue `hold` is attached to a snapshot only when the queue has a `queued`
  delivery (`queueSnapshot` in `src/backend/agent/mailbox-sync.ts`), and `queueHoldChanged` emits the
  queue of each agent that has one (`src/backend/agent-service.ts`, line 1190). So a hold that ends
  does not leave a stale badge through this path. `recover` also does not call `#releaseHeldAgents`
  after it pauses a task, but the badge does not read it. The remaining suspect is the observed
  state: a delivery that stays `running` while its assignment is `interrupted`. Only a reproduction
  can show who leaves it `running`.
- **Goal 3, warning badge**: the sidebar has no error badge. The nearest signal is the `failed` avatar
  mood (`packages/ui/src/features/agents/agent-avatar-mood.ts`), which reads `failedTurns`. Which
  element the user saw is not confirmed. A screenshot of the badge, or the agent and browser state
  at that time, is the input that this goal needs.

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
