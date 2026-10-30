# Plan 011: A new product that uses OpenOwnBot only as an idea benchmark

> **Status**: REJECTED: not needed. The developer will not sell the product, so the noncommercial
> license already permits every change (see [Second decision](#second-decision-2026-10-31)).

## Second decision (2026-10-31)

The developer stated: no commercial sale. The goal is to change all code freely, so that it is easy to
understand and convenient for the developer. The developer chose to keep working in this repository.

`LICENSE` ("Changes and New Works License", "Noncommercial Purposes", "Personal Uses") permits changes
and new works for any noncommercial purpose. So a rewrite, a new repository and a clean-room process
are not needed for this goal. Two conditions stay:

- Use stays noncommercial.
- A copy given to anyone (a public repository counts) keeps the license terms and the three
  `Required Notice:` lines of `LICENSE` and `NOTICE`.

This is a reading of the license text, not legal advice. A lawyer was not asked.

Changes to the code, design and layout go into new plans in this repository. The developer then chose
an in-place rewrite: see [plan 012](012-in-place-rewrite.md). The sections below are
kept as background only.

## Decision (2026-10-31)

The developer decided: the new product is a full rewrite, not a port. It uses OpenOwnBot only as a
benchmark of ideas (what features exist and what problem each one solves). Its code, its visual
design and its layout are different. This replaces the two-team clean-room method below as the plan
of record. The sections after this one stay as background.

Rules for the new product:

- **New repository**, with no history from this one.
- **No copy** of code, file structure, module split, identifiers, interface text, documentation
  text, icons, images, styles or design tokens from this repository. No line is pasted and then
  edited.
- **No reading the inherited code while writing.** A developer or agent writes from a feature list in
  plain words and from public documents of third-party tools (Codex, Claude Code, ACP, MCP, Electron,
  Expo). The feature list names what a user can do, not how this repository does it.
- **Own design.** New layout, new screens, new visual style, new names for features where possible.
- **Own name and identity.** Not "OpenBot" or "OpenOwnBot".
- **Own wire formats and storage.** No reuse of the Team API protocols or the `openbot.db` schema.
  Reading an old user's data, if wanted later, is a separate importer decision.

Not changed by this decision:

- Ideas, features and general methods are not protected by copyright; the expression in code, text
  and design is. This is general knowledge, not legal advice. A lawyer was not asked.
- The agent that wrote this plan has read the inherited code. The rule "no reading the inherited code
  while writing" lowers the risk; it does not make that agent clean. The developer accepted this.
- The commercial license inquiry (Gate 2) is no longer required. It stays an option.

Open before work starts: the repository name, the product name, the stack, and the first features.

## Status

- **Priority**: P2
- **Effort**: XL (a new product; no estimate yet)
- **Risk**: HIGH (legal and schedule)
- **Depends on**: legal advice, maintainer decision
- **Category**: licensing
- **Reported at**: 2026-10-30

## Why this matters

OpenOwnBot is a fork of OpenBot. The original code is Copyright 2026 Synthetify Labs
spółka z ograniczoną odpowiedzialnością. Its license, PolyForm Noncommercial 1.0.0, does not let
anyone license that code again under other terms (`NOTICE`, `README.md`, "License and
attribution"). So this fork cannot allow commercial use by a change of text. Commercial use of
the inherited code needs one of these:

1. A commercial license from the copyright owner. `NOTICE` names `licenses@openbot.run` for this.
2. Code that is not derived from the inherited code.

This plan covers option 2. Option 1 must be asked first, because it costs far less (see
[Gates](#gates)).

## Non-goals

- This plan does not relicense any file. The license rule in `AGENTS.md` stays in force until
  the developer decides otherwise.
- This plan does not delete or rewrite any inherited file in this repository.
- This plan does not promise that a rewrite is legally safe. Only a lawyer can say that.

## Size of the problem

Measured on 2026-10-30 with `git blame -w --line-porcelain -e` on every tracked file with the
extension ts, tsx, js, mjs, css, sql, swift, kt, mdx or sh. Locale messages, `bun.lock`,
`vendor/`, `patches/` and generated files were left out. A line counts as "fork" when the author
email has `zereight` or `definedable`. Every other line counts as "inherited".

| Area | Fork lines | Inherited lines |
|------|-----------:|----------------:|
| `src` | 25,104 | 336,489 |
| `packages/ui` | 14,831 | 135,076 |
| `scripts` | 10,350 | 96,402 |
| `apps/mobile` | 1,433 | 86,816 |
| `apps/auth-api` | 3,723 | 76,719 |
| `packages/contracts` | 1,619 | 45,222 |
| `packages/team-client` | 210 | 10,554 |
| `marketplace` | 0 | 6,974 |
| `remote` | 132 | 5,716 |
| All areas | 58,499 (about 7%) | 807,310 (about 93%) |

Limits of these numbers:

- The fork share includes inherited lines that the fork edited. The share of fully new code is lower.
- `git blame` can count a rename or a format change as a fork edit. The run did not use `-M` and `-C`
  (move and copy detection), because it did not finish in 600 seconds.
- Third-party code in `marketplace/` and `resources/` is not separated from inherited code.
  Not confirmed. Look at the file headers and the `NOTICE` list.

## Gates

No implementation work starts until all gates are closed. Each gate needs a named owner.

1. **Legal advice.** A lawyer states whether the clean-room method in this plan is enough for
   this project, and what evidence they need. Open questions for the lawyer:
   - Is it lawful to keep the released Team API wire formats (`packages/contracts`) and the
     database schema, so that old clients and old data still work?
   - Does a record of a clean process give enough protection?
2. **Commercial license inquiry.** Ask `licenses@openbot.run` for terms and a price. Do this in
   parallel. If the terms are acceptable, stop this plan and mark it `REJECTED: license bought`.
3. **A clean team.** A person who has read the inherited source code must not write replacement
   code. This includes the current maintainer and every AI agent that had access to this
   repository, so the agent that wrote this plan is not clean. The plan needs people or agents
   that never read the inherited code. Who they are: not decided.
4. **A new repository.** The new product lives in a new repository with no shared history. A branch
   of this repository keeps the inherited history and is not clean.

## Method

Two separate teams work with one controlled hand-over.

- **Spec team.** It may read the inherited code and the running app. It writes behavior specs:
  what a user or a client sees, the data it stores, the errors it shows. A spec has no code, no
  identifiers from the inherited code, no file structure and no copied text. A reviewer who is not
  on the spec team checks each spec for these before it goes to the clean team.
- **Clean team.** It never reads the inherited code. It gets only the reviewed specs, public
  documents of third-party tools (Codex, Claude Code, ACP, MCP, Electron, Expo), and the output of
  the running app. It writes the new code in the new repository.
- **Record.** The repository keeps a log of each hand-over: the spec, the reviewer, the date. It also
  keeps the list of people and agents on each team.
- **Check before release.** A black-box E2E suite runs against the old and the new app and
  compares behavior. A code similarity scan compares the new tree with the inherited tree. A scan
  hit is a defect to fix, not a note to ignore.

## Phases

Order follows dependency. Sizes use the inherited line counts above as a rough guide, not as an estimate.

1. **Inventory.** Rerun the blame with `-M` and `-C`. Separate third-party and vendored code from
   inherited code. List every user-visible behavior and every stored data shape.
2. **Contracts and data.** Specs for the Team API wire formats (v1 to v3), the database schema
   and the legacy import. The new app needs an importer for `openbot.db`: user data is never lost
   (see the migration rules in `AGENTS.md`).
3. **Core services** (`src`, 336k inherited lines): agent runtime, queues, mailbox, provider
   adapters, Effect-based services, embedded browser.
4. **Shared UI and desktop renderer** (`packages/ui`, 135k): behavior specs from the running app.
5. **Mobile** (`apps/mobile`, 87k) and **team client** (`packages/team-client`, 11k).
6. **Account service** (`apps/auth-api`, 77k) and **Signal** (`remote`, 6k).
7. **Scripts and checks** (`scripts`, 96k). Start the black-box E2E suite in phase 2 and grow it in
   every phase, because it is also the proof for the method.
8. **Release.** New product name, identity and license. A separate data migration from the old
   app folder.

## Risks

- A person on the clean team has read the inherited code before. One such person can void the method.
  Ask each person in writing, and record the answer.
- Specs can leak structure. A spec that lists internal names or module splits is a copy in prose.
- Compatibility pulls the new code toward the old code: same wire format, same schema, same
  UI. Gate 1 must decide how much sameness is acceptable.
- The scale is a new product of about 800k lines. The fork has 58k. No estimate exists yet.
- This public plan tells readers of the repository about the intent. The maintainer decides when to publish it.

## STOP conditions

- Gate 2 ends with acceptable commercial terms.
- Legal advice says the method is not enough for this project.
- No clean team can be named.
