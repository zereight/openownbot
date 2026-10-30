# Plan 012: Rewrite OpenOwnBot in place, as a first version

> **Status**: IN PROGRESS: decisions recorded on 2026-10-31. Phase 1 is next.

## Status

- **Priority**: P1
- **Effort**: XL (about 860k lines today; no estimate)
- **Risk**: HIGH (scale; loss of compatibility is accepted)
- **Depends on**: none
- **Category**: architecture
- **Reported at**: 2026-10-31

## Decisions (developer, 2026-10-31)

1. **In place.** The rewrite changes this repository. No new repository and no parallel app directory.
2. **No compatibility.** The new code does not read the data of earlier builds (`openbot.db`, the team
   file, `bots.json`, legacy imports) and does not speak the released Team API protocols. Desktop and
   mobile ship together and use one protocol.
3. **Same stack.** Electron, SolidJS, Effect, Bun, Expo.
4. **Scope.** Desktop and mobile. The account service (`apps/auth-api`) and Signal (`remote/api`) stay
   because mobile reaches the desktop host through them; they are rewritten only where the protocol
   change needs it.
5. **Goal.** Code that the developer can understand and change easily. Write it as a first version: no
   code exists only to support an older build.
6. **No commercial use** (plan 011). `LICENSE` and the `Required Notice:` lines stay.

## Rules that change

These rules of `AGENTS.md` were non-negotiable. This plan replaces them by the developer's decision:

- "Migrations are irreversible ... support every shipped source schema." Replaced by: the new code
  starts from one current schema. It does not migrate old data.
- "Released Team API adapters are permanent." Replaced by: one current protocol. Old adapters,
  frozen codecs and fixtures are deleted.
- Released names (`bot`, `botId`, `bots.json`) may be renamed.

One rule is added so that nothing is deleted by accident:

- **The new code uses a new data location** (a new file name or folder). It never deletes, moves or
  writes the data of an earlier build. The developer deletes old data by hand when they want.

The other non-negotiable rules stay: the renderer-to-main trust boundary, secret redaction, and the
license.

## Phases

Each step is one PR, merged when CI passes. Each phase makes the code smaller before it makes it new.

1. **Delete compatibility.**
   - Database: replace the baseline and every migration with one schema for new databases at the new
     data location. Delete the migration tests and fixtures, the schema history file and the parity
     test.
     Done 2026-10-31: `prepareDatabaseSchema` and `SCHEMA_VERSION = 1`. A database made by the new code
     has the same tables, columns, foreign keys, checks, indexes and triggers as one made by the old
     code (137 objects compared); only `schema_migrations` became `database_info`.
   - Legacy imports: `bots.json`, `legacy-import`, the old team file import, `reconcileHost`.
     Done 2026-10-31, with the move of `~/OpenBot/Bots`, the pre-rename `bot-` ids, `mailbox.json`, the
     owner-less host adoption and the stored password fields.
   - Old format readers: done 2026-10-31. Removed the `bot` key renames of messages and the mailbox,
     the `OpenBot/Bots` path prefixes and workspace rebase, the `bot-` id remapping of sidebar pins,
     sidebar layout and browser tabs, version 1 sidebar and browser files, and the model-prefix guess
     of an agent's provider. Left: the `legacy_task_id` column, which is a schema change.
   - Team API: moved to phase 4 on 2026-10-31. The protocol versions are not adapters for peers that
     are gone: they are the codec layers in use. Mobile requests protocol 3 (`mobile-workspace-context.tsx`),
     the desktop client uses the highest common version (8), and the WebRTC channels and frame sizes
     are protocol 2 constants. Removing them is a rewrite of the codec, the team client and mobile, so
     it goes with the team client and mobile step.
   - Account service D1 migrations stay: D1 is a live remote database, not user data on this computer.
2. **Map the product.** One page per feature in plain words: what the user does and sees. This is the
   target for later phases, and the list to check that no wanted feature is lost.
   Done 2026-10-31: [012-feature-map.md](012-feature-map.md), one row per feature, each marked Keep
   or Drop by the developer.
3. **Target structure.** A short document: the modules, who owns what, and the data flow from the
   renderer to main to the backend, and from mobile to the host. Small modules with one job each.
   Done 2026-10-31: [012-target-structure.md](012-target-structure.md), with the design of decision 10.
4. **Rewrite by area,** in this order: backend data and agent runtime (`src/backend`), main process and
   IPC (`src/main`, `src/preload`, `packages/contracts`), shared UI and renderer (`packages/ui`,
   `src/renderer`), team client and mobile (`packages/team-client`, `apps/mobile`). New layout and design
   are part of the UI step.
5. **Clean up.** Remove scripts, checks and documents that no longer apply.

## More decisions (developer, 2026-10-31)

7. **Backup.** The branch `main-backup` keeps `main` as it was before the rewrite (`c7d27ad98`). Do not
   delete or move it.
8. **Languages.** English and Korean only. The other 11 catalogs are deleted in phase 1.
9. **Checks.** The E2E scripts are chosen again after phase 2: one or more per feature on the list.
   Until then, a script that only checks deleted behavior is deleted with that behavior.
10. **Design.** In the style of a Discord bot such as Grok on Discord: a server and channel layout,
    a chat column where agents post as bot members, compact message rows. The exact reading of this
    style is not confirmed; phase 3 shows a draft for the developer to accept.
11. **Order.** The phases below, in this order.
12. **Name.** The product is **ROBot** (Rapid Open Bot). The new data location is `ROBot`: `appData/ROBot`
    for the app data, `appData/ROBot Dev …` for development profiles, and `~/ROBot` for agent workspaces.
    The copy of the old `OpenBot` app data folder is deleted. The rename of the product in the interface,
    the packages and the build follows in its own step.
    Done 2026-10-31 for the interface text (`ROBot` in the en and ko catalogs, the wordmarks and the
    mobile about screen). Still `OpenOwnBot`: `productName`, the app id, installer and artifact names,
    hosted-server paths under `/opt/OpenOwnBot`, the webhook headers `X-OpenOwnBot-*`, the mobile
    bundle and native module names, and the `@robot/*` package names.

## Risks

- The developer's own data of earlier builds is not shown by the new code. It stays on disk.
- A long rewrite in place leaves `main` in a mixed state between phases. Each PR must still build and
  run.
- A feature can be lost without a list. Phase 2 is that list.
