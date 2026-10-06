# Verification status — 2026-10-06

## Native terminal: user-run visible-marker read passed

The user reported a successful manual run after the token-query correction. The result was `PASS`, diagnostic `VISIBLE_MARKER_LINE_MATCHED`, source `TextPattern.GetVisibleRanges`, `truncated:false`, and elapsed time **261 ms** (excluding the selection countdown). The returned HWND, PID and process start ticks identify the tested terminal; the exact user-provided JSON is retained in ignored local evidence, not published as session configuration.

This is **user-supplied manual execution evidence**, not an autonomous agent replay. The Windows supervisor launched the manual C# probe, which bound the deliberately focused terminal, read bounded visible ranges and found the standalone synthetic marker. No terminal content or scrollback was returned. It proves this read-only marker test, not arbitrary content fidelity, native input, or automatic control authorization.

The initial token-query defect was reproduced independently on the reader's own process: an oversized TOKEN_ELEVATION buffer returned Win32 24; the exact four-byte query succeeded. The fix preserves minimum query rights, elevation/integrity refusal and handle cleanup. The final manual artifacts and diagnostic correction passed independent own-source review before delivery. Windows/.NET are trusted platform dependencies, not fully audited source.

## WezTerm: executor-mediated shell roundtrip passed

An earlier dedicated visible WezTerm test passed through the existing executor and local MCP stdio client after explicit human enable: paste `printf DOT_CONNECTOR_OK` without Enter, inspect, submit separately with a fresh snapshot, then read the marker. Local calls took 948 ms for paste, 967 ms for submit and 925 ms for the final read. The connector restored paused state and closed its client. This was one shell test; no AI prompt, arbitrary TUI compatibility or automatic human-key detection was demonstrated.

## Local verification and artifacts

All **28 project tests** pass, with JS/JSON build checks, source hashing, package allowlist and heuristic secret audit. Native identity/freshness/UTF-16 cases remain simulated; supervisor deadline/cancellation uses owned stalled fixtures. Windows no-GUI checks additionally verified the host codec, owned-process token query and marker matching. No dependencies, permissions, policy or credentials were changed; no FlaUI/NuGet package was installed.

`npm run build` does not compile C#. Windows compilation was a separate offline step. User-tested artifacts are in the private Windows workspace `.runtime/manual-native-test`, outside WSL `dist` and the package. The older `.runtime/native-source-build` contains previous build artifacts and must not be confused with the tested manual version.

Final manual provider source SHA-256:
`ce9f38f6081111a6894c2905df154ac2a5432ffd4e8d1f83e8b94c3274c432e1`

User-tested DLL SHA-256:
`e757317550aded9db59579d8485bf1cc98e69e8b80381f40e722d57bc5a071d3`

User-tested manual EXE SHA-256:
`4b00a70f537e9013770f3e5a9179e32753191867cdae6b07a85187a3e5103e3d`

## Remaining gates and smallest next test

Automatic native integration remains disabled: this executor still lacks the supported computer-use runtime. The generic host remains compiled with native reads disabled; the separate user-run manual probe is not a workaround for agent execution. The manual read passed, but cancellation during a genuinely hung UIA call and broader target/refusal cases remain unverified. No claim that every timeout/security finding is closed is made.

The smallest future keyboard experiment is a separately reviewed **user-run, single-action** test in the same empty synthetic terminal. It would revalidate exact HWND/PID/start-time/pane and foreground immediately before dispatch, require fresh explicit human enable with a short lifetime, and type only one fixed printable marker without Enter. A bounded read would inspect the pending line; submit must remain a separate later authorization. No automatic retries, global hooks, focus changes or elevation. This proposal is not implemented or authorized as an automatic route.

Before autonomous keyboard testing, a supported runtime must be available and the user must explicitly authorize that target/action. A successful manual read alone does not supply that authorization. Work is stopped after local consolidation, with no UI actions or background task running. No push was attempted; publication approval remains unresolved.
