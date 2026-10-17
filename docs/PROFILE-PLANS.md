# List and duplicate profile drafts

These operations work on validated configuration plans, not installed profiles or
active sessions. They reuse the configurator's schema, digest and policy engine.
They do not inspect declared folders, apply permissions, connect destinations or
create runtime identities. There is no credential input or automatic persistence.

## Commands

Use an absolute path to a plan or the successful `command: "plan"` envelope produced
by the planner or wizard:

```sh
node scripts/configure.mjs profiles list --file "$PWD/plan.json" --json
node scripts/configure.mjs profiles duplicate \
  --file "$PWD/plan.json" --from project-review --name project-copy \
  --platform linux --folder /fixture/new-project --json
```

`--json` is optional because JSON is the default. `profiles list` accepts only
`--file` and `--json`. Duplication additionally requires `--from`, `--name`,
`--platform` and `--folder`; there are no default names or folder choices. Windows
folder syntax uses an absolute drive path with backslashes and explicit platform
`windows`. Arguments must be quoted according to the caller's shell.

Every value option also accepts --option=value. This form is required when a value
starts with --, because the separated form deliberately refuses an option-looking
next token. Quoting a separated --source value does not change that rule:

```sh
node scripts/configure.mjs profiles duplicate --file="$PWD/plan.json" \
  --from=--source --name=--copy --platform=linux --folder=/fixture/copy --json
```

Only the first equals separates the option name; later equals remain literal value
characters. Empty values, unknown options and repeated options (including a mixture
of separated/equals forms) are rejected. --json and --human remain value-less flags;
--json=true and --human=true are invalid. Equals values still pass the same label,
folder and plan validators; they are never evaluated as commands.

Duplicate output goes to stdout. The original file is not changed. To persist a
draft, the caller can redirect stdout to a fresh file and check the exit status
before passing it to `validate`, `review` or `status`. Shell redirection can truncate
an existing file before the CLI runs; never redirect onto the input file.

```sh
node scripts/configure.mjs validate --file "$PWD/copy-plan.json" --json
node scripts/configure.mjs review --file "$PWD/copy-plan.json" --human
node scripts/configure.mjs status --file "$PWD/copy-plan.json" --json
```

## Versioned contract

Listing returns `{schemaVersion:1, command:"profiles.list", ok:true, result}`.
The result has kind `profile-list`, machineId, source digest, approval `pending`,
executable `false` and profiles in source order. Each row contains the declared
profile fields plus unavailable/unverified state, isolation and blockers. Permissions
are requested draft capabilities, never observed or active permissions. A listing
is not itself a plan and cannot be passed to the transformation as one.

Duplication returns `{schemaVersion:1, command:"plan", ok:true, result: newPlan}`.
This intentionally matches existing planner/wizard output so no special envelope
is needed by validate/review/status. Error envelopes use schemaVersion 1, the
recognized command, ok `false` and a stable error code; process exit is 1. Unknown
commands use command `null`. Errors do not echo supplied content or stack traces.

The pure JavaScript API is `listProfiles(plan)` and `duplicateProfile(plan, options)`
from `src/profile-plans.mjs`. It accepts raw plans; CLI envelope unwrapping occurs
at the CLI boundary. Duplication options are strict and versioned:

```json
{"schemaVersion":1,"from":"project-review","name":"project-copy","folder":{"platform":"linux","path":"/fixture/new-project"}}
```

Unknown fields, including token, secret, grant, lease, approval, runtime identity,
connection or capability overrides, are rejected. The strict schema is exported
as `duplicateProfileSchema`; folder validation comes from the shared core.

## Copy semantics and limits

The source plan must pass schema, digest and derived-policy checks before either
operation. Duplication retains the machine label, existing profiles and the source
profile's mode. It appends a new profile with the supplied name and folder. The new
profile always requests all four capabilities as `false` and uses logical destination
`local/local-preview`; the source's destination and requested capabilities are not
copied. There is no override for that reset in this increment. Existing profiles'
draft requests remain unchanged and do not become active permissions.

All assessments and pending actions are rebuilt by createPlan. Approval remains
pending; terminal input remains false; actual runtime is unknown. The digest changes
because the plan changes. Identical source and options yield identical output/digest;
object-key ordering does not affect the canonical digest. Returned objects do not
share mutable nested state with the source plan or options.

Names and normalized absolute folders must be unique within the plan. Folder
identity ignores a trailing separator and Windows case. It is only lexical:
symlinks, mounts, overlapping directories and actual privacy boundaries are not
verified. A plan may contain at most eight profiles. Invalid Unicode controls,
unknown sources, collisions and the ninth profile fail without changing the source.

The CLI retains the 32 KiB input-file limit and refuses a final symlink. Symlinks in
parent directories are not an isolation boundary. It reads only the explicitly
named plan, never the folders declared by profiles. It accepts no stdin approval,
`--yes`, `--apply`, secret flags or persistence option. No new dependency is required.

## Verification and remaining work

Tests cover collisions, normalized Windows aliases, missing sources, all three
modes, limits, secret/unknown fields, malformed envelopes, tampered plans,
deterministic digest, detached results, original-file preservation and composition
with validate/review/status. Full regression also includes the existing wizard PTY
tests; profile operations themselves are noninteractive JSON commands.

The interactive wizard now loads an existing plan with `wizard --file ABSOLUTE_PLAN`,
lists profiles and uses the same duplication operation. See [wizard usage](CONFIGURATOR.md)
for explicit review/EXPORT and cancellation. No loaded draft is persisted automatically.
OS isolation, structured-query backends and activation remain unavailable.
