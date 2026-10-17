# Experimental output source and fixture viewer

The ordered journal is now connected to a real **test-owned Linux PTY** in native tests. This adapter is used by synthetic tests; the separate runtime and MCP integration are documented in RUNTIME-ORDERED-OUTPUT.md and MCP-ORDERED-OUTPUT.md. No active work session or tunnel is connected by the fixture. No dependency was installed: the fixture uses the existing Python standard library and Node streams.

## Adapter boundary

`attachOrderedOutputSource({source,journal,onAvailable,chunkBytes})` accepts one new, exclusively owned binary Readable and an empty journal. It refuses text/object mode, already consumed streams, existing data/readable listeners and a second producer binding. Bindings are permanent for that journal lifetime, including after cancellation. A caller still owns the responsibility for selecting an authorized source and matching its identity: this is an in-process capability API, not authentication for a remote stream.

The adapter does not open a PTY or process and never writes input. It copies source bytes to journal events without decoding, escaping, trimming or snapshot capture. It splits accepted ingress chunks into events of at most 16384 bytes and rejects ingress chunks above 65536 bytes. `chunkBytes` may only reduce the event size and must fit journal capacity. Sequence/offset allocation and retention remain in the existing journal; there is no second journal layer.

Readers pull independently. The adapter never waits for a slow consumer or creates a consumer queue: the journal evicts retained events and the slow reader sees a gap. A synchronous `onAvailable` hook supports fixtures/fast local consumers; promises are rejected, so async work must not be queued there. An arbitrary blocking callback could still block the JS thread; this API assumes trusted local code. Stream/OS high-water buffers are additional to journal retention, not included in a claim of exact RSS. Cancellation/oversize/error closes the journal and destroys only the supplied readable.

`done` reports eof, failed or cancelled. Successful readable end adds exactly one protocol EOF; error or premature close never fabricates EOF. `cancel()` is idempotent. `sourceDetached: true` does **not** prove process death: `processExitVerified` remains false, and the owner must separately close and reap its producer. No automatic response to terminal escape queries, input stream or lease operation is exposed.

## Native PTY fixtures and cleanup

The guarded test uses `/usr/bin/python3`, `pty.openpty`, raw mode on its **new slave only**, and one forked child that writes a fixed fixture payload to that slave. The parent forwards master bytes to its stdout. There is no shell, command supplied by a user, profile, stdin forwarding, credential, project session, tmux attach or terminal adoption. Raw mode prevents terminal output processing from rewriting the fixture bytes; it does not change any existing terminal.

All descriptors and processes are owned by this test. On EOF the helper closes the master and waits for its child. On cancellation or broken output it terminates/reaps that child and emits bounded cleanup metadata on stderr. Node separately waits for the helper's close event. Assertions require childReaped/masterClosed and successful helper exit; normal completion additionally verifies child exit. This scope does not claim cleanup of arbitrary descendants, which the fixture cannot create.

Tests exercise:

- UTF-8 and CSI/OSC/DCS sequences split into single-byte journal events; two independent consumers receive the same identity, bytes and EOF.
- Exact replay while the complete prefix is retained.
- A 1 MiB output burst, SHA-256 equality at the fast reader, 8 KiB journal retention and an explicit gap for the stalled reader. Resync after eviction still reports gap rather than inventing terminal state.
- Cancellation during an active producer, distinct detach/process-exit evidence, oversized ingress, source errors, premature close and async-consumer rejection.

The suite guard is Linux plus `DOT_TMUX_LAB_TEST=1`, matching the existing synthetic lab tests. No additional session is run outside the test suite.

## Next local visual check

From the checkout, without credentials:

```sh
node scripts/ordered-output-demo.mjs --fixtures-only > output-demo.html
```

Open that generated file locally in a browser. The entry point creates **memory fixtures only**, never a PTY or subprocess. It builds two consumers through the same source adapter and emits a self-contained HTML artifact. There is no server, fetch, WebSocket or network permission. The two panes should show the same text, stream epoch, offset and EOF. The replay button only replays the embedded fixture.

The display uses `textContent`; it renders control characters as literal escape notation. OSC 52 and CSI sequences should be visible as text, not executed. A streaming UTF-8 decoder preserves the split emoji. Tests execute the renderer against a minimal fake DOM and validate both embedded streams with the actual protocol receiver. This is not a browser screenshot or a visual acceptance test.

For a later visual source test, substitute a newly owned test source only after agreeing how its lifetime is owned; keep the same literal rendering and no reverse input channel. The separate xterm observer and v2 geometry fixture provide VT interpretation and controlled resize; atomic terminal-state checkpoints remain unimplemented. This increment does not modify input grants, freshness, leases, writer arbitration or the active tunnel.

## Supported APIs

[Python pty](https://docs.python.org/3/library/pty.html) documents creation of a new master/slave pair. [Python tty](https://docs.python.org/3/library/tty.html) documents raw-mode configuration. [Node streams](https://nodejs.org/api/stream.html) documents binary Readable events and lifecycle. The installed test host used Python 3.12.3; only APIs available in that version are used.
