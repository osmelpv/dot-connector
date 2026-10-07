# Unpublished local project installation

Historical local-validation record, retained for provenance. Publication of v0.1.9 and a subsequent consumer update were separately authorized after this record; see RELEASE-0.1.9.md for release scope.

Use an existing Linux Node 22 runtime. Build a source tarball into a new absolute directory with `node scripts/package-local.mjs /absolute/new-bundle`. This archive includes the lockfile and uses a content-derived identity, not a published Git commit. Its manifest hashes establish local integrity, not independent authenticity. Accept only source you have reviewed.

From the Linux project, one command installs a new isolated `.dot-connector` root:

```sh
node /absolute/reviewed-source/scripts/install-local.mjs --root "$PWD/.dot-connector" --archive /absolute/new-bundle/dot-connector-0.1.9-source.tar.gz --manifest /absolute/new-bundle/local-manifest.json --bridge-config /absolute/approved/windows-bridge.json
```

The config references the existing prepared Windows helper and pinned hashes. No Windows preparation or policy change occurs in this flow. Installation creates its own locked dependencies with `npm ci --ignore-scripts`, checks source integrity and keeps the lifecycle lease through copied bridge-config verification. The original source directory is not used at runtime. The helper remains an explicit external dependency: deleting or modifying it makes verification fail. No target or grant is included.

Without a bridge config, installation returns `WINDOWS_PREPARATION_CONSENT_REQUIRED` on WSL before creating the root. This is a conservative consent gate, not an OS-policy probe. It explains that a reviewed Windows preparation step requires separate consent and offers the explicit `--diagnostic-only` alternative. It never adds a process execution-policy override automatically. Native Linux reports terminal control unsupported. A single-command fresh preparation on a restricted Windows host still requires that separate consent; the tested one-command route reuses the prepared helper.

After installation:

```sh
./.dot-connector/dot-connector status
./.dot-connector/dot-connector status --local
./.dot-connector/dot-connector logs
./.dot-connector/dot-connector bridge-check
./.dot-connector/dot-connector session --backend diagnostic
```

`status` and the explicit diagnostic session do not access a terminal. `bridge-check` performs real Windows MCP metadata transport with target null and terminal read/input disabled. Local metadata commands remain available during an active managed session; another session/update is rejected. Close a diagnostic session with a JSON line `{"id":"close","command":"close"}`. Normal closure releases its owned leases; uncertain closure preserves them. Existing destination roots, symlink inputs, relative paths, corrupted archives and ambiguous options are rejected. Partial installations preserve their lease and evidence, never overwrite an existing installation or automatically adopt it.

This flow does not register tools in dot, publish a release, update another project, enable the focusless design contract, or grant terminal control. The current default plugin remains diagnostic-only. No terminal association has been demonstrated for the focusless design.

## Local validation

A tarball produced by package-local was installed with real isolated npm dependency preparation into a new Linux project. Its installed shell command passed diagnostic status, local status/logs, metadata during a live diagnostic session, rejection of another session and normal lease cleanup. The same installed command completed real WSL-to-Windows bridge-check with target null, nativeCalls false and both terminal capabilities false. The source test suite passed 83 tests, including archive corruption, symlink/relative path rejection, explicit consent without root creation, existing-root refusal and retained lease on finalization failure. Independent source review closed without remaining code blockers.

A test harness initially misread the JSONL ready event and terminated its own diagnostic process; that separate fixture and fail-closed lease were retained. The corrected test used another fresh project and confirmed normal cleanup. No prior installed copy, Windows policy, target or grant was changed by the local product tests.
