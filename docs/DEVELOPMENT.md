# Development and distribution cycle

1. Make a small change in the connector repository only.
2. Run `npm ci --ignore-scripts` and `npm run verify`. The build checks native JavaScript syntax and JSON profiles and writes a deterministic SHA-256 manifest. It does not transpile or bundle dependencies.
3. Review `git diff --check`, `git diff`, and the complete proposed staged file list. Run the package allowlist/heuristic secret check. Also inspect source, tests, lockfile, and documentation for credentials and personal configuration; automated matching is not a proof of absence.
4. Bump the version with `npm version patch --no-git-tag-version` when the release content changes, then rerun verification. Commit the source, tests, package lock, and documentation. Do not add a license without an explicit choice by the owner.
5. Fetch the authorized GitHub remote, preserve its existing commits and README, and push a normal fast-forward commit. Never force-push. Record the full 40-character commit SHA as the consumption version.
6. Consume that exact SHA in a separate local checkout. Use `npm ci --ignore-scripts`, not a mutable branch, `npx latest`, a global runtime install, or npm publication. Keep the previous checkout for rollback.
7. Validate MCP initialization and tool listing first. Only after the visible terminal connection works should an explicitly announced dedicated-window test run. Coordinate before every AI prompt.
8. Fix failures in this repository, verify, commit, push, and repeat with a new SHA. Do not patch a consumer checkout or application code to hide a connector defect.

## GitHub checkout and rollback

Choose a sibling tools/releases directory outside any application repository. Clone the authorized GitHub repository there, fetch the chosen full SHA, and check it out detached. Verify `git rev-parse HEAD` equals that SHA before `npm ci --ignore-scripts`. Launch the MCP server by its absolute `src/server.mjs` path. Record the commit and the Node version used. Lockfile integrity values protect the downloaded dependency contents; this is a pinned install, not a guarantee that all operating-system behavior is identical.

Keep the preceding verified checkout intact. Rollback means restoring the consumer's server command to that checkout after coordinating any client restart. No package should be copied into the application repository. Client configuration changes need their own authorized scope.

## First application-side validation

ArtisanFeed is a consumer candidate, not a development target. The first validation should only initialize MCP and list tools from an external checkout. Do not edit or commit ArtisanFeed, install dependencies into it, run its app, adopt its terminals, read arbitrary pane contents, or interfere with an existing Claude Code session. A working MCP handshake alone does not prove dot can access this server or control a terminal.

## Visible-resource protocol

Before every action that may open a visible window/process, tell the user what will appear and why. This is advance notice, not a request to repeat approval for an already authorized action. While tests are paused, do not open, close, or send input except for specifically authorized cleanup. Close owned resources when finished or no longer needed, or tell the user why they remain. Verify identity before cleanup and verify absence before saying a window is closed.

## Publication exclusions

Do not publish terminal binaries, vendor directories, node_modules, screenshots, logs, operation journals, session IDs, local configuration, credentials, or private evidence. `npm pack` uses a small allowlist. Git staging needs its own review because npm's allowlist does not constrain Git. Never commit broad workspace staging directories. The repository is public but currently has no granted open-source license; `UNLICENSED` is intentional, and npm publishing is disabled with `private: true`.
