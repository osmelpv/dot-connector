# Non-operative configurator: implemented commands

Implemented CLI: `node scripts/configure.mjs detect|plan|validate|review|status`. This standalone entrypoint deliberately bypasses the operational CLI, configuration, process, transport and logging paths. It never applies configuration, starts processes, creates credentials or approves a request. The operational `dot-connector` CLI is unchanged.

All responses are JSON envelopes with schemaVersion 1, command, ok and result (or a stable error code). `review --human` renders the same validated plan and SHA-256 as JSON review. Errors never echo invalid input, file contents or stack traces. Only explicit regular files are read, at most 32768 bytes, without symlink following. No stdin interface, environment inventory, shell command or config discovery is implemented.

Actual commands:

```sh
node scripts/configure.mjs detect --json
node scripts/configure.mjs plan --file /absolute/request.json --json
node scripts/configure.mjs validate --file /absolute/plan-response.json --json
node scripts/configure.mjs review --file /absolute/plan-response.json --human
node scripts/configure.mjs status --file /absolute/plan-response.json --json
```

The caller can save stdout explicitly. The CLI itself creates no file. validate/review/status accept the raw plan or the complete prior `plan` response. `status` without a file reports no plan loaded and runtime unknown; it never checks an active session.

Request example for the implemented version (not an operational permission):

```json
{"schemaVersion":1,"machineId":"fixture","profiles":[{"profileId":"project-review","mode":"Proyecto","folder":{"platform":"linux","path":"/fixture/project"},"destination":{"kind":"local","id":"local-preview"},"permissions":{"read_files":true,"read_output":true}}]}
```

There may be 1–8 separately named profiles: Personal, Proyecto or Consulta. Requested read_files, modify_files, execute and read_output are independent and default false. Consulta forbids modify_files and execute. terminalInput is always false. Destinations are logical local/remote aliases, never URLs, credentials or an active connection. Paths are lexical absolute folder declarations, not filesystem probes or proven boundaries. The path platform is explicit. Profile namespaces are distinct planned identifiers; no actual process, token, PTY or isolation resource is created or claimed.

Proyecto always reports isolation required/unavailable with no verified backend. Consulta's structured-query backend is also unimplemented. No fallback to Personal exists. Every profile is non-executable/unavailable in this planning-only increment, with precise blockers and pending approval actions. Desired initial state is stopped/disconnected; observed process/connection remain unknown with evidence none. These must not be confused with a statement about the active tunnel.

`detect` reports implemented planner capabilities and process.platform only. It does not probe binaries, permissions, folders, active config, backend or network. `validate` verifies schema, canonical digest and policy-derived fields; valid means a well-formed consistent draft, not ready/approved/executable. Recomputing the digest after falsifying availability does not bypass policy validation. The digest is not a signature or authority token. Review performs no state transition.

Runtime Zod schemas are exported as requestSchema and planSchema from `src/configurator.mjs`, using the existing dependency. Unknown fields, duplicate profile IDs, fake approval/backend evidence, unsupported versions and credentials fields are rejected. The bounded JSON reader additionally rejects duplicate decoded keys, forbidden prototype keys, excessive nesting and invalid UTF-8. No approval authority or configurable expiration is invented.

apply/up/down/revoke/setup, update/duplicate profile actions and interactive approval remain **proposals, not commands of this CLI**. There is no `--yes`, stdin approval, start action or installer. Only the subset described here is implemented. Grants, five-second freshness, lease and input arbitration are unaffected.
