# dot-connector

Experimental terminal connector. The default plugin reports installation status
only and starts no terminal. Published prerelease 0.1.13 provides an opt-in synthetic tmux session,
bounded MCP text snapshots, local configuration and human discovery.
This branch adds unreleased opt-in ordered output and an observer. Cloud-to-local
delivery and arbitrary terminal adoption remain **not verified**.
GentleShell JSONL RPC is not a shared terminal or proof of adopting its tabs.

## Install an isolated runtime

Requirements: existing Linux/WSL, Node 22, npm, git, and tmux for synthetic tests.
No Windows helper, profile, firewall, service or permission changes are needed.
The installer downloads public GitHub release assets and locked npm dependencies
with lifecycle scripts disabled. It never asks for a ChatGPT key.

From a new directory, choose fresh absolute paths outside project repositories:

```sh
BOOTSTRAP_SOURCE="$HOME/dot-connector-bootstrap-0.1.13"
INSTALL_ROOT="$HOME/dot-connector-bridge-review"
git clone --branch v0.1.13 --depth 1 https://github.com/osmelpv/dot-connector.git "$BOOTSTRAP_SOURCE"
node "$BOOTSTRAP_SOURCE/scripts/install-diagnostic.mjs" --root "$INSTALL_ROOT" --version 0.1.13
"$INSTALL_ROOT/dot-connector" version
"$INSTALL_ROOT/dot-connector" status
```

The root parent must exist. Existing roots are refused. This verifies published
tag/commit, manifest, archive SHA-256, source hashes and health before activation.
Hashes provide integrity under trust in GitHub/publisher, not an independent
signature. This installs runtime only; it does not register/enable an MCP plugin.
Do not use `install-managed.mjs` for this synthetic path: under WSL that older
wrapper also prepares Windows helpers. [Installation details](docs/LOCAL-INSTALL.md).

## Update, rollback and removal

```sh
"$INSTALL_ROOT/dot-connector" update --check --version 0.1.13
"$INSTALL_ROOT/dot-connector" update --version 0.1.13
"$INSTALL_ROOT/dot-connector" version
"$INSTALL_ROOT/dot-connector" update --check --channel experimental
"$INSTALL_ROOT/dot-connector" update --rollback
```

Rollback requires a previous installed version. Use the stable launcher, close
its owned sessions first, and do not delete uncertain lifecycle locks. Keep the
original plugin/runtime separate. The updater switches only this root and leaves
external user settings untouched. A plugin pinned to an absolute release path
does not automatically follow the pointer; review its path after upgrades.
Disable/remove only the experimental identity in the host before removing its
own runtime; preserve configuration unless explicitly deleting it. Coordinate
desktop restarts. [Full update and recovery contract](docs/UPDATE.md).

## Local configuration and CLI/API

Resolve the installed release directory without guessing its commit suffix:

```sh
RELEASE_DIR=$(node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const root=process.argv[1]; const p=JSON.parse(fs.readFileSync(path.join(root,"current.json"))); console.log(path.join(root,"releases",p.directory));' "$INSTALL_ROOT")
cd "$RELEASE_DIR"
node scripts/private-config.mjs init --file "$HOME/dot-connector-private/config.json" --machine local --project synthetic
node scripts/private-config.mjs check --file "$HOME/dot-connector-private/config.json"
node scripts/private-config.mjs doctor --file "$HOME/dot-connector-private/config.json" --feature synthetic
```

Complete local schema: `{"schema":1,"revision":0,"transport":"mcp-stdio",
"workload":"synthetic-cat","machineId":"local","projectId":"synthetic"}`.
The file lives outside Git in a private new directory. CLI and JavaScript API
use the same validator and revision-checked atomic writer. `show` is redacted;
`write --file ABS --revision N` reads a complete document on stdin. For manual
editing, stop concurrent writers, increment revision, edit locally, then check.
[Exact commands, API, constraints and safe recovery](docs/PRIVATE-CONFIG.md).

Missing config produces CONFIG_NOT_FOUND with the missing field and init action;
invalid/empty fields fail nonzero. MCP startup errors go to stderr without a
prompt or terminal creation. **No plugin secrets are required or accepted**.
Do not supply ChatGPT passwords, cookies, API keys or session tokens. Existing
ChatGPT sign-in and plugin authorization belong to the host. `doctor --feature
dot-remote` returns CONNECTION_NOT_IMPLEMENTED, not a request for credentials.

## Experimental host integration

Use a separate plugin and MCP name, such as `dot-connector-bridge-review`; do not
replace the diagnostic default. Its authorized local MCP command is Node with:

```sh
node scripts/tmux-bridge.mjs --experimental-synthetic --config "$HOME/dot-connector-private/config.json"
```

That command starts one NEW owned `/bin/cat` tmux session, paused. It is not a
shell, an attachment to an active tab, or a diagnostic check. Configure absolute
release/config paths in the host. On Windows, launch the existing wsl.exe with
explicit distribution/user and `--exec /usr/bin/node`, passing arguments as an
array. Do not infer an account's distribution or override host approval policy.

The host exchanges MCP on stdin/stdout. The local human socket is reported on
stderr; `node scripts/tmux-bridge-view.mjs SOCKET` opens its text view. Human
commands include /read, /grant, /pause, /paste TEXT, /submit, /stop and /quit.
Input grants last five seconds, are separate from installation consent, and are
never automatic. There is no agent grant tool. Uncertain input must never be
replayed. Cancellation revokes future writes, not bytes already dispatched.
[Tools, limits, identity checks and verified shutdown](docs/TMUX-BRIDGE.md).

[Official desktop packaging](https://developers.openai.com/plugins/build/plugins)
describes local catalogs and restart. This does not prove current host loading.
[Official remote MCP connection](https://developers.openai.com/plugins/deploy/connect-chatgpt)
uses HTTPS or Secure MCP Tunnel; the tunnel can reach stdio without a public
server. Neither remote route is configured here. Availability and authorization
must be checked before creating a tunnel or broadening access. No endpoint or
credential scheme for dot is invented by this project.

## Safety and verification

Synthetic does not mean OS sandbox: the process has the WSL user's permissions.
Same-UID processes are trusted. Buffers are bounded; snapshots may lose
intermediate output and are not a lossless PTY/VT stream. Existing windows,
sessions, projects, native adapters and the original plugin are not adopted.
Local settings stay outside Git; `.private/`, `*.private.json` and `.env` are
ignored as defense in depth. Never force-add local data or include it in releases.

Development checkout checks:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
DOT_TMUX_LAB_TEST=1 node --test --test-concurrency=1 --test-timeout=30000 test/*.test.mjs
npm run check:release
```

Native synthetic tests create their own fixtures, never attach active terminals.
Failure-path tests use synthetic data. These checks do not prove cloud delivery.

## Documentation index

- [Release 0.1.13](docs/RELEASE-0.1.13.md), [private configuration](docs/PRIVATE-CONFIG.md).
- [Local tmux design](docs/TMUX-LOCAL.md), [MCP bridge](docs/TMUX-BRIDGE.md).
- [Existing execution CLI](docs/CLI.md), [logs/WSL metadata](docs/LOGGING-WSL.md).
- [Install/rollback](docs/INSTALL.md), [local archives](docs/LOCAL-INSTALL.md), [managed updates](docs/UPDATE.md).
- [Development](docs/DEVELOPMENT.md), [historical prototype evidence](docs/PROTOTYPE.md).
- [Native MCP manual adapter](docs/NATIVE-MCP-INTEGRATION.md), [native contract](docs/NATIVE-CONTRACT.md).
- [All documentation](docs): historical documents describe their version and must
  not be read as proof of current host capability or installation state.

## License

UNLICENSED. Public visibility does not grant permission to reuse, modify or
redistribute this code. npm publication remains disabled with private=true.

Operator discovery for experimental configured instances: [local guide](docs/HUMAN-DISCOVERY.md), [0.1.13 notes](docs/RELEASE-0.1.13.md).

## Unreleased development branch

The trailing `--ordered-output-v2` flag connects the existing owned synthetic
session to a bounded byte journal and two read-only MCP tools. It is OFF by
default, keeps fixed 80x24 geometry, and creates no second PTY. Legacy grants,
input freshness and no-replay rules remain in force. The human CLI still shows
snapshots; browser QA replays recorded synthetic output, not a live cloud feed.

- [Runtime and lifecycle](docs/RUNTIME-ORDERED-OUTPUT.md), [MCP adapter](docs/MCP-ORDERED-OUTPUT.md).
- [Byte protocol](docs/ORDERED-OUTPUT.md), [synthetic geometry](docs/ORDERED-RESIZE.md), [PTY sources](docs/PTY-OUTPUT-SOURCE.md).
- [Snapshot fallback](docs/SNAPSHOT-OUTPUT.md), [literal presentation](docs/OUTPUT-PRESENTATION.md), [xterm observer](docs/XTERM-OBSERVER.md).
- [Planning-only configurator](docs/CONFIGURATOR.md): detect/plan/validate/review/status plus an interactive draft wizard; no apply or start.
- [Authorized collaborator guide](CONTRIBUTING.md) and [onboarding TODO](docs/COLLABORATOR-TODO.md).

The published v0.1.13 installer above does not install these branch changes.
Use the collaborator checkout instructions for review. No new release is made.
