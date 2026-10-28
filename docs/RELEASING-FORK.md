# Releasing OpenOwnBot

This is the release process of the OpenOwnBot fork. [RELEASING.md](RELEASING.md) describes the
original project's pipeline, which signs and notarizes the apps, uses Azure Artifact Signing, pushes a
Docker image to the original organization, deploys to Cloudflare and posts on Discord. The fork has
none of those credentials, so that pipeline cannot run here. Do not follow it.

This process makes unsigned desktop packages, checks them, and publishes them by hand as a GitHub
Release. Publishing is a decision of a person: no step below publishes by itself.

**Status.** The commands come from `package.json` and were not run for this document. The first
release must be done once as a rehearsal on a draft release, and this file corrected with what
differed.

## What the users get

- Unsigned packages. macOS shows a warning on first launch and Windows shows SmartScreen. See
  [Install notes](#install-notes-for-unsigned-builds).
- No automatic updates. `LOCAL_ONLY` turns the update check off, and the guard refuses the original
  project's release feed. A user updates by downloading the next release.
- The license of the code is the PolyForm Noncommercial License 1.0.0. `LICENSE` and `NOTICE` are inside
  the package (`electron-builder.yml`, `files`), as the license requires.

## Decisions to make before the first release

Until these are made, the process assumes the answer in bold.

1. **Application identity.** `electron-builder.yml` still has `appId: app.openbot.desktop` and
   `productName: OpenBot`, and the `openbot://` link scheme. Two problems follow. An OpenOwnBot and an
   OpenBot installed on one computer are the same application to the system and compete for the
   `openbot://` links. And the data folders are named after the product (`~/Library/Application
   Support/OpenBot`, `~/OpenBot`), so renaming the product moves the data away from the people who
   already use the fork. **Decide before publishing: a new `appId`, `productName` and scheme, together
   with a migration of the data folder.** A release with the old identity is possible, and it keeps
   the data, but it conflicts with the original app.
2. **Default branch.** The fork's `main` is the original project's state, 175 commits behind `zereight`,
   and `main` is an ancestor of `zereight`, so `main` can be fast-forwarded. A visitor of the public
   repository sees `main` first. **Make `zereight` the default branch, or fast-forward `main` to it.**
   Both change what the public sees, so ask for it explicitly.
3. **Tags.** **`oob-<upstream version>-<number>`, for example `oob-0.52.0-1`.** The tag does not match
   `v*.*.*`, the pattern that starts the original release workflow, and the number does not collide
   with the original project's tags (the fork carries `v0.7.0` to `v0.52.0`). The application version
   in `package.json` stays the upstream base version. A new number would be easier to read, but
   `package.json` changes every time the original project releases, and compatibility checks between
   the app, the host and the phone app may read the version. That risk was not checked.

## One-time repository setup

1. Gate the original workflows to the original repository, as `cla.yml` already is: add
   `if: github.repository == 'nightly-labs/openbot'` to the jobs of `release.yml`,
   `release-android.yml`, `release-ios.yml`, `cloudflare-preview.yml`, `status-page.yml`,
   `norbiai-review.yml`, `mobile-release-announcement.yml` and the others that need the original
   project's secrets. Until this is done, do not enable Actions on the fork, and never push a `v*.*.*`
   tag.
2. Set `publish.owner` and `publish.repo` in `electron-builder.yml` to this repository, so that the
   `app-update.yml` inside a package does not name `nightly-labs`. The update check is off, but the
   file stays in the package and tells a reader that the package updates from the wrong place.
3. Check that the repository has Issues enabled if you want reports there. It has them off now.

## Before each release

Run these on the commit to release, on a clean checkout of the branch:

```sh
git status --short                    # nothing
bun install --frozen-lockfile
bun run typecheck:node && bun run typecheck:renderer
VITE_CONFIG_NATIVE_IGNORE_WARNING=true bunx vitest run
bun run check:local-only
```

Then check by hand:

- `packages/contracts/src/local-only.json` has `{ "localOnly": true }`.
- `LICENSE` has both Required Notice lines, and `NOTICE` has the fork statement.
- `README.md` states the network use as in [network use](network-use.md). That page does not exist
  until the measurement in backlog item B38 is done: **do not publish before it exists**, because the
  README must not claim more than what was measured.
- The release notes are written (see below).

## Build

A package is built on the operating system it is for. macOS packages cannot be built on Linux, and the
Windows installer needs Windows.

```sh
bun run dist:mac        # macOS, unsigned (identity null, no notarization); files in dist/
bun run dist:win        # Windows x64 NSIS installer, on Windows
bun run dist:linux      # Linux x64 AppImage, on Linux
```

Check each package before it goes anywhere:

```sh
bun run verify:package          # macOS; `verify:package:win` and `verify:package:linux` for the others
```

Then start the package on a computer that has never run the app, with the network monitor of that
computer open, and do the manual checks in [Smoke test](#smoke-test).

## Name the files and write the checksums

The builder names every file `OpenBot-<version>-<arch>.<ext>`, and the version is the same in every
fork release. Rename the files so that a user can tell the releases apart:

```sh
tag=oob-0.52.0-1
cd dist
rm -f ./*.blockmap latest*.yml    # update metadata; nothing reads it, so it must not be uploaded
for f in OpenBot-*; do mv "$f" "OpenOwnBot-${tag#oob-}-${f#OpenBot-*-}"; done   # check the result by eye
shasum -a 256 OpenOwnBot-* > SHA256SUMS.txt
```

The loop turns `OpenBot-0.52.0-arm64.dmg` into `OpenOwnBot-0.52.0-1-arm64.dmg` (tested on empty files).
Keep `SHA256SUMS.txt` with the files, and upload only those.

## Release notes

Write them by hand in `docs/release-notes/<tag>.md`, in plain language: what changed since the previous
fork release, which upstream changes were taken (from the ledger of backlog item B38), what is known
not to work, and the install notes. State the license and that the build is unsigned.

## Smoke test

On a clean user account or computer:

1. The app starts and the first-run screen shows the OpenOwnBot name.
2. With the network monitor open, leave it idle for five minutes. No request goes to `openbot.run`,
   `openbot.site`, `nightly-labs` or `u.expo.dev`.
3. Add one provider you own, send one message, and get an answer.
4. Create an agent, restart the app, and check that the agent is still there.
5. Quit the app and check that no helper process stays.

If one step fails, do not publish. Fix it, and build again.

## Publish

Create the release as a draft first and look at it as a visitor would:

```sh
git tag -a oob-0.52.0-1 -m "OpenOwnBot 0.52.0-1"        # on the checked commit
git push origin oob-0.52.0-1
gh release create oob-0.52.0-1 --draft --verify-tag \
  --title "OpenOwnBot 0.52.0-1" --notes-file docs/release-notes/oob-0.52.0-1.md \
  dist/OpenOwnBot-* dist/SHA256SUMS.txt
```

Open the draft in the browser. Check the files, the notes, and that a download from a private window
matches `SHA256SUMS.txt`. **Publishing the draft is the step that cannot be taken back**: people may
download the files at once, and a deleted release can still be cached. Only publish when the person
who owns the repository says to.

## Install notes for unsigned builds

Put these in each release's notes.

- **macOS.** The app is not signed or notarized, so the first launch is refused. Open **System
  Settings > Privacy & Security** and choose **Open Anyway**, or run
  `xattr -dr com.apple.quarantine /Applications/<app name>.app` once.
- **Windows.** SmartScreen shows "Windows protected your PC". Choose **More info**, then **Run anyway**.
- **Linux.** `chmod +x OpenOwnBot-*.AppImage`, then run it.

## Taking a release back

- A bad release that is still a draft: delete the draft and its tag (`git push origin :refs/tags/<tag>`).
- A bad release that was published: mark it **pre-release**, put a warning on top of its notes, and
  publish the fixed release with the next number. Do not move or reuse a tag, because the checksums of
  people who already downloaded it would no longer match.

## Taking changes from the original project

Cherry-pick by feature and run the rename script afterwards, as described in the cherry-pick procedure
of backlog item B38. Release after a pick only when the checks in
[Before each release](#before-each-release) pass again.
