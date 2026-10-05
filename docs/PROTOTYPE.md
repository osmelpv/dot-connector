# Prototype evidence and limitations

The implementation is plain JavaScript (ES modules), not TypeScript. It is an application-independent adapter with four local MCP tools: status, bounded snapshot, guarded input, and pause. It uses the official MCP SDK over stdio and the WezTerm CLI. No network listener, credentials, or tunnel is needed for this local transport.

## Verification scope

Unit tests use a fake CLI transport to cover explicit pane identity, bounded text, separate paste and submit, rejection of controls in pasted text, snapshot expiry, persistent operation-ID deduplication, pause before dispatch, and rejection of concurrent writes. A separate protocol test initializes the real MCP stdio server and lists its tools without launching a GUI. Neither establishes access from dot.

The initial Windows portable WezTerm experiment created a GUI window, but class-based CLI discovery failed. The matching upstream source explains why: `--always-new-process` and a custom config each disable publishing the class discovery mapping. An explicit owned socket fixes this read path without giving up instance isolation.

Real **read-only** MCP stdio verification now succeeds: a local client calls status and snapshot, the server validates the GUI process, and Node in WSL calls the Windows CLI through its exact socket. The snapshot returned the dedicated Bash prompt. This is not a call from dot, an input roundtrip, or an AI application test. The GUI was already running; the corrected launcher has been syntax-checked but has not been rerun while visible tests are paused.

Observed runtime: WezTerm Windows `20240203-110809-5046fc22`, Node `22.23.3` in Ubuntu WSL. No other WezTerm version is claimed supported. No AI prompt was run.

## Input boundaries

The connection binds the socket path, GUI PID, start-time ticks, executable, unique class, and exact window/pane IDs. Before every CLI call, a read-only Windows process query validates the persisted identity, including PID reuse detection. Missing or changed identity fails closed. The CLI and GUI executables must share a directory. Each subprocess gets its exact `WEZTERM_UNIX_SOCKET`; WSL forwarding uses `WSLENV` without modifying global environment settings. There is no fallback to another socket/window/pane. The connector does not adopt arbitrary existing windows. A snapshot requests at most 120 rows and returns at most 16,000 characters; it is terminal text, not a screenshot. Output is untrusted data.

Input requires a recent snapshot and unique operation ID. Paste allows one line without control characters; submit sends CR separately. Named keys encode a small VT sequence set. Application acceptance needs a fresh read after every action. Attempts are journaled before dispatch, and no write is automatically retried after an error or timeout.

Concurrent calls in one server process are rejected: there is no queue. Run only one server per session; a cross-process lease is not implemented. An explicit pause file is checked before dispatch. Proposed human shortcuts are Ctrl+Shift+F12 to pause and Ctrl+Shift+F11 to resume. Physical hotkeys are **not yet tested**. Unit tests simulate the signal. Ordinary human typing is not detected or blocked, already dispatched bytes cannot be recalled, and a check/dispatch race remains. A lease alone cannot prevent physical keyboard input. Automatic takeover and strict human/agent exclusion are not established.

The OpenCode JSON is profile format version 1, recording an observed installation version. It is metadata, not a validated OpenCode driver or compatibility promise. The shell-only smoke script is unexecuted and must never be run against an arbitrary TUI.

`scripts/read-smoke.mjs` performs only MCP status/snapshot calls. It requires operator-provided `DOT_WEZTERM` and `DOT_STATE` for an already verified owned session. Existing state files without the process/socket identity are rejected. Process validation has a check/use race with process exit; it is not an operating-system lease. The adapter never retries an uncertain write.

## dot integration is unresolved

Official OpenAI documentation covers local STDIO registration for specified desktop/CLI clients and separately discusses hosted Work integrations. That does not prove the particular dot surface supports this route. No server registration or client permission change has been performed. Confirm that exact surface before giving installation instructions or calling an integration connected.

## Primary references

- [WezTerm GUI startup](https://wezterm.org/cli/start.html)
- [Matching release discovery publication logic](https://github.com/wezterm/wezterm/blob/20240203-110809-5046fc22/wezterm-gui/src/main.rs)
- [Explicit socket targeting](https://wezterm.org/cli/cli/index.html#targeting-the-correct-instance)
- [WezTerm explicit-pane paste/raw input](https://wezterm.org/cli/cli/send-text.html)
- [WezTerm screen-text bounds](https://wezterm.org/cli/cli/get-text.html)
- [WezTerm shortcut callbacks](https://wezterm.org/config/lua/keyassignment/EmitEvent.html)
- [Official MCP client documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
