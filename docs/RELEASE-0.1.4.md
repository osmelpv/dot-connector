# 0.1.4 experimental release

Adds a versioned local Codex-compatible plugin manifest and a diagnostic-only MCP entrypoint for isolated installation checks. Includes reviewed manual native test sources and user-reported read/write feasibility evidence, with no native automatic invocation path.

Install from the exact published Git commit using INSTALL.md. No npm publication, global dependency, credential, UI hook or public listener is included. The plugin exposes terminal_status only; terminal read/input are explicitly unavailable. Existing experimental WezTerm and manual native paths are not enabled by installation. Runtime registration, real ArtisanFeed consumption and autonomous native control are not established by this release.

Validation: clean pinned checkout, isolated dependencies, package allowlist, JS/JSON/source hashes, project tests and SDK MCP handshake/status. Native UI tests are user-reported historical evidence, not release-time autonomous tests. No open-source license is granted.
