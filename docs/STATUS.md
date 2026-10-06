# Verification status — 2026-10-06

## Native terminal: user-run fixed-text write passed

The user reported `PASS`, diagnostic `PENDING_MARKER_VISIBLE_NO_ENTER`, phase `DISPATCHED_NO_ENTER`, **28 input events**, and **410 ms**. This confirms the fixed marker was observed pending without Enter in the manually selected synthetic terminal. It is user-supplied manual evidence, not autonomous agent execution or a dot-to-native MCP roundtrip.

An earlier write was refused with `PINNED_TARGET_CHANGED` before dispatch. A fresh user-run read passed in 227 ms; only HWND differed from the previous pin, while PID and process start time matched. The private pin was updated only after that explicit manual selection. No guard was removed. The successful write's persistent attempt lock and journal remain consumed and untouched; no input cleanup or retry was performed.

The writer and guards passed independent source review before delivery. Offline C# compilation and no-GUI layout/request validation passed. The tested writer DLL SHA-256 is `16f33965631fc960be7d6d302c73ea54268c1b59ac7c142f6b5e012720845583`; EXE SHA-256 is `61a0c1b3d631fb992dd58aa9d07b1dc770313694df102d26831d72d5dbe874ce`. The underlying focus-check/SendInput race remains non-atomic. Cancelling cannot retract already queued input; partial or unconfirmed outcomes must not trigger automatic retries.

## Native terminal: user-run visible-marker read passed

The user reported a successful manual run after the token-query correction. The result was `PASS`, diagnostic `VISIBLE_MARKER_LINE_MATCHED`, source `TextPattern.GetVisibleRanges`, `truncated:false`, and elapsed time **261 ms** (excluding the selection countdown). The returned HWND, PID and process start ticks identify the tested terminal; the exact user-provided JSON is retained in ignored local evidence, not published as session configuration.

This is **user-supplied manual execution evidence**, not an autonomous agent replay. The Windows supervisor launched the manual C# probe, which bound the deliberately focused terminal, read bounded visible ranges and found the standalone synthetic marker. No terminal content or scrollback was returned. It proves this read-only marker test, not arbitrary content fidelity, native input, or automatic control authorization.

The initial token-query defect was reproduced independently on the reader's own process: an oversized TOKEN_ELEVATION buffer returned Win32 24; the exact four-byte query succeeded. The fix preserves minimum query rights, elevation/integrity refusal and handle cleanup. The final manual artifacts and diagnostic correction passed independent own-source review before delivery. Windows/.NET are trusted platform dependencies, not fully audited source.

## WezTerm: executor-mediated shell roundtrip passed

An earlier dedicated visible WezTerm test passed through the existing executor and local MCP stdio client after explicit human enable: paste `printf DOT_CONNECTOR_OK` without Enter, inspect, submit separately with a fresh snapshot, then read the marker. Local calls took 948 ms for paste, 967 ms for submit and 925 ms for the final read. The connector restored paused state and closed its client. This was one shell test; no AI prompt, arbitrary TUI compatibility or automatic human-key detection was demonstrated.

## Local verification and artifacts

All **28 project tests** pass, with JS/JSON build checks, source hashing, package allowlist and heuristic secret audit. Native identity/freshness/UTF-16 cases remain simulated; supervisor deadline/cancellation uses owned stalled fixtures. Windows no-GUI checks additionally verified the host codec, owned-process token query and marker matching. No dependencies, permissions, policy or credentials were changed; no FlaUI/NuGet package was installed.

`npm run build` does not compile C#. Windows compilation was a separate offline step. User-tested artifacts are in the private Windows workspace `.runtime/manual-native-test`, outside WSL `dist` and the package. The older `.runtime/native-source-build` contains previous build artifacts and must not be confused with the tested manual version.

Earlier read-only probe provider source SHA-256 (before writer guards):
`ce9f38f6081111a6894c2905df154ac2a5432ffd4e8d1f83e8b94c3274c432e1`

User-tested DLL SHA-256:
`e757317550aded9db59579d8485bf1cc98e69e8b80381f40e722d57bc5a071d3`

User-tested manual EXE SHA-256:
`4b00a70f537e9013770f3e5a9179e32753191867cdae6b07a85187a3e5103e3d`

## Remaining gates and feasible integration work

Automatic native integration remains disabled: this executor lacks the supported computer-use runtime. The generic host still refuses native execution; the separate user-run probes must not be used as an agent bypass. Manual read/write success does not supply autonomous runtime access. No dot-to-native roundtrip is established.

The next product increment can be prepared entirely without UI execution: a capability/status response distinguishing manual evidence from runtime availability, strict MCP request validation and target/session binding, operation state transitions for pause/cancellation/unknown outcomes, and fixture-based integration tests. An unavailable native runtime must return an explicit unavailable result before spawning any native worker. The reviewed manual writer must remain outside the production MCP dispatch path. This increment is proposed, not implemented in this consolidation.

Actual automatic native read/write integration requires the supported runtime and an authorized target/action. Still unverified: cancellation during a genuinely hung UIA call, broader UIA target/refusal cases, detection of human intervention, and atomic pane-specific dispatch (SendInput cannot provide the last guarantee). Do not promise human typing automatically cancels queued input. Paste and submit must remain separate; no submit test has been performed on this native target.

Current deliverable is a local prototype plus manual native feasibility evidence. No new GUI actions, input, dependency installation, credential changes, push or publication occurred in this consolidation. See MANUAL-NATIVE-WRITE.md for the manual procedure and its limits.
