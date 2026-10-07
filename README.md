# dot-connector
A toolkit that lets dot observe and control the same visible terminal window the user works in.

## Overview

dot-connector gives dot tools to observe and interact with the same visible terminal window the user works in. It is designed to support terminal applications across projects, without requiring the user to manually attach to a hidden session.

## Planned capabilities

- Read the current terminal screen and observe changes.
- Send text and navigation keys to a specific terminal pane.
- Keep the user in control, with a way to pause assistant input.
- Use application-specific, versioned profiles for commands, shortcuts, and interface states.
- Update operational profiles as supported applications evolve.

OpenCode, Claude Code, and GentleShell are initial integration targets, rather than the full scope of the project.

## Project status

Early development. A local prototype is being evaluated; end-to-end access from dot and compatibility with terminal applications are not yet verified. Version 0.1.8 includes a [local execution CLI miniAPI](docs/CLI.md), with real diagnostic process tests and mocked native dispatch tests. [Managed WSL updates](docs/UPDATE.md) add release verification and rollback in an isolated installation. The default WSL plugin remains diagnostic-only. See [installation and rollback](docs/INSTALL.md). The separate [manual native MCP adapter](docs/NATIVE-MCP-INTEGRATION.md) passed user-run read/paste/read validation without Enter. Terminal control is not enabled by installation; publication and runtime registration must be verified separately.

Experimental 0.1.9 adds [operation logs and WSL bridge preparation](docs/LOGGING-WSL.md). An explicitly authorized temporary preparation passed a real WSL-to-Windows metadata handshake; automated preparation still respects the default script policy. The installed version remains unchanged.

See the [single-command local project installation](docs/LOCAL-INSTALL.md) for the local tarball flow with a previously prepared helper.

## Development approach

Start with one working terminal integration and a small set of verified actions. Expand support based on practical tests, while keeping interaction overhead and repeated context processing low.

## License

No license has been granted at this stage. Publishing this repository does not grant general permission to reuse, modify, or redistribute its contents. Licensing will be decided before a public release.

## Prototype development

See [current evidence and limitations](docs/PROTOTYPE.md) and the [verification, pinned distribution, and rollback cycle](docs/DEVELOPMENT.md). Local checks: `npm ci --ignore-scripts` followed by `npm run verify`. These checks do not launch a visible terminal or call an AI provider.
