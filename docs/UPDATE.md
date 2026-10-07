# Managed updates (0.1.8 experimental)

`dot-connector update` updates only a separate managed WSL/Linux installation using the existing `/usr/bin/node` 22 runtime. It does not update development checkouts, legacy source copies, Windows native prepared artifacts, applications, global Node, or global npm packages. The installed launcher remains stable; release code and dependencies live in separate version/commit directories. There are no symlinks into development.

## First installation when starting from 0.1.6

Version 0.1.6 has no update command and cannot update itself. Keep that verified copy and its state untouched. Obtain the new source in a fresh checkout, detached at the full 40-character commit published in the selected release, verify that identity, then run its core-Node bootstrap script. The bootstrap itself needs no npm install in that source checkout:

```sh
git clone https://github.com/osmelpv/dot-connector.git "$BOOTSTRAP_SOURCE"
git -C "$BOOTSTRAP_SOURCE" checkout --detach "$RELEASE_SHA"
test "$(git -C "$BOOTSTRAP_SOURCE" rev-parse HEAD)" = "$RELEASE_SHA"
/usr/bin/node "$BOOTSTRAP_SOURCE/scripts/install-managed.mjs" --root "$INSTALL_ROOT" --version 0.1.8
"$INSTALL_ROOT/dot-connector" version
"$INSTALL_ROOT/dot-connector" status
```

Choose distinct absolute paths outside development and application repositories. BOOTSTRAP_SOURCE and INSTALL_ROOT must not already exist; INSTALL_ROOT's parent must exist and be a canonical directory without symlink components. No global PATH modification is needed. The executable is INSTALL_ROOT/dot-connector; an optional shell-local PATH entry can make `dot-connector` directly available. Bootstrap rejects an existing root and never adopts or cleans it. If it fails after creating its root, it retains staging and its lock for inspection; choose a new root after resolving the cause. Do not delete existing native claims or attempt records.

## Commands

```sh
"$INSTALL_ROOT/dot-connector" update --check --version 0.1.8
"$INSTALL_ROOT/dot-connector" update --version 0.1.8
"$INSTALL_ROOT/dot-connector" update --rollback
```

`--check` resolves a published GitHub release and validates its manifest/tag binding without downloading the source archive or changing the active version. An explicit numeric version selects that published release, including an experimental prerelease. Without `--version`, the default channel is stable. GitHub's latest stable release is selected; if its endpoint returns HTTP 404, the command succeeds with `available:null`, `changed:false`, `updated:false` and `reason:NO_PUBLISHED_RELEASE_IN_CHANNEL`. Network errors, rate limits and missing tag/manifest/assets remain failures. No prerelease is promoted to stable.

Opt into this project's experimental releases explicitly:

```sh
"$INSTALL_ROOT/dot-connector" update --check --channel experimental
"$INSTALL_ROOT/dot-connector" update --channel experimental
```

The experimental channel selects only published, non-draft prereleases with strict numeric X.Y.Z tags. It compares numeric major/minor/patch values, not lexical order or publication date; `0.10.0` sorts after `0.9.0`. It validates the selected release again by tag and applies the same commit, manifest and checksum checks. Empty channels return no candidate. Listing is bounded to three pages of 100; a full third page or an ambiguous selected tag refuses rather than guessing. Automatic channel selection never downgrades the active version. A changed commit under the same installed version is refused. `--version` and `--channel` are mutually exclusive: an explicit version is a separate pinned choice, including an intentional older published version. Branches, arbitrary commits, URLs and bare pushed tags are not update targets. Updating to the active version is a verified no-op. JSON is emitted on stdout; dependency output is suppressed.

Downloads come only from the fixed osmelpv/dot-connector GitHub repository and recognized GitHub release-asset hosts, with bounded sizes, timeouts and redirects. The requested release's Git tag resolves to the manifest commit. Archive SHA-256, available GitHub asset digests, every source file hash, package name/version, paths and file types are checked. Links, path traversal, duplicate files and unsupported tar extensions are rejected. The Git archive commit-comment header is explicitly supported. SHA-256 gives integrity and consistency under trust in GitHub and this publisher; it is not a signature or independent publisher authentication.

Dependencies install in the new release only, using the locked npm dependencies, `npm ci --ignore-scripts`, a private managed cache, empty managed npm config files and the public npm registry. Existing user npm credentials/config are not loaded by that install. Source is rechecked before invoking the release version health check and before activation. A temporary current.json is atomically renamed to activate a release; the prior pointer is retained. Failed activation/health attempts restore the prior pointer. Normal update failures preserve the active release, with failed staging retained for inspection.

## Sessions, state and rollback

Every managed CLI invocation holds the same exclusive lifecycle lock. Update/check/rollback is refused while a managed session or command is active. Conversely a session cannot start during update. Use the stable launcher for managed commands: direct managed CLI sessions refuse a missing lease. Close a session normally with the JSONL close command before updating. Interrupted, killed or uncertain child cleanup and unconfirmed rollback retain the lock; stale locks are never automatically expired or removed. Recovery requires explicit operator inspection of owned processes and pointer state. Neither a timeout nor a PID check is treated as proof that descendants have stopped.

This lock coordinates this managed installation. Old 0.1.6 sessions and separately prepared native adapters are separate installations: the updater neither controls nor modifies them, their locks, grants or claims. Do not run two installations against the same target or infer that an update transferred target ownership. There is no automatic ARM, reconnect, native window selection, native binary rebuild or migration of live sessions.

The stable `user/` directory is reserved for opaque local config, custom profiles and credentials; the updater does not enumerate, read, migrate, print or overwrite its contents. Existing external config/state paths remain external and must be supplied explicitly when the connector needs them. Bundled profiles belong to each code release. If tracked code or bundled profiles are edited, integrity validation refuses the update; it does not overwrite those edits. Extra files in old release directories remain there and are not automatically adopted by a new release. Keep user overrides at stable external paths instead of editing release code. These preservation rules do not imply automatic configuration migration.

`update --rollback` verifies the previous local release and dependencies' version health, switches the pointer without network/download, and retains the displaced release. It refuses if there is no previous release, altered source or an active lock. The first 0.1.7 bootstrap has no previous managed version: rollback to 0.1.6 means using its unchanged original path after closing managed sessions. Never copy its old claims/grants into the new installation. Release directories are immutable by updater convention, not tamperproof against same-account programs; installed dependency trees are not recursively authenticated on every invocation.

## Evidence and scope

Unit/integration tests cover corrupt checksum, network/preparation failures, partial activation and postactivation health rollback, config/profile/credential retention, unsafe archives, stage mutation, existing-root refusal and a real launcher/session conflict. Remote release responses and update versions in failure tests are synthetic fixtures. Publication validation separately checks a real GitHub bootstrap, diagnostic invocation and release check/no-op. Native UIA/input is not executed. Managed updating is Linux/WSL-only; the Windows native artifacts remain manual and separate.

Primary references: [GitHub release REST API](https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name) and [npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci/).

## Upgrade from managed 0.1.7

The existing 0.1.7 launcher can install this fix using its already supported pinned version command:

```sh
"$INSTALL_ROOT/dot-connector" version
"$INSTALL_ROOT/dot-connector" update --version 0.1.8
"$INSTALL_ROOT/dot-connector" version
"$INSTALL_ROOT/dot-connector" update --check
"$INSTALL_ROOT/dot-connector" update --check --channel experimental
"$INSTALL_ROOT/dot-connector" status
```

Do not pass --channel to 0.1.7: that option becomes available after activation of 0.1.8. The installation root and stable launcher stay the same; the previous 0.1.7 release is retained for rollback. This path is an actual version upgrade when the starting version is 0.1.7, unlike reinstalling the currently active version.
