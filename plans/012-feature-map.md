# Plan 012, phase 2: feature map

The list of what a user can do today, in plain words. It is the target of the rewrite and the check
that no wanted feature is lost. Each row names where the feature lives today, for reference only.

How this list was made (2026-10-31): from the 637 desktop IPC channels in
`packages/contracts/src/ipc-endpoints.ts`, the renderer feature folders, and the 100 mobile routes in
`apps/mobile/src/app`. A row exists because a channel or a route exists for it. The words in "The user
can" were read from channel names, route names and the code near them. They were not checked in the
running app. Rows marked ❔ are less sure.

**Keep** is the default for every row. To drop a feature from the rewrite, change its mark to **Drop**.
Phase 4 rewrites only rows marked **Keep**.

## 1. Agents

| Feature | The user can | Today | Mark |
| --- | --- | --- | --- |
| Agent list | See every agent in the sidebar, open one, reorder them, put them in sections, pin them. | `agent:list`, `agent:get-sidebar-layout`, `agent:mutate-sidebar-layout`, `agent-sections:*` | Keep |
| Create an agent | Make an agent with a name, a provider, a model and an effort. Let the app write its profile. | `agent:create`, `agent:generate-profile` | Keep |
| Agent profile | Change the name, avatar, instructions, model and effort. | `agent:save-profile`, `agent:set-avatar`, `agent:update` | Keep |
| Duplicate, delete, hide | Copy an agent with its workspace; delete one; hide one and restore it later. | `agent:duplicate`, `agent:delete`, `agent:hidden:*` | Keep |
| Workspace and folders | Each agent has its own folder. Add more folders, exclude paths, browse and open files. | `agent:folders:*`, `agent:list-workspace-directory`, `agent:open-workspace-file` | Keep |
| Memories | See, add, edit and delete what the agent remembers; mark a memory essential or searchable; clear all. | `agent:list-memories`, `agent:create-memory`, `agent:set-memory-inclusion`, `agent:clear-memories` | Keep |
| Skills | See and turn on skills of an agent; install, write and publish skills. | `agent:list-installed-skills`, `skills:*` | Keep |
| Session settings | Set per-agent options of the provider session; reset them. | `agent:session-settings:*` | Keep |
| Backup models | Name models to use when the main one fails. | `agent:admin:get-backup-models`, `update-backup-models` | Keep |
| Templates | Install an agent from a template or a link; publish one as a template. | `agent-templates:*` | Keep |
| Marketplace agents | Browse, preview, install and submit agents. | `marketplace-agents:*` | Keep ❔ |
| Custom agents (ACP) | Add an agent program that speaks ACP; check it works. | `custom-agents:*`, `acp-registry:*` | Keep |
| Import | Import agents and skills from a file, or from a Hermes profile. | `agent-import:*` | Keep |
| Usage and analytics | See tokens, cost and activity per agent. | `agent:get-usage`, `agent:get-analytics` | Keep |

## 2. Conversations

| Feature | The user can | Today | Mark |
| --- | --- | --- | --- |
| Chat | Send a message to an agent and read its answer while it streams, with tool calls, plans and subagents shown. | `agent:send-message`, `agent:read-conversation*`, `conversation-*` contracts | Keep |
| Attachments | Attach files, images, PDFs, zip and video; download and open them; preview files the agent wrote. | `agent:choose-attachments`, `agent:import-attachments`, `agent:open-attachment`, `agent:preview-*` | Keep |
| Message queue | Queue messages while the agent works; edit, reorder, cancel, or steer one into the running turn. | `agent:list-queue`, `agent:edit-queued-message`, `agent:reorder-queue`, `agent:steer-queued-message` | Keep |
| Stop | Interrupt the running turn. | `agent:interrupt` | Keep |
| Side threads | Start a second conversation of the same agent; rename, fork, archive, reopen, delete it. | `agent:tasks:*` | Keep |
| Side question | Ask a quick question beside the chat without adding it to the conversation. | `agent:ask-side-question` | Keep |
| Approvals and prompts | Answer an agent that asks for approval or a choice; set automatic approval. | `agent:respond-to-approval`, `agent:respond-to-prompt`, `app:approval-automation` | Keep |
| Context | Compact or clear the context of a conversation. | `agent:compact-context`, `agent:clear-context` | Keep |
| Search | Search messages and files of conversations. | `agent:search-conversation-messages`, `agent:search-conversation-files` | Keep |
| Reactions and links | React to a message; copy and open a link to a message. | `agent:set-message-reaction`, `agent:paste-message-link` | Keep |
| Read state | Unread marks per conversation. | `agent:mark-conversation-read` | Keep |
| Chat windows | Open a conversation in its own window. | `app:open-chat-window` | Keep |
| Voice | Dictate a message (local model or API); hear answers read aloud. | `voice:*` | Keep |
| Busy message mode | Choose what a message sent during a turn does: queue or steer. | `app:set-busy-message-mode` | Keep |

## 3. Routines, workflows and events

| Feature | The user can | Today | Mark |
| --- | --- | --- | --- |
| Routines | Give an agent a task on a schedule; pause, resume, test, see runs; choose what a missed run does. | `agent:create-routine`, `agent:list-routine-runs`, `agent:routine-calendar` | Keep |
| Routine results | Send the result of a run to a chosen place; resend it. | `routine-results:*` | Keep |
| Routine flows | Link routines so the result of one starts the next, on a canvas. | `routine-flows:*` | Keep |
| Workflows | Build a graph of steps with triggers; run it, run one step, retry, stop, see versions and runs. | `workflows:*` | Keep |
| Webhook events | Start a routine from a webhook; filter events; send a test event; rotate the secret. | `events:*` | Keep |
| Routine feed | A feed of routine output to read in one place. ❔ | `routine-feed:*` | Keep ❔ |
| Waits | See what an agent waits for, and cancel it. | `agent:list-waits`, `agent:cancel-wait` | Keep |
| Decision model | Choose the model that makes small decisions for the app, and test it. | `decision-model:*` | Keep |

## 4. Channels and messaging apps

| Feature | The user can | Today | Mark |
| --- | --- | --- | --- |
| Channels | Make a group chat of several agents; read it; send commands; delete it. | `agent:channels:*` | Keep |
| Channel memories and routines | Give a channel its own memories and routines. | `agent:channel-memories:*`, `agent:channel-routines:*` | Keep |
| Discord | Connect a Discord server; agents answer there; choose which roles may use them. | `messaging:*discord*` | Keep |
| Slack | Connect a Slack workspace. | `messaging:*slack*` | Keep |
| Telegram | Connect a Telegram chat. | `messaging:*telegram*` | Keep |
| Shared tables | Tables that agents share; list and delete them. | `shared:*` | Keep |

## 5. Browser and computer use

| Feature | The user can | Today | Mark |
| --- | --- | --- | --- |
| Agent browser | Watch the tabs an agent uses; open, navigate, reload, close them. | `browser:*` | Keep |
| Take control | Take a tab from the agent, act in it, and give it back. | `browser:take-control`, `browser:release-control`, `agent:respond-to-browser-takeover` | Keep |
| Picture in picture and dock | Keep a small live view of the browser over other windows. | `browser:picture-in-picture-*`, `browser-dock:*` | Keep |
| Browser profiles | Separate profiles with their own sign-ins; clear browser data. | `agent:admin:*browser-profile*` | Keep |
| Sign-in import | Sign in in a local browser and bring the session to the agent. | `browser:local-sign-in-*` | Keep |
| Secrets in pages | The agent asks to fill a saved secret; the user allows or refuses. | `agent:respond-to-browser-secret` | Keep |
| Computer use | Let an agent control the computer, with the needed system permission. | `computer-use:*` | Keep |
| Remote desktop | See and control the desktop of the host from another device. | `remote-desktop:*` | Keep |

## 6. Secrets and connectors

| Feature | The user can | Today | Mark |
| --- | --- | --- | --- |
| Vault | Save passwords and keys; reveal, copy, delete; import a CSV. | `vault:*` | Keep |
| 1Password | Connect 1Password so agents can read chosen items. | `onepassword-connector:*` | Keep |
| Bitwarden | Connect Bitwarden. | `bitwarden-connector:*` | Keep |
| GitHub | Connect GitHub and choose repositories. | `github-connector:*` | Keep |
| MCP servers | Add MCP servers, sign in to them, turn them on and off, test them. | `servers:mcp:*` | Keep |

## 7. Providers

| Feature | The user can | Today | Mark |
| --- | --- | --- | --- |
| Provider sign-in | Sign in to Codex, Claude Code and the other providers, by browser, code or API key; several accounts. | `provider-admin:*`, `app:connect-provider*` | Keep |
| Provider runtimes | Download, update and remove the provider programs that the app runs. | `provider-runtimes:*`, `app:update-provider-cli` | Keep |
| Custom providers | Add a provider that speaks an OpenAI-compatible API. | `custom-providers:*`, `provider-admin:*custom-provider` | Keep |
| Model discovery | Find local model servers and agent programs on the computer. | `provider-detection:*` | Keep |
| Usage limits | See plan limits and when they reset; reset usage counters. | `app:provider-usage-resets`, `provider-admin:account-usage` | Keep |
| Prompt cache | Choose how long the provider keeps the prompt cache. | `host-admin:*prompt-cache-ttl` | Keep |

## 8. Team, servers and other devices

| Feature | The user can | Today | Mark |
| --- | --- | --- | --- |
| Host a team server | Let other people and devices use this computer's agents; start and stop it. | `host:*` | Keep |
| Members and invites | Invite people by email or link; set roles; remove members. | Team API `team/*` routes | Keep |
| Sessions | See signed-in devices and sign one out. | `host:list-sessions`, `host:revoke-session` | Keep |
| Agent access | Choose which members may use which agent. | `agent-access` contract | Keep |
| Join other servers | Connect to another person's server and use its agents; reorder, mute, set notifications. | `servers:*` | Keep |
| Direct messages | Write to another member of a server. | `servers:*direct*` | Keep |
| Presence | See who is online and typing. | `servers:presence`, `servers:set-typing` | Keep |
| Host settings | Time zone, memory limit, memory review, update of a remote host. | `host-admin:*` | Keep |
| Hosted servers | Rent a server in the cloud that runs the app; create, restart, wake, delete. | `hosted-servers:*` | Keep ❔ |
| Hosted sites | Publish a folder as a website. | `hosted-sites:*` | Keep |
| Web client | Use a server from a web browser. | `src/renderer/src/features/web-client` | Keep |
| Mobile connect | Pair the phone with a QR code or link; see and remove connected phones. | `auth:*mobile-connect*` | Keep |

## 9. Account and app

| Feature | The user can | Today | Mark |
| --- | --- | --- | --- |
| Account | Sign in with an email code; change name and avatar; see and end sessions. | `auth:*` | Keep |
| Billing and license | See the plan; open the billing portal; buy users. | `billing:*`, `license:*` | Drop ❔ (no commercial use, plan 011) |
| Onboarding | First start: choose providers and make the first agent. | `app:save-setup`, `src/renderer/src/features/onboarding` | Keep |
| Appearance | Theme, logo color, interface size, language (English, Korean). | `app:*-preference` | Keep |
| Notifications | Choose which events notify; test a notification. | `notifications:*` | Keep |
| Dynamic island | A small status bar near the notch that shows agent work and actions. | `dynamic-island:*` | Keep |
| External links | Choose the browser that opens links. | `app:*external-link*` | Keep |
| App updates | Check, download and install an update; restart when idle. | `update:*` | Keep |
| Storage | See disk use; clear caches; remove old runtime versions. | `storage:*` | Keep |
| Transfer | Export this computer's data and import it on another. | `instance-transfer:*` | Keep |
| Diagnostics | Export data and diagnostics; open logs. | `maintenance:*` | Keep |
| Plugins listing | Open a plugin listing link. ❔ | `plugins:*` | Keep ❔ |

## 10. Mobile app

The phone reaches a desktop host through the account service and Signal, then talks to it over WebRTC
(`packages/team-client`). The phone reads conversations from the host. It keeps only an outbox of messages not yet sent, and caches.

| Feature | The user can | Today (route under `apps/mobile/src/app/(app)`) | Mark |
| --- | --- | --- | --- |
| Sign in and pair | Sign in with an email code; add a server by QR code or link. | `add-server`, `scan-qr-code` | Keep |
| Server list | See servers and their agents and channels. | `index`, `features/servers` | Keep |
| Chat | Chat with an agent: text, attachments, camera, voice; see code previews. | `chat/[agentId]`, `code-preview` | Keep |
| Queue | See, edit and act on queued messages. | `queued-messages/*` | Keep |
| Side threads | Start and read side threads. | `new-task`, `task/[taskId]`, `server-tasks` | Keep |
| Channels | Read and write in channels; add a channel; channel memories and routines. | `channel/*`, `channel-info/*`, `add-channel` | Keep |
| Agent info | Profile, appearance, files, memories, permissions, routines, runtime, skills, tables, usage, publish. | `agent-info/[agentId]/*` | Keep |
| Add and install agents | Create an agent; install one from a template. | `add-agent`, `install-agent` | Keep |
| Browser | Watch and use the agent's browser tabs. | `browser/[agentId]`, `browser-tabs` | Keep |
| Workflows | See, edit and run workflows. | `server-workflows/*`, `workflow-editor/*` | Keep |
| Server settings | Providers, connectors, MCP, vault, storage, sites, time zone, updates, logo. | `server-settings/*` | Keep |
| Routines and usage | See routines and usage of a server. | `server-routines/*`, `server-usage` | Keep |
| Hosted server | Set up or join a hosted server. | `hosted-server/*` | Keep ❔ |
| Hidden and deleted chats | Restore hidden chats; see deleted ones. | `hidden-chats`, `deleted-chats` | Keep |
| Push and Live Activities | Get notifications; see a running agent on the lock screen. | `features/push-notifications`, `features/live-activity` | Keep |
| App lock | Lock the app with a PIN or the device unlock (such as Face ID). | `settings/app-lock*` | Keep |
| Share and links | Share text and files into a chat; open message and invite links. | `share`, `incoming-share`, `incoming-link` | Keep |
| Quick actions | Home screen shortcuts. | `features/quick-actions` | Keep |
| Search | Search agents and chats. | `features/search` | Keep |
| Settings | Profile, appearance, animations, haptics, language, notifications, sessions, support log, about. | `settings/*` | Keep |

## Not a user feature

These exist to support the old product and are not part of the target: compatibility adapters of the
Team API, the commercial license screens, and development tools (`dev:*` scripts). Phase 5 decides on
the scripts.
