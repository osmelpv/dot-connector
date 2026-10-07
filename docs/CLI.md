# Local execution CLI (0.1.6 experimental)

The CLI is an executable miniAPI for callers with an existing permitted local execution tool. It needs no plugin registration. It does not expand the caller's execution permissions. Diagnostic calls have been run by this executor; native UIA/input through this CLI has not.

From a pinned checkout with its own locked dependencies:

```sh
node scripts/dot-connector.mjs help
node scripts/dot-connector.mjs version
node scripts/dot-connector.mjs status
node scripts/dot-connector.mjs session --backend diagnostic
```

Help/version/status emit JSON. Session mode emits a ready event, then accepts one JSON object per line on stdin and returns JSON lines on stdout. A caller maintains the process and reads responses programmatically; there is no command menu in this data plane. Keep the session open because snapshots and target ownership belong to that session. The package bin is `dot-connector`; a global install is unnecessary.

## Requests and lifecycle

Every request has an alphanumeric, underscore or hyphen `id` (1–80 characters), a `command` and optional `arguments`. Native requests:

```json
{"id":"s1","command":"status"}
{"id":"r1","command":"read"}
{"id":"p1","command":"paste","arguments":{"snapshotId":"SNAPSHOT_FROM_READ","operationId":"HUMAN_AUTHORIZED_OPERATION","text":"DOT_WRITE_TEST"}}
{"id":"r2","command":"read"}
{"id":"p2","command":"submit","arguments":{"snapshotId":"FRESH_SNAPSHOT_FROM_READ","operationId":"SEPARATELY_AUTHORIZED_OPERATION","text":"DOT_WRITE_TEST"}}
{"id":"pause1","command":"pause"}
{"id":"close1","command":"close"}
```

Wait for each response. Paste does not submit. Native submit requires the exact pending text and a separate human grant. Native text is bounded to 256 UTF-16 units and excludes control characters/newlines. Errors are sanitized. A refused or unknown input outcome must never cause a blind retry; inspect fresh state and coordinate with the human. IDs do not automatically authorize actions.

There is no queue: overlapping ordinary requests return BUSY_NO_QUEUE. Pause/close may interrupt pending work. Close immediately rejects subsequent requests, including while pause is pending or if pause fails, then closes the transport. EOF and Ctrl+C make a best-effort pause and close the owned transport. Hard termination, focus races, or already queued native input cannot be undone; no cancellation guarantee is made. SIGTERM has no graceful handler. Use explicit pause/close. Persistent claims and consumed operation records are never automatically removed, reset, or rearmed. Restarting does not restore an old snapshot or transfer an existing claim.

Diagnostic sessions support status and close only. Native and WezTerm schemas stay distinct: WezTerm read/paste/submit require a paneId and its submit omits text. Choose `session --backend wezterm` only with the existing explicitly authorized DOT_STATE/DOT_WEZTERM environment and exact pane; this CLI never selects another window automatically.

## Human setup for the native backend

Use a new prepared directory built from the pinned Windows checkout with `scripts/prepare-native-manual.ps1`; see INSTALL.md. Existing Windows Node remains unchanged. The following selection/authorization commands require a human-operated Windows TTY and are not JSONL commands:

```text
node scripts/dot-connector.mjs select --native-root <absolute-new-prepared-directory>
node scripts/dot-connector.mjs session --backend native --native-root <same-directory>
```

The human selection uses the existing countdown/marker procedure and writes a pinned target; it does not start a second MCP consumer. The session opens the existing native adapter with its persistent target claim. In a separate human console, authorize the exact next operation:

```text
node scripts/dot-connector.mjs authorize --native-root <same-directory> --operation op1 --kind paste --text DOT_WRITE_TEST
```

The human reviews target and text and must type ARM PASTE (or ARM SUBMIT). The grant expires in 15 seconds. The caller then obtains a fresh read and sends the matching operation while the selected terminal is foreground. Human instructions go to stderr; machine responses go to stdout. This is a cooperative same-account guard, not a security boundary against other programs running as that account.

The native writer still requires the synthetic DOT_NATIVE_TEST_7F3A2C9B marker and DOT_WRITE_READY> prompt/caret guards. Generic OpenCode TUI support, background input, and native CLI end-to-end operation are not established. Existing user-reported v0.1.5 manual MCP read/paste/read evidence is separate from the new CLI. In this executor the supported native computer-use runtime is absent: diagnostics are executable, but calling native UIA/SendInput through the CLI remains disallowed. No new manual test is requested by this release.
