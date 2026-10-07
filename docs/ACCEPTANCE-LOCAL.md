# Local acceptance and proposed release (not published)

Historical local-validation record, retained for provenance. Publication of v0.1.9 and a subsequent consumer update were separately authorized after this record; see RELEASE-0.1.9.md for release scope.

All changes remain local and uncommitted. Existing installed 0.1.8 and other projects remain untouched. Working package version 0.1.9 is not a published release. No active task in this block accesses user windows, attaches to a real console or sends input.

## Acceptance by workstream

| Workstream | Demonstrated | Not demonstrated / remaining |
|---|---|---|
| Operation logs | Incremental phases, IDs generated internally, duration, heartbeat vs progress, fixed error codes, bounded rotation, privacy tests, metadata during a diagnostic session, timeout uncertainty | End-to-end dot latency/telemetry; detection of human keyboard intervention |
| WSL project consumption | Local tarball installation with isolated dependencies; real installed CLI status/logs/diagnostic; active-session exclusion and normal closure; real WSL-to-Windows MCP metadata handshake using the specifically approved helper | Fresh Windows preparation without separate consent; real tool registration in dot; terminal read/input in this new product flow |
| Focusless console | x64 compilation with warnings as errors; 97 fake assertions for ABI layout, literal records, cleanup, one-shot admission and partial-result handling; identity and registration negative tests | Actual marshaling/AttachConsole/WriteConsoleInput behavior, TUI compatibility, WSL input support, trustworthy existing-pane association |

The registration model always returns blocked. It creates neither registration nor credentials. Windows Terminal standard pane binding remains unresolved. Client JSON or process/title heuristics never becomes ownership proof. Existing native claims have no resume/adoption API and were not reset.

Additional research narrows the unresolved input path: a Windows helper launched from WSL may receive another ConPTY, so inherited console membership does not establish the outer Windows Terminal binding. WT_SESSION and visible markers corroborate output, not input through tmux/relays. No sufficient public arbitrary pane/client/console/tty resolver was found; generic WriteConsoleInput toward WSL stays blocked. Sources: [WSL interop.cpp](https://github.com/microsoft/WSL/blob/d8e5d9826bc0fde480774b295bd236500c76d178/src/windows/common/interop.cpp) and [Linux binfmt.cpp](https://github.com/microsoft/WSL/blob/d8e5d9826bc0fde480774b295bd236500c76d178/src/linux/init/binfmt.cpp).

Final local verification: 92/92 JavaScript tests passed; build, package allowlist/privacy checks and diff whitespace checks passed. The separate C# fake self-test passed 97 assertions.

## Runtime evidence

Local evidence is excluded from distributable artifacts:
- `.runtime/product-local-results.json`: actual tarball-installed CLI checks and metadata transport.
- `.runtime/approved-bridge-result.json`: initial real bridge metadata result.
- `.runtime/console-prototype-evidence.json`: compiler/source hash and fake-only self-test result.
- `/tmp/dot-local-acceptance-verify.log`: final source verification run.

The Windows preparation was specifically approved once with RemoteSigned scoped to that process. Separate Windows PowerShell 5.1 queries before and after remained Restricted with persistent scopes Undefined. No further policy override was performed. Windows helper preparation compiled native code and installed lockfile dependencies with npm lifecycle scripts disabled. Real bridge-check returned target null, nativeCalls false, and read/input capabilities false. Windows helper remains an explicit external dependency; no global runtime was installed.

One diagnostic test harness initially stopped its own session early after misreading ready framing. Its isolated fixture/lease was retained. Corrected tests used a new project and confirmed normal cleanup. Earlier rejected preparation fixtures are also retained; a retained lock is evidence, not evidence of a running process. Own launched subprocesses completed or were explicitly awaited after termination; no process inventory of unrelated applications was used.

## Minimum next real trial

No useful live attach/input trial is authorized by these local checks. First establish a reviewed cooperative provider that can prove the entire visible pane/client/console association, including owner, logon, process creation and WSL session identity where applicable. A human-entered PID alone is insufficient. The existing Windows Terminal pane has no identified runnable registration mechanism here.

Two unimplemented registration designs may warrant separate future investigation: native PowerShell/cmd launch with inherited console and named-pipe peer authentication, or temporary Linux-shell cooperation with SO_PEERCRED and process/tty lifetime checks. Both still need end-to-end binding proof. The latter occupies the prompt and cannot control an already-running OpenCode/TUI, the priority use case. Neither is a delivered substitute, and additional permission alone cannot fill the missing implementation.

Any future initial trial must explicitly name the narrower environment (native console or cooperative shell) and the input route it proves. Such success must not be reported as existing WSL-TUI control. No new integration or live trial follows from this documentation update.

Once that provider exists, request a separate one-time trial on one disposable, positively identified visible session: bounded observation, one literal marker without Enter, target-only verification, close and revoke. Do not use an AI TUI or provider tokens. Preserve unknown outcomes and never retry input automatically. The immediate lower-risk next step, if desired, is explicit registration of the diagnostic-only connector in dot and a metadata call; even that app integration has not been claimed complete.

## Proposed release, documentation only

Propose v0.1.9 as an experimental/prerelease after explicit authorization and reviewer acceptance. Include logs, local project installer and the metadata-only Windows bridge. Describe focusless code as disabled research scaffolding, not supported terminal control. Preserve private package/UNLICENSED status and diagnostic plugin defaults. Regenerate an archive and integrity manifest from the approved commit only after authorization; local content-derived archive IDs are not Git release commits. Keep rollback documentation and test the intended installation destination separately. Do not update an existing install or activate a target as a side effect of publishing.

No commit, tag, push, release, publication, installed-copy update, persistent grant or new shell registration is authorized or performed by this proposal.

## Local change inventory

Status below includes new source/tests/docs and version metadata. The acceptance document itself is also new. Runtime fixtures and compiler artifacts are intentionally excluded.

```text
 M .codex-plugin/plugin.json
 M README.md
 M package-lock.json
 M package.json
 M scripts/check-release.mjs
 M scripts/dot-connector.mjs
 M scripts/install-managed.mjs
 M scripts/managed-launcher.mjs
 M scripts/prepare-native-manual.ps1
 M src/cli-command.mjs
 M src/manual-native-mcp.mjs
 M src/native-integration-server.mjs
 M src/native-mcp-server.mjs
 M src/update-release.mjs
?? docs/COOPERATIVE-REGISTRATION.md
?? docs/FOCUSLESS-DESIGN.md
?? docs/LOCAL-INSTALL.md
?? docs/LOGGING-WSL.md
?? scripts/install-local.mjs
?? scripts/package-local.mjs
?? scripts/prepare-project-bridge.mjs
?? scripts/write-bridge-integrity.mjs
?? src/console-identity.mjs
?? src/cooperative-registration.mjs
?? src/local-install.mjs
?? src/native-console-prototype.cs
?? src/operation-deadline.mjs
?? src/operation-log.mjs
?? src/project-wsl.mjs
?? src/windows-bridge.mjs
?? test/cli-log-process.test.mjs
?? test/console-identity.test.mjs
?? test/console-prototype.test.mjs
?? test/cooperative-registration.test.mjs
?? test/local-install.test.mjs
?? test/operation-log.test.mjs
?? test/project-wsl.test.mjs
?? test/windows-bridge.test.mjs
```
