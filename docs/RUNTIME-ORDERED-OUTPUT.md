# Opt-in ordered output in the synthetic runtime

The existing experimental launcher can now connect its own synthetic tmux pane to the ordered-output MCP adapter. It remains disabled by default. No active runtime or tunnel was restarted or reconfigured during development.

## Activation boundary

Append --ordered-output-v2 to the existing scripts/tmux-bridge.mjs --experimental-synthetic invocation. Both the existing machine/project arguments and the existing --config argument form remain supported. Without the flag, no control reader or journal is created, and the same five legacy MCP tools remain available.

With the flag, createSyntheticSession creates the same isolated tmux server and /bin/cat pane, validates its process/socket/session/pane identity, and then opens an additional control client for that exact owned session. It does not create a second PTY. The control client uses tmux -N (never start a missing server), -f /dev/null, -C, attach-session -E -r and the owner's random session name. -E avoids environment updates; -r is the documented alias for read-only,ignore-size. Its stdin is never written. The implementation is limited to newly created synthetic sessions; it does not accept an external socket, PID, pane or destination from MCP.

The installed tmux 3.4 manual's CONTROL MODE and attach-session sections define %output octal escaping and these flags. src/owned-tmux-output.mjs decodes only the expected pane's byte output. Initial owner validation and fixed 80x24 geometry must succeed before a v2 resize event is published. Identity, unsupported metadata, malformed escaping or unexpected geometry changes close the output source. This runtime does not yet support dynamic resize; it fails closed instead of assigning guessed byte boundaries.

## Authorization and lifecycle

The source uses the existing strong native-owner validator (process identity and socket inode plus tmux session/pane identity). Each output read/status validates that owner again. A complete six-field output identity is required by MCP; the human socket also requires its bound human connection and original bridge binding. Source failures clear the journal and terminate only the owned control client. Same-UID cooperation remains the existing trust model, not an OS security boundary against another process running as the same user.

ordered_output_status and ordered_output_read are added only in opt-in mode. The existing local human socket gains an ordered-read action in that mode, and bridge_status/human status expose the output identity. The CLI human view remains on its existing snapshot presentation; this increment does not introduce a live browser transport.

Reading cannot grant input, create/replace a freshness observation, renew a lease or replay an operation. Both snapshot and ordered reads use the same existing four-read budget. Input grants, five-second maximum lease, freshness, operation ledger and human priority are unchanged. Transport limits and journal defaults remain unchanged. streamEpoch is an output incarnation, not an input lease generation; granting/revoking input does not restart output. Restarting the runtime creates a new session incarnation and streamEpoch, and old identities are rejected.

Runtime close first fences input as before, joins active input, closes and joins its owned output client, and stops the original tmux server through the existing guarded owner mutation. The verified result also requires output-client exit. Reads after close fail. No replacement server is killed if native ownership is lost.

## Tests

Native launcher tests cover flag absent/present, identical human/MCP frames from the real synthetic pane, six identity-field mismatches, read without grant, no freshness created by read, preservation of a previously issued freshness token, no lease renewal, grant revocation, runtime restart and cleanup. A native session test proves ordered reads share the original four-read budget and leave observations/lease untouched.

Controlled source tests exercise slow readers beyond the unchanged 1024-event cap, explicit gaps, wrong pane/session, geometry change, oversized lines, invalid escaping and owner validation failure. This flood uses a fake control stream; it does not bypass the real runtime's input ledger or raise its limits to manufacture a native flood. Existing PTY/MCP integration tests separately cover real-pipe reconnect and lost output responses.

DOT_RUNTIME_OUTPUT_TRACE can save the native runtime test's received frames and expected screen to a private file. The existing Chromium harness replays that exact trace using OBSERVER_QA_FRAMES. It tests actual browser rendering of delivered runtime output, not a live browser network connection. Keep generated traces and screenshots outside the repository; see COLLABORATOR-TODO.md for reproducible commands.

## Proposed activation and rollback — not performed

1. Read the existing launch specification without exposing credentials; confirm which Node child actually runs scripts/tmux-bridge.mjs and which checkout or installed version it executes. Do not assume the active tunnel reads this development checkout.
2. Review the tested diff and install/promote that exact code only after activation approval. Keep the old executable/version and full original argument list for rollback. No manifest, credentials or private-config schema changes are required by this feature.
3. Add only the trailing --ordered-output-v2 flag to that synthetic runtime's launch arguments. The process requiring replacement is the Node child running scripts/tmux-bridge.mjs. A running child cannot pick up this code/flag. If the tunnel supervisor cannot replace its child independently, a tunnel restart would require separate explicit approval; do not perform it as an implicit side effect.
4. Expect termination of the old synthetic /bin/cat session and its buffers/grants, a fresh paused session, a new incarnation and streamEpoch, and two additional read tools. Remote readers previously authorized for this server could read raw VT output in addition to snapshots; this is an access-surface change requiring review. It adds no write grant, but legacy input tools remain protected by their original grants. Refresh tool discovery through the supported host UI if necessary.
5. Verify from the exact dot cloud surface that a marked synthetic output frame matches local owner identity, streamEpoch, sequence, offset and geometry. Verify tool visibility, identity rejection, disconnection behavior and that read-only requests leave the session paused. That cloud/tunnel check remains unperformed.
6. Roll back by removing only the flag and replacing the same Node runtime child using the supported lifecycle. Confirm the two ordered-output tools disappear, the original five tools remain and the new default session is paused. Restore the previous artifact/version if needed. Rollback does not restore the old PTY's content, grants or operation ledger and must never replay uncertain input.

Files changed by this increment: src/owned-tmux-output.mjs (new); src/tmux-session.mjs; src/tmux-bridge.mjs; src/tmux-bridge-mcp.mjs; src/ordered-output-mcp.mjs (async read capability); scripts/tmux-bridge.mjs; scripts/browser-observer-qa.mjs (trace may end in ready state); test/owned-tmux-output.test.mjs and test/runtime-ordered-output.test.mjs (new); this document. The tunnel configuration, credentials, permissions, networking and installed plugin manifests were not changed.
