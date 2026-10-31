# `packages/contracts`

The IPC channel list, the IPC payload types, and the frozen Team API wire protocol. Everything here
is a contract someone else already implements — a shipped desktop build, a remote host, a renderer
mock — so the cost of a change is paid by code you cannot edit.

## Team API protocol

- The desktop host, the desktop client, the web client and the phone ship from one commit and speak
  one protocol: `TEAM_PROTOCOL_RANGE` in `src/team-protocol/current.ts`. A peer on another protocol
  gets `426` with `client_update_required` or `host_update_required`. Keep no adapter for an older
  peer ([plan 012](../../plans/012-in-place-rewrite.md)).
- Never use the application SemVer as a wire protocol version; application versions are diagnostic
  metadata only.
- Use capabilities for optional behaviour; a missing capability disables only its own feature.
  Every client sends the full `TEAM_CURRENT_CAPABILITIES` list, and a peer reads at most 128.
- Do not serialize current IPC types across the boundary. The `v*-base` files hold the wire
  vocabulary that the protocol codec (`v8-adapter.ts`) reuses.
- Provider ids and auth kinds are open values (`OPEN_PROVIDER_ID`): a new provider needs no protocol
  change. The host hides only an agent that the codec cannot describe
  (`src/main/team-api/agent-visibility.ts`).
- Malformed known payloads fail closed as `protocol_error`. Unknown optional events are ignored.

## One channel list, two mirrors

`src/ipc-endpoints.ts` declares every endpoint in `IPC_ENDPOINTS`: its wire value, its group,
and whether it is a **request** the renderer invokes or an **event** the main process sends.
Nothing else in the repository decides those facts. Main and the preload pass the endpoint object,
such as `IPC_ENDPOINTS.auth.event`, and read `.channel` from it; they do not write a wire value.
`ipc-channel-coverage.test.ts` fails when two endpoints share one wire value.

Two files still mirror the list, and they are not enforced the same way.

| Mirror | What it is | What holds it |
| --- | --- | --- |
| `src/preload/index.ts`, bridged groups | one `bridgeGroup(IPC_ENDPOINTS.group, decoders)` per group; the decoder map is keyed by every endpoint | `tsc` (`TS2741` / `TS2353`), and the coverage test for the group reference |
| `src/preload/index.ts`, hand-written groups | the `invokeAgentForServer`, `ipcRenderer.invoke` and `listen` calls | `src/main/security/ipc-channel-coverage.test.ts` |
| `src/renderer/src/preview/mock-openownbot.ts` | the second implementation Storybook and the preview run against | `tsc`, against `OpenOwnBotDesktopApi` |

The main process is no longer one of them. `registerIpcGroups` in `src/main/ipc/define-ipc-group.ts`
takes one object per group, keyed by every request endpoint in it, so a channel with no handler is
`TS2741`, a handler for an endpoint that does not exist is `TS2353`, and a group no registrar covers
is `TS2741` at `src/main/index.ts`. `src/main/AGENTS.md` has the shape to copy.

A typed endpoint (`request<Payload, Result>()`, `event<Payload>()`) also sets the renderer
signature. Declare its `OpenOwnBotDesktopApi` method as `Invoke<typeof IPC_ENDPOINTS.group.name>` or
`Subscribe<...>`. Then a payload or result change in `ipc-endpoints.ts` reaches the interface, the
preload and the mock without a second edit. Declare a server-scoped endpoint with
`scopedRequest<Input, Result>()` or, when it carries only the server, `scopedQuery<Result>()`;
`request` does not compile with an `AgentIpcRequest` payload. Main receives
`AgentIpcRequest<Input>`. The renderer signature is `(input: Input, serverId?: string)`, or
`(serverId?: string)`, because the preload builds the scope and uses the selected server when the
caller names none. Pass `"required"` as the last type argument when a caller must always name the
server, such as a settings panel that can show a server the user has not switched to. Write the
signature by hand only when the method reshapes its arguments or reads preload state, or for
`browserInput.sendLiveViewInput`, the one untyped endpoint.

A group whose methods all pass straight through is generated whole: `GroupApi<IpcEndpoints["group"]>`
gives its interface, a request keeps its key, and an event is `on` and the key (`voice.modelStatus`
is `onModelStatus`). The preload builds it with `bridgeGroup`,
so a new endpoint in it needs no line in `ipc-desktop-apis.ts`. `IPC_GROUP_PATHS`, beside
`IPC_ENDPOINTS`, gives the place of each group on `window.openownbot`: its own key, `""` for the top
level (`app` and `providers`), a shared path (the agent groups are all `agent`), or null for a group
the page must not reach (`attachmentImports`). `OpenOwnBotDesktopApi` is built from this table, so a new
group needs no line in `ipc-desktop-apis.ts` either. The built-preload verifier
reads the same table. There are no per-method overrides in `bridgeGroup`. When a method must read or set
preload state, bridge the group into a const outside the API object, spread it, and write only that
method next to the spread. `agent` and `servers` do this: the server list calls record the selected
server, and `onPresence`, `onDirectMessage` and `onDirectTyping` narrow the `onScoped*` events to
one server. The untyped endpoint has its own group, `browserInput`, so `browser` can be bridged.
Only `attachmentImports` stays by hand: only the preload calls it, with the paths of dropped files,
and the renderer must never reach it. The eight agent groups are spread
into `agent`, so their keys are the renderer names (`agent.listAgents`, `mcpServers.saveMcpServer`).

In a hand-written group the preload is still the link no type pairs with an endpoint. Its API object
is nested and renamed, so a channel it never invokes is dead trust-boundary surface that compiles.
`ipc-channel-coverage.test.ts` reads the preload sources and asserts they invoke exactly the request
endpoints and subscribe to exactly the event ones, counting a bridged group as all of its endpoints.

The mock needs no test. Both it and the preload bridge are annotated `: OpenOwnBotDesktopApi`, so a
missing method is `TS2741` and a method the interface never declared is `TS2353` — the type checker
already covers both directions, and the root Tests rule against assertions that TypeScript already
enforces ends it there. What it cannot cover is
the *behaviour*: `mock-openownbot.ts` is a product surface, not a test double, and it is what the preview
and every Storybook story exercise. A method that satisfies the type by returning an empty array is a
story that silently shows nothing.

Adding a channel means `ipc-endpoints.ts`, its registrar, the preload and the mock in the same
change. You do not have to remember that list: add the channel, and
`bun run typecheck:node` and `bun run typecheck:renderer` name every step but the preload call of a
hand-written group.
