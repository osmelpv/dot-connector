# Verification status — 2026-10-06

## WezTerm: real executor roundtrip passed

The existing agent-to-PC executor invoked the local MCP stdio client against a dedicated visible WezTerm window. After the user pressed Ctrl+Shift+F11, the adapter verified positive enable state and exact process/socket/pane identity. It pasted `printf DOT_CONNECTOR_OK` without Enter, read the pending command, submitted Enter as a separate action using a fresh snapshot, and read:

```text
bash-5.2$ printf DOT_CONNECTOR_OK
DOT_CONNECTOR_OKbash-5.2$
```

Measured local calls: paste 948 ms, separate submit 967 ms, final read 925 ms. These exclude delegation/model overhead; no token telemetry was available. The MCP pause tool then reported paused with no queued input; the client closed. The window was left open for inspection. Human resume was observed; the physical pause shortcut was not separately tested. No AI prompt was executed. This proves one shell roundtrip, not arbitrary TUI compatibility or automatic human-typing detection.

## Native terminals: source compiled; integration disabled

The JavaScript contract, C# UIA provider source, and Node-worker supervisor are local prototypes. The C# library compiled separately using pre-existing Windows/.NET tools and references. It was never loaded or executed. `npm run build` checks JavaScript/JSON and hashes source; it does not compile C#.

Provider **source** SHA-256:
`43d377d361dbee3d314afc92c4e8407de9588262ff9cf6338df8b10f5a99e423`

The compiled DLL is a separate Windows workspace artifact under `.runtime/native-source-build/DotConnector.Native.dll`, not WSL `dist`, and is excluded from the package. No byte-reproducibility claim is made for the legacy compiler.

All 26 own-code tests pass: existing connector/protocol tests, simulated native identity/visibility/freshness/UTF-16 tests, static native import checks, and real deadline/cancellation tests against owned stalled Node fixtures in WSL. No fixture exercised Windows UIA. Package allowlist and heuristic secret checks pass; dependencies are unchanged.

The timeout finding is **partially resolved**: the supervisor terminates its own test worker and confirms cleanup, but it is not connected to the C# DLL. Native integration remains disabled. No source audit establishes complete security of Windows, .NET, UIA providers, or future hosts.

## Exact next gates

1. Approve a supported UIA execution route; the current executor lacks the required CUA runtime. Do not bypass that restriction using the DLL.
2. Implement/review the isolated host and JSON bridge, connect external deadline/cancellation supervision, and verify cleanup on Windows without touching unrelated processes.
3. Obtain an explicitly identified native window/pane target through the permitted route. Announce any new dedicated test window before opening it.
4. Compare a bounded `GetVisibleRanges` read with known visible text, and test refusal on focus/identity changes and inaccessible/elevated targets. Native input is unavailable.

No FlaUI/NuGet installation, network listener, credentials, policy changes, or native GUI actions were performed. Work is stopped at these gates; no overnight background task is running. Changes are committed locally only; publication remains blocked pending direct recognized approval.
