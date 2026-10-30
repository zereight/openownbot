# Plan 002: TanStack Start, Solid 2, Cloudflare Workers and D1

## Goal

The central account server runs as a separate TanStack Start application with
Solid 2. Cloudflare Workers hosts the application. D1 stores users, short-lived
sign-in data and OpenOwnBot sessions.

## Account contract

- A unique email address identifies the user to the hosts.
- The API sends a one-time code in the `XXXX-XXXX` format.
- The code uses 32 safe characters and carries about 40 bits of entropy.
- The code is valid for 10 minutes and can be used only once.
- D1 stores only a hash of the code.
- The API neither accepts nor stores an OpenOwnBot password.
- The API stores only a hash of the OpenOwnBot session token.
- Electron stores the encrypted session token through `safeStorage`.

## Limits

- At most 5 new codes per email within 15 minutes.
- At most 20 new codes per IP within 15 minutes.
- At least 60 seconds between codes for the same email.
- At most 5 failed attempts per code.
- At most 30 verification attempts per IP within 15 minutes.

## Flow

1. Electron sends the email to `POST /v1/auth/email/start`.
2. The API stores the code hash and the expiry in D1.
3. The delivery adapter hands the code to the email service.
4. The user types the code into the app.
5. Electron calls `POST /v1/auth/email/verify`.
6. The API consumes the code and returns an OpenOwnBot session.

## Connection to the host whitelist

- The next stage changes a team member into `centralUserId + email + role`.
- The host stores neither the password nor the nickname of a member.
- The central API issues a short, signed ticket for one specific host.
- The host validates the ticket and the local email or user ID whitelist.

## Commands

Checked on 2026-10-31 against `package.json` and `scripts/dev-services.ts`. The first version of this
list named `bun run api` and `bun run host`; neither script exists now.

- `bun run dev:api` starts the local Worker and D1.
- `bun run dev` starts the Electron client (the API, the Signal service and the app).
- `bun run dev:test-client` also starts a second client, in place of the old `host` script.
- `bun run dev:all` starts the API, the Signal service and the app.
- `bun run api:migrate:local` applies the local D1 migrations.
- `bun run api:deploy` deploys the Worker once the Cloudflare configuration is set.

## Local password sign-in: findings and options (2026-10-31)

Checked by reading code at `bb1e59935`. Nothing was run, and no installed host was inspected.

### What the code does now

- The host stores a scrypt hash and salt for a member in the team store file
  (`passwordHash`, `passwordSalt` in `src/main/team-store.ts`). The file is JSON (`StoredTeam`,
  `version: 1`), not SQLite.
- Two functions write a hash: `configure` and `changePassword`. Two functions read it: `login` and
  `changePassword`. Nothing else in `src`, `packages` or `apps` touches it.
- `configure(serverName, username, password)` has no caller in `src`. The app, mobile connect and the
  hosted bootstrap all call `configureWithAccount`. Only `scripts/team-api-routes-e2e.ts` calls
  `configure`. So a new host, and a member who joins by account, never gets a hash.
- The host serves `POST /v1/auth/login` and `POST /v1/auth/password` (`team-api-server.ts` line 723,
  `team-api/route-team.ts` line 44). Both are in the frozen v1 codec
  (`packages/contracts/src/team-protocol/v1.ts`) and in `provider-aware-codec.ts`.
- No client in this repository calls them: the desktop remote server manager uses
  `auth.account`, and a search of `apps/mobile` and `packages/team-client` found no password call.
  Four E2E scripts use `auth/login`: `team-api-routes-e2e.ts`, `team-session-revoke-e2e.ts`,
  `channel-notifications-e2e.ts` and `agent-hide-restore-e2e.ts`.
- `POST /v1/join` with a password is in the frozen codec. A search of `src/main` found no handler for
  it. Not confirmed outside `src/main`.
- Not confirmed: which released clients, outside this repository, still send a password; and how many
  installed hosts have a member with a hash and no `accountId`.

### Why removal is not safe yet

1. A member from before accounts has a hash and may have no `accountId`. For that member the password
   is the only way in. Removing the sign-in locks the member out. `AGENTS.md` says user data must be
   kept and that no backup exists, so a lock-out cannot be undone by a restore.
2. `/v1/auth/login` and `/v1/auth/password` belong to released adapters. `packages/contracts/AGENTS.md`
   allows removal only after a separate architecture decision, a changelog entry, update
   instructions, an E2E check of both update directions and clear UI text.
3. Deleting a stored hash is a data change that cannot be reversed.

### Options

**A. Keep (recommended).** Treat "the host stores no new password" as met: new hosts and members have
no hash. Keep the two routes and the legacy hashes. Mark this stage DONE with the exception written
down. Cost: the host keeps a sign-in path that the plan did not want. Risk: none new.

**B. Refuse the password for a bound member.** `login` refuses a member who has an `accountId`. The
hash stays on disk. A legacy member with no `accountId` still signs in. Cost: an old released client
that signs in with a password as a bound member fails with the existing "login incorrect" text. This
changes what a released route does, so it needs the developer decision and an E2E check with an old
client.

**C. Drop the hash when a member binds to an account.** `loginWithAccount` and `#applyAccount` delete
`passwordHash` and `passwordSalt`. Irreversible. Needs fixtures of a team store file with a legacy
member, tests for the write failure and the rollback, and a check that `activateAccount` still
adopts an owner-less host.

**D. Remove the routes and the code.** Needs the architecture decision of `packages/contracts/AGENTS.md`
and all of C first. A legacy member with no account must have a way to bind (a one-time invitation by
email) before this step. Not recommended before A, B and C have shipped and a release has passed.

### Order if the developer chooses to go on

1. A now. Update this plan and `plans/README.md`.
2. Before B or C, count legacy members: add a local, redacted log line that records how many members
   have a hash and no `accountId` (no names, no emails). Release it, then read the result from
   support reports. The product sends no telemetry, so there is no other count.
3. B, with an E2E script that signs in with an old client. Done on 2026-10-31.
4. C, with migration fixtures.
5. D only after a decision.

### Decision (2026-10-31)

The developer chose option B. An earlier answer, "1", named no letter, and option A was assumed for a
short time. B replaces that assumption.

B is done in code. `TeamStore.login` refuses the password of a member who has an `accountId`, with the
answer of a wrong password (`error.team.loginIncorrect`). It checks the hash first, so both refusals
take the same time. The hash stays in the file. A member with no `accountId` signs in as before.
`scripts/team-password-login-e2e.ts` (`bun run test:team-password-login`) checks this on a real host:

- It failed on the code before the change: a member with an account signed in with the email address
  and the old password (status 200).
- It passes after the change, for a client of the oldest protocol and a client of protocol 7, and after
  a restart of the host. The account sign-in still works and the hash is still in the file.

What B does not do, and what is not checked:

- `changePassword` (`POST /v1/auth/password`) still works for a member with an account who knows the
  old password. It makes a hash that no sign-in can use. It was not part of B, so it is unchanged.
- An old released client that signs in with a password as a member with an account now fails. The test
  uses the wire format of the oldest protocol, not a real old build. Which real builds do this is not
  confirmed.
- The E2E script is not run by this fork's CI (`ci.yml` has no E2E lane). It ran locally once.
- No count of legacy members was made first (step 2 of the order above). The developer's choice
  replaces that default. A member with an account is not locked out of the account sign-in, so no
  member loses access unless the member has an old client that cannot sign in with an account.

### Account contract check (2026-10-31)

Read in `apps/auth-api/src/server/auth-service.ts`, `d1-auth-repository.ts` and
`packages/contracts/src/validation.ts`. Nothing was run.

| Statement of the plan | Code |
|---|---|
| Code format `XXXX-XXXX`, 32 safe characters | `ONE_TIME_CODE_LENGTH = 8`, alphabet of 32 characters, `generateOneTimeCode` |
| Valid for 10 minutes | `CHALLENGE_TTL_MS = 10 * 60_000` |
| D1 stores a hash of the code | column `code_hash` |
| 5 new codes per email, 20 per IP in 15 minutes | `start:email` 5, `start:ip` 20, `RATE_WINDOW_MS = 15 * 60_000` |
| 60 seconds between codes | `RESEND_COOLDOWN_MS = 60_000` |
| 5 failed attempts per code | `maxAttempts: 5`, `failed_attempts` |
| 30 verifications per IP | `verify:ip` 30 |

Not checked: that the code is used only once, that the session token is stored only as a hash, and that
Electron keeps the token through `safeStorage`.

