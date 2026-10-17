# Non-operative configurator: implemented commands

Implemented CLI: `node scripts/configure.mjs detect|plan|validate|review|status|wizard`. This standalone entrypoint deliberately bypasses the operational CLI, configuration, process, transport and logging paths. It never applies configuration, starts processes, creates credentials or approves a request. The operational `dot-connector` CLI is unchanged.

All responses are JSON envelopes with schemaVersion 1, command, ok and result (or a stable error code). `review --human` renders the same validated plan and SHA-256 as JSON review. `help` (also `--help` or no arguments) prints readable text when stdout is a TTY or with `--human`; piped stdout or `--json` returns the unchanged JSON help envelope for agents. Using a saved error envelope as a draft fails with `CONFIGURATOR_CANCELLED_RESULT` (cancelled wizard) or `CONFIGURATOR_FAILED_RESULT` (any other error) instead of a schema error. Errors never echo invalid input, file contents or stack traces. JSON commands and wizard --file read only explicitly named regular files, at most 32768 bytes. A final symlink is rejected; symlinks in parent directories are not an isolation boundary. Interactive answers require a TTY; wizard --file additionally loads the explicitly named plan. JSON commands never consume stdin. No environment inventory, shell command or config discovery is implemented.

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

Runtime Zod schemas are exported as requestSchema and planSchema from `src/configurator.mjs`, using the existing dependency. Unknown fields, duplicate profile IDs or lexical folder identities, fake approval/backend evidence, unsupported versions and credentials fields are rejected. The bounded JSON reader additionally rejects duplicate decoded keys, forbidden prototype keys, excessive nesting and invalid UTF-8. No approval authority or configurable expiration is invented.

apply/up/down/revoke/setup, update/duplicate profile actions and interactive approval remain **proposals, not commands of this CLI**. There is no `--yes`, stdin approval, start action or installer. Only the subset described here is implemented. Grants, five-second freshness, lease and input arbitration are unaffected.

## Interactive draft wizard

Run from an interactive terminal:

```sh
node scripts/configure.mjs wizard > plan.json
node scripts/configure.mjs validate --file "$PWD/plan.json" --json
node scripts/configure.mjs review --file "$PWD/plan.json" --human
node scripts/configure.mjs status --file "$PWD/plan.json" --json
```

Prompts and the review are written to stderr; stdout contains one versioned JSON
plan envelope, identical to the plan command. Redirection is optional and is done
by the caller's shell, not the wizard. Choose a fresh output file: shell redirection
can truncate an existing file before the wizard starts. On failure stdout contains
an error envelope, not a plan; check exit status before using the output.

The wizard asks for a machine label, unique profile name, mode, project folder
platform and absolute normalized path. Privacy intent has two implemented choices:
request no capabilities, or request local read-only files/output. Neither grants
access, reads files or sends data. Remote sharing, permission application, runtime
activation and OS isolation are unavailable. Proyecto explicitly reports missing
isolation; Consulta reports its missing query backend. No fallback mode is chosen.

Up to eight profiles can be reviewed together. Both JSON and wizard reject duplicate
profile IDs and duplicate lexical folder identities, ignoring a trailing separator
and Windows path case. This is not realpath, symlink, mount or OS isolation checking;
overlapping directories and aliases may still refer to the same resources.

There are no default answers. Each prompt permits three invalid attempts, at most
1024 bytes per answer and 32768 bytes of total TTY input. No input history is saved.
Type :cancel at any prompt, Ctrl+C, or Ctrl+D at an empty prompt to cancel with a nonzero result and
no plan. Do not enter credentials; the wizard never requests them. Errors do not
echo rejected answers (a real terminal can still display what the person types).
The duplicate/export action accepts any letter case; the final `EXPORT`
confirmation stays exact. A rejected folder is reported as already declared or as
an invalid format, with an example that does not collide with declared folders.

The final summary includes the same validated SHA-256 and pending approval state
as review. Type the exact word EXPORT to emit the draft. Empty input, yes, --yes
and piped confirmation never approve or export a draft. EXPORT means export only;
it does not accept any pending action. Nothing is written or activated by the CLI.

stdin and stderr must both be TTYs. Otherwise CONFIGURATOR_TTY_REQUIRED returns a
JSON error with instructions to use plan --file /absolute/request.json --json.
The five JSON commands remain available to agents, including detect and status.
The wizard accepts only optional --file ABSOLUTE_PLAN_PATH; no approval or secret flags are accepted. Unit tests use scripted questions and simulated
streams. The opt-in Linux PTY tests create their own new terminal and Node child;
they never adopt an existing terminal or change an active runtime.

## PTY review coverage

With existing Python 3 and Linux, run:

```sh
DOT_TMUX_LAB_TEST=1 node --test --test-concurrency=1 --test-timeout=30000 test/configurator-wizard*.test.mjs test/configurator.test.mjs
```

The laboratory gives the new process a private HOME, TMPDIR and working directory,
with stdin/stderr on a newly allocated PTY and stdout on a separate pipe. It checks
the valid export, Ctrl+C, Ctrl+D at an empty prompt, invalid-answer retries, exact
EXPORT, and 32-column by 8-row interaction. A pasted OSC attempt is not echoed as
an active OSC command; direct control/bidi strings are rejected by the shared core.
The filter includes ALM, LRM, RLM and Unicode line/paragraph separators, which could
otherwise alter the visual reading of a folder in the review.
Normal readline cursor-control output on stderr is expected; stdout must remain
one parseable JSON line with no escape controls or prompt text.

Only synthetic files are used. Inotify watches on a synthetic file and declared
folder show no open/read events during the wizard process. Before/after inventories
and marker content remain unchanged. This is evidence for those watched fixtures,
not a syscall audit of every file the Node runtime reads. Static review confirms
the wizard path calls no project-file read, file writer, subprocess or network API.

A declared symlink folder remains unverified and unavailable; the wizard does not
resolve it. The JSON-file reader separately rejects a final symlink but accepts an
explicit regular file through a symlinked parent directory. It is not a sandbox
and must not be used to certify project privacy or path containment.

PTY tests validate the actual line editor and protocol at narrow dimensions, not
pixel rendering, font behavior, accessibility or Windows ConPTY. Review text can
exceed a short terminal's height and remains in its scrollback; no pager is created.
No assertion establishes OS isolation, anonymity or permission enforcement.

## Operations on existing profile drafts

Use [profile plan operations](PROFILE-PLANS.md) to list or duplicate profiles from
a validated plan. The JSON CLI and wizard --file share these operations and never
modify runtime configuration.

## List and duplicate profiles interactively

```sh
node scripts/configure.mjs wizard --file "$PWD/plan.json"
```

This loads a raw validated plan or successful command=plan envelope using the same
32 KiB reader as the JSON commands. It checks TTY availability before opening the
named file, and validates schema, digest and policy before displaying any plan
content. Secret/unknown fields, altered plans and unsupported envelopes fail with
a stable JSON error, without echoing values or prompting. stdin and stderr must
both be TTYs; stdout can be redirected to a fresh output file by the caller.

The wizard immediately lists profile IDs, modes and unverified declared folders.
Choose duplicate, select an existing source ID, then supply a unique new name,
platform and normalized absolute folder. Each invalid answer has three attempts;
there are no default choices or automatic suffixes. The same duplicateProfile
operation resets all requested capabilities to false and the destination to logical
local/local-preview. It carries no grants, connections or runtime identity.

The updated list is shown in memory. More copies are allowed only up to eight
profiles. At eight, duplication is unavailable; review/export or cancellation remain
possible. Choose export to show the complete common review and digest, then type
the exact word EXPORT. Choosing export alone, empty input and yes do not emit a plan.
Choosing export without making a copy returns an unchanged validated draft.

The original object/file remains untouched. :cancel, Ctrl+C or Ctrl+D at an empty
prompt discard the in-memory changes and return an error envelope with exit 1.
No new file is written by the CLI. The 1024-byte answer and 32768-byte total TTY
input limits still apply. Shell redirection can overwrite a file independently of
the CLI, so never redirect output onto the input plan.

Unit and real owned-PTY tests cover choice/collisions, duplicate/export, cancellation
after creating a copy, unchanged export, forbidden file fields/flags and oversized
files. The loaded-plan workflow is also exercised at 32x8 dimensions with separate
JSON stdout. No existing terminal is adopted. Visual rendering, accessibility and
ConPTY remain outside this Linux PTY evidence.

## Explicit option values

All value options accept either --option VALUE or --option=VALUE, including --file
for plan/validate/review/status, profiles commands and wizard. Use the equals form
for values beginning with --; for example --from=--source and --name=--copy preserve
valid profile labels. Separated option-looking values remain errors, so an omitted
value cannot silently consume the next option. Only the first equals is structural.
Unknown, empty or repeated options fail; boolean flags accept no value. Shell quoting
is still the caller's responsibility. See [profile examples](PROFILE-PLANS.md).
