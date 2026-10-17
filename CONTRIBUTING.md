# Authorized collaborator review

This public repository is UNLICENSED. These instructions are for collaborators
expressly authorized by the owner. Public visibility and submitting an issue do
not grant general reuse, modification or redistribution rights. Do not add a
license or publish packages without the owner's decision.

Review branch: review/ordered-output-collaborator-onboarding. Package version
remains 0.1.13; this branch contains unreleased changes after prerelease v0.1.13.
The release installer does not install branch changes.

Use a fresh Linux/WSL2 checkout. Do not overwrite an existing working tree:

```sh
git clone --branch review/ordered-output-collaborator-onboarding https://github.com/osmelpv/dot-connector.git dot-connector-review
cd dot-connector-review
git rev-parse HEAD
node --version
npm --version
python3 --version
tmux -V
node scripts/check-node.mjs
npm ci --ignore-scripts --no-audit --no-fund
```

Node 22.x is required, not just validated. The runtime refuses other Node majors
and the suite fails on them, so run `scripts/check-node.mjs` first: it exits 1
with `NODE_22_REQUIRED` on any other major, and `npm ci` then also warns
`EBADENGINE`. If your default Node is another major, put an existing Node 22
runtime first in PATH for this shell only; do not change global defaults.

Validated toolchain: Node 22.23.3, npm 10.9.9, Python 3.12.3, tmux 3.4 on Linux/WSL.
Locked dependencies: MCP SDK 1.27.1, xterm 6.0.0, Zod 3.25.76. Other Python, npm
or tmux versions may work but must be reported. Native tests require existing /usr/bin/tmux and Python.
Do not install system packages, modify profiles or permissions, or disable browser
sandboxing to make a test pass; report the missing prerequisite instead.

Follow [the onboarding TODO](docs/COLLABORATOR-TODO.md) for isolated suite/build,
package checks and optional browser QA. Native tests create and clean their own
synthetic sessions; they must not target active terminals or the installed plugin.
Tests do not authorize starting or restarting a tunnel, granting runtime input,
deploying, merging to main or publishing a release.

Open a GitHub installation or bug issue using the templates. Include commit,
versions, exact failing command, expected/actual behavior and a redacted summary.
Never attach credentials, environment dumps, personal paths, live terminal output,
private config, user screenshots or raw logs without reviewing them first.
Prefer a small synthetic reproduction and a focused PR to this review branch.

For code changes, read local instructions, inspect git status first and preserve
others' edits. Keep input authority separate from output. Never retry uncertain
input, extend leases through reads, or increase bounds to hide a failure. Run the
relevant regression test and the complete checklist before proposing a merge.
