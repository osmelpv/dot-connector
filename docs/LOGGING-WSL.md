# Local 0.1.9 work: operation logs and WSL bridge

Historical local-validation record, retained for provenance. Publication of v0.1.9 and a subsequent consumer update were separately authorized after this record; see RELEASE-0.1.9.md for release scope.

These changes are unpublished and have not updated the existing installation.

## Operation metadata

`dot-connector logs` returns at most 50 recent sanitized events. `dot-connector status --local` reads activity without connecting to a terminal, including while a managed command owns the lifecycle lease. Both commands also accept `--log-dir` for a standalone local development session.

Events contain generated request/run IDs, operation/backend, phase, timestamp, duration and a fixed error code. They exclude caller IDs, arguments, text, snapshots, target details, grants, paths and raw errors. Rotation retains three files of at most 32 KiB each. Heartbeats are separate from actual last activity. Durations measure this local connector, not total dot response latency.

Admission remains synchronous: logging cannot queue an otherwise rejected input. Paste and submit remain separate. A timeout means outcome unknown, not proof of cancellation. Uncertain operations preserve logging and managed lifecycle locks and are not retried automatically. Existing native target claims are not reset or adopted.

## WSL project consumption

The local installer prepares a project-local managed release and then a Windows helper when running under WSL. Windows Node and .NET Framework must already exist. No global runtime is installed. The helper has isolated dependencies and a pinned inventory; modules are compared with the managed source manifest before launching Windows Node through structured arguments. Native Linux terminal control is unsupported.

Preparation copies verified source into a fresh local Windows TEMP directory, then invokes the existing PowerShell script without changing execution policy. Preparation owns the managed lifecycle lease; uncertain Windows subprocess completion preserves it. On this machine, the real preparation attempt was rejected with SecurityError/UnauthorizedAccess because script execution is disabled. No policy override, unblock, or fallback was attempted. The system policy must permit the reviewed preparation script through an explicitly authorized mechanism before this route can be completed.

`dot-connector bridge-check` is a metadata-only MCP handshake with the prepared Windows helper. It does not select a target or call UIA/input. Once configured, `session` defaults to the Windows bridge. Selection, identity validation and human grants still apply to actual native sessions.

## Evidence and limits

The local suite exercises log privacy, bounds, rotation, uncertain outcomes, synchronous admission, CLI metadata during a session, inventory tampering, path validation, capability detection and setup leases. Integration used disposable `/tmp/dot-local-019-*` fixtures with copied local source/dependencies and synthetic manifests explicitly representing unpublished snapshots, not downloaded or authenticated releases. Windows runtime probing and source preparation ran; PowerShell rejected the helper script before preparation completed. No new GUI reads, terminal selection, focus, input, grants or AI-provider prompts were performed. A subsequent explicitly authorized preparation and real WSL-to-Windows metadata handshake succeeded, as recorded below. There is no real dot integration claim.

The previously installed 0.1.8 remains unchanged. Publishing, pushing, and updating that installation require separate authorization. Existing persistent native claims still have no resume/adoption API.

## Read-only policy diagnosis

The rejected command was the existing `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` with arguments:

```text
-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File <Windows TEMP>\dot-connector-source-<nonce>\scripts\prepare-native-manual.ps1 -Destination <Windows TEMP>\dot-connector-<nonce> -NodePath "C:\Program Files\nodejs\node.exe"
```

Read-only inspection of that Windows PowerShell 5.1 host reports effective `Restricted`; MachinePolicy, UserPolicy, Process, CurrentUser and LocalMachine are all `Undefined` (default restriction). The script is a local ordinary file with only the data stream, no Zone.Identifier. The rejection is therefore not attributable to UNC or Mark-of-the-Web. The tool's different PowerShell host reports RemoteSigned; it was not substituted to evade the rejection. Under WSL the policy cmdlet failed module autoload; the same executable queried directly from Windows provided the explicit policy result. No policy or environment was changed.

The smallest proposed intervention is explicit authorization for a process-scoped script policy on the single Windows PowerShell preparation process, subject to system policy. This single-process proposal was subsequently explicitly authorized and executed; no persistent policy was changed. No persistent machine/user change is needed by this proposal. Existing failed fixtures and their locks remain intact.

## Authorized preparation and real metadata transport result

The reviewed script hash was checked before execution; the destination did not exist. The approved Windows PowerShell 5.1 process used RemoteSigned only for that process. Compilation, pinned dependency installation with lifecycle scripts disabled, and the native host self-test succeeded (`passed:true`, `nativeCalls:false`). The generated inventory contains 3,415 files. Separate policy queries before and after showed effective Restricted and all persistent scopes Undefined.

A new unpublished local fixture pinned this helper and ran `bridge-check` from WSL through Windows Node v24.13.0. Real MCP initialize/status returned version 0.1.9, mode windows-bridge-check, target null, nativeCalls false, terminalRead false and terminalInput false. Source/dependency verification took 20.242 seconds, connect 437 ms, status response 5.9 ms and disconnect 17 ms. The first attempt had timed out before spawning the helper; bounded batches of 16 file verifications corrected the filesystem overhead without removing hashes, traversal checks or the 30-second cooperative deadline.

The successful session closed normally, released its lifecycle/log leases and left no target.json, server.lock or control.json. Local status and logs commands also succeeded. Prior failed preparation fixtures remain intact. This validates real cross-OS stdio metadata transport, not terminal access, live dot registration, or the entire one-command installer. The automated installer still respects the machine's default script policy; it does not silently add the temporary override. The existing installation was not updated.
