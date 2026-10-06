# 0.1.5 experimental release

Adds a guarded, separately user-launched native MCP adapter and a reproducible Windows preparation script. The user reported a complete manual SELECT/READ/PASTE/READ pass: DOT_WRITE_TEST remained pending without Enter and the same target/pane was confirmed. No submit or autonomous dot invocation was tested. Test-session closure is not yet confirmed.

Default plugin tools: terminal_status only (diagnostic). Manual Windows adapter tools: terminal_status, terminal_snapshot, terminal_input with separate paste/submit grants, terminal_pause. Installing this package does not enable native control or override runtime policy.

Protections include exact HWND/PID/start-time/UIA ancestry, bounded visible reads, elevation refusal, visible-cursor and pending-line checks, persistent cross-installation target claims, expiring human operation grants and no replay. Focus/SendInput remains non-atomic; cancellation cannot retract input already queued. Claims coordinate participating implementations, not arbitrary programs under the same account.

Verification: 35 project tests, independent source review, offline Windows compilation and six no-GUI codec checks. MCP tests use simulated native providers; the actual UI result is user-reported manual evidence. Dependencies remain unchanged. No npm publication, global runtime install, ArtisanFeed configuration change, native binary, session state or credential is included.

Install from the exact GitHub commit in a separate checkout using INSTALL.md. The Windows source-preparation script builds only into a new directory; it never starts the manual consumer. Keep previous versions and consumed state for rollback.

## Background-operation requirement: not met

The requested product behavior is selecting an authorized terminal and operating it while it is inactive on another monitor, without stealing focus from the human. This native adapter does not meet that requirement: it requires the exact target to be foreground and focused, and SendInput targets the interactive input stream. A second monitor does not isolate keyboard focus. No SetForegroundWindow or other focus-stealing workaround is introduced. Foreground-required remains an explicit experimental limitation.

A future background route needs an authorized terminal-specific pane IPC or an owned console input channel, plus bounded reads and explicit target/session ownership. It must demonstrate input/output on the inactive target while the foreground application receives no injected input and retains focus. Current manual PASS evidence does not prove that behavior.
