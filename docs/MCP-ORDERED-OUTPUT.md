# Ordered output over local MCP

The missing connection was the read tool between OrderedOutputJournal and the existing bounded MCP transports. The previous operational bridge exposed escaped snapshots, while native PTY journal and observer tests bypassed MCP. registerOrderedOutputTools in src/ordered-output-mcp.mjs supplies the read-only adapter. The synthetic launcher registers it only with the explicit --ordered-output-v2 flag; see RUNTIME-ORDERED-OUTPUT.md.

The host passes a pre-authorized journal consumer, immutable identity and protocol version. The peer receives ordered_output_status and ordered_output_read. There is no role, grant, write, resize, attach, spawn or stop tool. Identity includes machine, project, incarnation, session, pane and streamEpoch. Every read checks that identity and a bounded integer cursor. The host must authenticate/authorize the connection before supplying the capability; this helper is not remote authentication. Closing the server reclaims the consumer and preserves the host's prior onclose callback.

## Path executed

One test-owned Python PTY → attachSyntheticGeometrySource → one OrderedOutputJournal v2 → two McpServer instances using BoundedMcpStdio → separate Node client processes over OS stdin/stdout pipes using BoundedOutputMcp and the installed MCP SDK → OrderedOutputReceiver → XtermObserver with official xterm.

The parent test owns the servers and PTY; child processes are the clients. This inverted test topology deliberately lets clients disappear while the same owner and journal survive. It tests actual pipes and MCP serialization, but is not a deployed stdio launcher or cloud connection. IPC controls only test actions/results; journal frames travel as MCP responses through stdin/stdout, not as a substitute IPC protocol.

The existing Python geometry fixture was extracted into scripts/synthetic-geometry-fixture.mjs and reused by both native tests. Optional stepping controls fixed fixture phases through a separate pipe, never by writing PTY master input. Geometry is verified by ioctl at drained boundaries: 80x24 at byte 0, 40x12 at byte 7, 100x30 at byte 16. The fixture now uses the actual test-tube Unicode character instead of the unintended literal U0001f9ea, and its existing assertion verifies that character.

Two consumers receive identical identity, 23 frames, raw bytes, ordered geometries and final screen, including EOF. Both share one PTY and journal. The native helper closes both PTY descriptors and exits successfully; each MCP client closes and exits successfully; consumers return to zero. Test cleanup kills only its own child on a failure.

## Reconnect and uncertain outcomes

- A disconnected consumer reconnects to the same retained journal using its last validated cursor while the test retains its renderer/receiver. It receives the missing events, without duplicating accepted bytes.
- A slow disconnected consumer exceeds a deliberately smaller 16-event retention budget. Reconnect returns an explicit gap. The receiver requires resync and the observer disposes itself; replay from zero still returns a gap when the prefix is no longer retained. No suffix is presented as a complete terminal state.
- A read response is deliberately dropped after preparation. The client receives a connection error and makes no automatic second request. A newly connected client may explicitly query the same cursor: output reads are nonmutating. This is not replay of uncertain terminal input. bridge_input is absent and an attempted call is rejected.

The new adapter never calls the input path or creates freshness tokens, observations, leases or grants. Existing input uncertainty and authority tests remain in the full suite. This increment does not claim a new end-to-end input ACK guarantee; it adds no write transport.

## Bounds preserved

Server request line 16 KiB; output-reader line 32 KiB; outgoing line 32 KiB; pending writable bytes 64 KiB; at most four outstanding requests, eight pending writes and 64 incoming messages per second; write deadline three seconds. Journal defaults stay 256 KiB and 1024 events; frames stay 16 KiB raw bytes; two consumers maximum. The maximum frame response is exercised by the adapter test. No bound was raised. An in-memory test yields between completed calls so write callbacks can settle under the existing outstanding-request cap; real-pipe tests need no such adjustment.

## Browser evidence

The integration writes a bounded synthetic trace containing the exact frames delivered through MCP and the expected xterm screen. The existing browser harness accepts optional OBSERVER_QA_FRAMES and replays those frames in two mounted Chromium observers. It verifies both screens against the native test screen, then runs the six existing browser checks. Seven browser groups pass with the previously verified Playwright/Chromium installation, sandbox enabled and an ephemeral context. This is browser replay of the real delivered trace, not a live browser-to-PTY connection. Screenshot observer-mcp-pty.png shows both matching renderers.

Reproduce native tests with DOT_TMUX_LAB_TEST=1 and optional DOT_OUTPUT_INTEGRATION_EVIDENCE pointing to a private trace path:

```sh
node --test --test-concurrency=1 test/ordered-output-mcp.test.mjs test/ordered-output-mcp-pty.test.mjs test/synthetic-geometry-source.test.mjs
```

For browser replay, supply that trace as OBSERVER_QA_FRAMES in addition to PLAYWRIGHT_MODULE and OBSERVER_QA_OUTPUT, then run scripts/browser-observer-qa.mjs. No test opens an active terminal, changes credentials, starts or restarts a tunnel, or deploys a service.

## Runtime and remaining cloud validation

The [synthetic runtime](RUNTIME-ORDERED-OUTPUT.md) now supplies its owned journal
when explicitly enabled. Default behavior remains snapshots. No active tunnel
configuration or installed runtime is changed by this source branch.

Cloud acceptance still requires a separately authorized correlated read of the
same incarnation, streamEpoch, sequence, byte offset and geometry observed locally,
plus disconnection checks on that transport. Local tests do not establish remote
identity mapping, tool exposure or cloud delivery.
