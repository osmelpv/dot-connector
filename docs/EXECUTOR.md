# Existing executor route

The working path is agent delegation to the existing PC executor, then this local JSON client, the real MCP stdio server, and the explicitly owned WezTerm pane. A cloud-native MCP registration or tunnel is not required for this path. Delegation remains necessary; the root agent does not receive these tools directly.

## Reusable JSON-lines interface

In WSL, set `DOT_WEZTERM` to the existing Windows CLI's mounted path and `DOT_STATE` to the existing session directory. These are local operator configuration, never guessed or committed. Then run:

```sh
node scripts/local-client.mjs
```

Keep that process and stdin open across related operations. It emits a `ready` JSON object after initializing MCP. Submit one complete JSON object per line; wait for its response before deciding the next operation. The client validates exact keys, serializes requests, and never retries them. EOF closes its MCP subprocess. A restarted client loses its in-memory snapshots: always read again.

```json
{"id":"status-1","tool":"terminal_status","arguments":{}}
{"id":"read-1","tool":"terminal_snapshot","arguments":{"paneId":0}}
```

Use the pane ID from the validated state, not an assumed zero. Successful responses contain `id`, `ok`, `elapsedMs`, and `result`. Failed responses contain `ok:false` and `error`; do not infer that an uncertain write did not happen. Unknown top-level or argument fields and unsupported tool names are rejected.

Input is available only after coordinated human enabling and a fresh snapshot. The following are schema examples, **not an executable batch**. Replace the snapshot ID with the immediately preceding response, keep the same client open, and use a new operation ID for every separately authorized action:

```json
{"id":"paste-1","tool":"terminal_input","arguments":{"paneId":0,"snapshotId":"RETURNED_ID","operationId":"unique-paste-1","kind":"paste","text":"printf DOT_CONNECTOR_OK"}}
{"id":"read-2","tool":"terminal_snapshot","arguments":{"paneId":0}}
{"id":"submit-1","tool":"terminal_input","arguments":{"paneId":0,"snapshotId":"NEW_RETURNED_ID","operationId":"unique-submit-1","kind":"submit"}}
{"id":"pause-1","tool":"terminal_pause","arguments":{}}
```

Never combine paste and submit without inspecting the intermediate read. `kind:key` additionally requires a `key` from `Escape`, `Ctrl+C`, `Backspace`, `Up`, `Down`, `Left`, `Right`. Input with missing/malformed enable state remains blocked. Ordinary human typing is not automatically detected; the explicit pause signal can cancel only input not yet dispatched, with the documented check/dispatch race.

## Measured evidence

A real executor invocation of the local client revalidated the owned GUI PID, start time, executable, class, socket, and exact window/pane. Status reported paused; bounded snapshot returned `bash-5.2$`. Host process inspection also returned the previously recorded GUI window handle. That initial measurement sent no input and opened no window. It was text evidence of a Bash prompt, not continuous proof that the user would leave the shell unchanged.

One measurement: MCP startup 109 ms, status 819 ms, snapshot 980 ms. These include local subprocess and identity-query overhead; they exclude root-agent delegation, approval, scheduling, and model latency. No token telemetry is available, so no token-cost claim is made. The read API returns bounded text, not a pixel screenshot.

A subsequent coordinated live test launched the updated dedicated GUI, observed human enable, pasted `printf DOT_CONNECTOR_OK`, inspected the pending line, submitted Enter separately and read the marker. The MCP pause tool restored paused state and the client closed. Paste took 948 ms, submit 967 ms, and final read 925 ms. See [STATUS](STATUS.md) for exact evidence and remaining gates. No AI TUI was exercised; each future input still requires target validation, fresh state, and the applicable user authorization.
