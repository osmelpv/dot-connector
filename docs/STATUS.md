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

All **35 project tests** pass, with JS/JSON build checks, source hashing, package allowlist and heuristic secret audit. Native identity/freshness/UTF-16 cases remain simulated; supervisor deadline/cancellation uses owned stalled fixtures. Windows no-GUI checks additionally verified the host codec, owned-process token query and marker matching. No dependencies, permissions, policy or credentials were changed; no FlaUI/NuGet package was installed.

`npm run build` does not compile C#. Windows compilation was a separate offline step. User-tested artifacts are in the private Windows workspace `.runtime/manual-native-test`, outside WSL `dist` and the package. The older `.runtime/native-source-build` contains previous build artifacts and must not be confused with the tested manual version.

Earlier read-only probe provider source SHA-256 (before writer guards):
`ce9f38f6081111a6894c2905df154ac2a5432ffd4e8d1f83e8b94c3274c432e1`

User-tested DLL SHA-256:
`e757317550aded9db59579d8485bf1cc98e69e8b80381f40e722d57bc5a071d3`

User-tested manual EXE SHA-256:
`4b00a70f537e9013770f3e5a9179e32753191867cdae6b07a85187a3e5103e3d`

## Current integration and remaining gates

The 0.1.5 source includes a separately user-launched native MCP adapter with bounded read, human-approved paste, separate submit and pause. Persistent claims coordinate the same HWND/process across participating installations; exact-operation grants expire and consumed operation IDs cannot be replayed. The default plugin manifest remains diagnostic-only.

The user reported SELECT/READ/PASTE/READ success through this adapter, with the same target and UIA pane before and after, a visible pending DOT_WRITE_TEST marker, and truncated:false. No SUBMIT was performed. This is manual MCP-to-terminal evidence, not autonomous dot invocation. QUIT was requested but closure is not confirmed. No current target, session ID, grant or claim is included in publication.

The executor still lacks the permitted computer-use runtime for autonomous native invocation; manual success does not remove that boundary. Pending native validation includes actual submit, cancellation during a genuinely hung UIA call and broader refusal cases. Human typing is not automatically detected, and checking focus before SendInput cannot make dispatch atomic. No automatic retry, rearm or cleanup input is allowed.

OpenCode 1.18.33 previously connected the diagnostic plugin from ArtisanFeed with inline configuration and other MCPs disabled only for that process. Git state, diffs and configuration hashes were unchanged. That consumption test did not call a model or enable native control. Further release installation checks run in isolated directories, not the ArtisanFeed worktree.

## Background-operation requirement: not met

The requested product behavior is selecting an authorized terminal and operating it while it is inactive on another monitor, without stealing focus from the human. This native adapter does not meet that requirement: it requires the exact target to be foreground and focused, and SendInput targets the interactive input stream. A second monitor does not isolate keyboard focus. No SetForegroundWindow or other focus-stealing workaround is introduced. Foreground-required remains an explicit experimental limitation.

A future background route needs an authorized terminal-specific pane IPC or an owned console input channel, plus bounded reads and explicit target/session ownership. It must demonstrate input/output on the inactive target while the foreground application receives no injected input and retains focus. Current manual PASS evidence does not prove that behavior.
