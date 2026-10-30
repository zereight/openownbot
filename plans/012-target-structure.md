# Plan 012, phase 3: target structure and design

The shape the rewrite moves the code to. Phase 4 follows it area by area. A rule here can change when
the code shows a better way; change this file in the same PR.

## Today, in numbers (2026-10-31)

- 87 source files have more than 800 lines: 30 in `src/backend`, 22 in `src/main`, 18 in
  `src/renderer/src`, 17 in `packages/ui/src`.
- The largest: `agent-service.ts` (5,144), `agent/provider-runtime.ts` (3,884), `mailbox-store.ts`
  (3,266), `WorkflowCanvas.tsx` (3,186), `browser-host.ts` (3,162), `application-services.ts` (3,059).
- The Team API has eight protocol versions and about 70 capability strings. Mobile uses protocol 3,
  the desktop client protocol 8.

## Rules for the new code

1. **One folder per feature, in each layer.** The folder name is the feature name of
   [the feature map](012-feature-map.md): `src/backend/<feature>/`, `src/main/<feature>/`,
   `packages/ui/src/features/<feature>/`, `src/renderer/src/features/<feature>/`,
   `apps/mobile/src/features/<feature>/`. A reader finds a feature by its name.
2. **Small files.** A file has one job. Aim for less than 400 lines; more than 800 needs a reason in
   the file's first comment.
3. **One owner for each piece of state.** A store owns its tables and files. Other code calls the
   store; it does not read the tables.
4. **No compatibility code.** No reader of an older format, no adapter for an older peer, no
   `legacy` names. A format change raises a version and starts empty (see `SCHEMA_VERSION`).
5. **Plain names.** `agent`, `channel`, `server`, `routine`. No `bot`, no `openbot` in new names.
   The product name is ROBot.
6. **Same boundaries.** The rules of `docs/architecture/structure.md` stay: renderer to
   contracts only, preload without business rules, main decodes untrusted input, provider code sends
   events and never writes UI state. Effect services as `AGENTS.md` says.

## Layers and data flow

```text
renderer (SolidJS)  ──IPC──►  preload  ──►  main: decode input, call a service
       ▲                                      │
       │ events                               ▼
       └──────────── main ◄── backend services (Effect) ──► stores (SQLite, files)
                                              │
                                              ▼
                                      provider programs (Codex, Claude Code, ACP, ...)

phone (Expo) ──WebRTC──► team host in main ──► the same backend services
```

- One IPC group per feature. The group's types live in `packages/contracts/src/ipc-<feature>.ts`.
- One service per feature in `src/backend/<feature>/`. A service that grows a second job splits.
- `agent-service.ts` becomes a small coordinator over feature services: conversation, queue,
  routines, memories, workspace, side threads.

## Team API (phase 4, team client and mobile step)

- One protocol. No version negotiation and no capability strings: desktop host, desktop client,
  web client and phone ship from one commit and speak the same messages.
- Messages are Effect schemas in `packages/contracts/src/team/`, one file per feature. The same
  schema decodes on both sides.
- A peer of another app version gets one clear answer: "update the app". Nothing tries to serve it.
- WebRTC framing and Signal stay; their constants move into the new team folder.

## Design: Discord bot style

The interface follows the layout of a Discord server with a bot such as Grok: agents are bot members
of a server, and the user talks to them in channels and direct messages.

```text
┌────┬───────────────┬──────────────────────────────────────┬──────────────┐
│ R  │ This computer │ # general                         ⌕  │ Agents       │
│    │               ├──────────────────────────────────────┤              │
│ ●  │ CHANNELS      │ (av) Writer  BOT  10:42              │ ● Writer     │
│    │  # general    │      Here is the draft. ...          │   working    │
│ +  │  # research   │      ┌ tool: read_file  notes.md ┐   │ ○ Researcher │
│    │               │      └────────────────────────────┘   │   idle       │
│    │ AGENTS        │ (av) You  10:43                       │              │
│    │  ● Writer     │      Make it shorter.                 │              │
│    │  ○ Researcher │                                      │              │
│    │               ├──────────────────────────────────────┤              │
│    │ (you) ⚙       │ [ Message #general            + 🎤 ] │              │
└────┴───────────────┴──────────────────────────────────────┴──────────────┘
 rail   list           chat                                   members
```

- **Rail** (72 px): one round icon per server. This computer first, then joined servers, then "+".
- **List** (240 px): channels, then agents (as direct messages), then side threads under their agent.
  The user's own row and the settings button stay at the bottom.
- **Chat**: compact rows. Avatar, name, a `BOT` tag for an agent, time. Consecutive messages of one
  author group under one header. Tool calls, plans and attachments are cards under the message, like
  embeds. The composer is at the bottom, with attach and voice buttons.
- **Members** (240 px, can be hidden): the agents in the channel, with their state (working, idle,
  waiting, failed).
- **Colors**: dark first. Backgrounds from darkest to lightest: rail, list, chat. One accent color for
  the selected row, links and the main button. A light theme uses the same layout.
- **Mobile**: the same three levels as screens: servers and list, then chat, then members as a sheet.

This reading of "Discord bot style" is not confirmed by the developer. Phase 4 starts the UI step
with a Storybook story of this layout; the developer can change it there.

## Order of phase 4

1. Backend services and stores, feature by feature, behind the existing IPC.
   Method: `AgentService` exposes a feature service as a property (`service.memories`) and loses its
   forwarding methods; ports that callers declare keep their own shape. Done 2026-10-31: memories; routines, channel memories and channel routines; MCP; provider operations.
2. Main and IPC, feature by feature.
3. Shared UI and renderer in the new design.
4. Team API, team client and mobile together.

Each step keeps the app working: a new module is written beside the old one, the callers move, and
the old module is deleted in the same PR or the next.
