# Pinned WSL installation (experimental 0.1.7)

This release is a local/repo plugin package, not an npm publication or a listing in the universal plugin directory. Its `.codex-plugin/plugin.json` compatibility manifest references `.mcp.json`. The MCP command is the existing WSL `/usr/bin/node` (Node 22), with `cwd` set to the installed plugin root. The entrypoint exposes only `terminal_status`: it reports version and unavailable terminal capabilities. It does not inspect or control terminals, inherit `DOT_STATE`/`DOT_WEZTERM`, create session locks, spawn native workers or touch a consumer application. Concurrent diagnostic servers therefore cannot share a target: neither can bind one.

## Install an exact published commit

Select the full 40-character SHA from the release, not a mutable branch or tag alone. Use a new absolute release directory outside both development and application repositories. Clone GitHub into that directory, detach at the selected SHA, and verify `git rev-parse HEAD`. Never use `npm link`, a live symlink, a shared `node_modules`, or a global install. No runtime or PATH replacement is required.

```sh
git clone https://github.com/osmelpv/dot-connector.git "$RELEASE_DIR"
git -C "$RELEASE_DIR" checkout --detach "$RELEASE_SHA"
test "$(git -C "$RELEASE_DIR" rev-parse HEAD)" = "$RELEASE_SHA"
cd "$RELEASE_DIR"
/usr/bin/node --version # must be 22.x for this plugin entrypoint
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
npm run smoke:plugin
```

`RELEASE_DIR` must not exist before cloning. Variables above are explicit operator inputs, not defaults pointing at another project. Dependencies install only in that checkout. Source archive SHA-256 accompanies the GitHub release; compare it before extracting an archive alternative. The Git source includes the lockfile; `npm pack` is a packaging audit and is not the locked Git installation path. Build manifests hash plugin metadata, sources, profiles, scripts and dependency manifests.

## Registration versus installation

For a compatible local Codex client, the repository contains `.agents/plugins/marketplace.json`, whose local source is the release root. Register that exact local marketplace through the client's supported plugin interface, then install `dot-connector` and start a new session. Client support and registration are separate from the SDK smoke test. Do not modify internal caches or invent configuration keys to force loading. OpenCode 1.18.33 has successfully connected the diagnostic MCP from the ArtisanFeed directory using process-only inline configuration. This does not depend on Codex CLI. No persistent client registration or autonomous native control was established.

For a stdio MCP client, the concrete launch configuration is `/usr/bin/node` with an absolute argument to the installed `src/plugin-server.mjs`; use the installed root as working directory and no terminal-state environment variables. An SDK handshake is not proof of client registration. A cloud client cannot reach local stdio merely because the package exists; no public listener, tunnel or credential is created here.

## Coexistence, update and rollback

Keep each release in its own immutable source checkout with its own dependencies. Keep the preceding verified directory. Update by installing a new SHA into a new directory, checking its checksums and handshake, then changing only the authorized client registration to that absolute path after coordinating restart. Rollback restores the preceding registration; do not rewrite the development checkout or the application's dependencies. Do not clear existing operation journals or consumed manual attempt locks.

No session configuration is copied in this release. Future control integration must allocate a new session/state directory and exclusive target ownership rather than copying development `session.json`. The raw experimental server's per-state-directory input lock does not prevent two copied state directories from naming the same target; it is therefore not the plugin entrypoint. Native manual probes remain user-run experiments, outside MCP dispatch. Registering MCP does not override execution policy or supply a missing computer-use runtime.

## ArtisanFeed first check

Run only the isolated release's `smoke:plugin` from an external consumer fixture. Do not edit ArtisanFeed, use its `node_modules`, change Node/Docker/app dependencies, read its credentials, run its app or attach to its terminals. Report this as isolated consumer validation, not an ArtisanFeed-installed or dot-connected result. A temporary OpenCode MCP connection from ArtisanFeed was verified with other MCPs disabled for that process; Git diffs and configuration hashes were unchanged. Persistent registration remains a separate step.

## Primary references

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) and [compatibility manifest specification](https://github.com/openai/plugins/blob/main/.agents/skills/plugin-creator/references/plugin-json-spec.md).
- [Supported plugin surfaces and installation](https://learn.chatgpt.com/docs/plugins). Product/runtime policy still applies to plugin tools.

## Native manual adapter in 0.1.5

The default plugin still exposes only diagnostic `terminal_status`. The separately user-launched Windows adapter exposes `terminal_status`, `terminal_snapshot`, `terminal_input` (paste or separately approved submit) and `terminal_pause`. It is not automatically loaded by `.mcp.json`.

From a pinned Windows source checkout with existing Windows Node/npm and .NET Framework x64, run `scripts/prepare-native-manual.ps1 -Destination <new-absolute-directory>`. This compiles the host, installs the unchanged locked dependencies into that new directory and runs a no-GUI self-test. It never launches the consumer. It refuses existing destinations and does not copy session state or credentials. Keep the source checkout and generated hashes for provenance; build output is separate from any running test. Run the generated `manual-native-mcp.mjs` only under the manual procedure in NATIVE-MCP-INTEGRATION.md. No consumed claim or attempt is automatically cleared.

## Local execution CLI

After pinned installation, run `node scripts/dot-connector.mjs status` from any working directory using the script's absolute path. The [CLI protocol](CLI.md) provides persistent JSONL sessions and separate human setup; no plugin registration or global install is needed. Local execution permissions still apply. Native CLI end-to-end input remains untested.

## Managed update command

For `dot-connector update`, bootstrap a new isolated managed root using [UPDATE.md](UPDATE.md). Legacy 0.1.6 checkouts have no updater; keep them unchanged. The managed launcher serializes sessions against updates and retains prior versions for rollback.
