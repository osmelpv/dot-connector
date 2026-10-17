# Experimental ordered output: isolated fixture implementation

Follow-up: a [read-only source adapter and test-owned PTY](PTY-OUTPUT-SOURCE.md) now exercise this journal. The byte protocol is also used by the opt-in synthetic runtime and read-only xterm observer.

Implemented locally and connected to owned synthetic PTY tests and the opt-in runtime; no active tunnel is deployed by this change. This is a byte protocol and bounded in-memory journal, not a completed shared terminal. No new dependency, endpoint, input tool or permission is introduced.

## Observation isolation and framing fixes

`TmuxSession.observe(id)` uses the same bounded capture and identity checks as `snapshot(id)` but never creates or replaces `observations[id]` and returns no snapshotId. `SnapshotBridge.readOutput` uses that path and does not replace `agentSnapshot`. The opt-in snapshot formatter now calls readOutput. Legacy snapshot/read behavior is preserved. The bridge sequence remains shared across all reads; sequence gaps remain snapshot gaps, not byte offsets. Reads may still cause normal lease expiry checks, which is intentional and unchanged.

The server already used `BoundedMcpStdio`, limiting request lines to 16384 bytes before JSON parsing. `BoundedOutputMcp` now reuses that transport with a 32768-byte response-line bound for **supplied client streams**, including MCP wrapping. It spawns nothing. Default server bounds remain unchanged. Existing 64-message/second, four incoming requests, eight pending writes, 65536-byte writable queue and three-second write-timeout limits remain in force. Foreign SDK clients and the active tunnel are not patched; callers must explicitly use the new bounded transport. Real SDK Client/McpServer integration is tested over in-memory streams.

The separate binary protocol decoder uses `BoundedOutputJsonl`: fixed 32768-byte scratch buffer before parsing, maximum 65536-byte input chunk, maximum 64 complete frames per push, strict UTF-8, no async dispatch queue, fail-closed malformed/oversized/partial input. Caller-owned stream buffers are outside this allocation, so an eventual network adapter must also bound its ingress high-water marks. A rejected chunk is not copied into an unbounded buffer. Protocol EOF is distinct from transport EOF.

## Protocol and capabilities

`OrderedOutputJournal` owns the only append capability. `connect('human')` and `connect('agent')` expose frozen read/close capabilities only, at most one of each. Disconnect is idempotent and cannot remove a replacement connection. Reads are synchronous, create no queue and never wait for consumers. No transport accepts caller-supplied producer commands.

Identity is pinned and immutable: machineId, projectId, incarnation, session, pane, streamEpoch. streamEpoch identifies output lifetime, independently of input lease generation. The journal accepts an owner-supplied epoch; the runtime owner generates a fresh epoch for each new stream. A receiver never adopts another identity.

Each frame has exactly:

```json
{"version":1,"kind":"data","identity":{"machineId":"fixture","projectId":"synthetic","incarnation":"instance","session":"$0","pane":"%0","streamEpoch":"stream-1"},"seq":1,"start":0,"end":3,"data":"YWJj"}
```

Kinds are data, eof, idle and gap. Offsets are byte offsets with an exclusive end; seq counts producer events. Data is canonical base64, decoding to 1–16384 bytes; offsets and sequences must be safe nonnegative integers. EOF is an ordered event at the current offset with empty data. Idle reports the current tail without advancing it. Gap reports the oldest retained boundary and carries no data. Schema validation precedes state changes; identity change permanently fences that receiver.

The journal retains at most 262144 raw bytes **and** 1024 events. Limits may be reduced for fixtures but cannot be increased through constructor options. Append copies the source buffer; consumer responses contain independent base64 strings. It evicts oldest events without blocking the producer. Object/Buffer overhead is additional but bounded by the event count; these are not exact process RSS figures. Two consumers maintain independent cursors externally; one slow consumer cannot block or reset the other.

The receiver accepts only the next sequence at the expected offset. Duplicates yield no bytes; overlap, reorder and malformed frames fail closed. A gap requires explicit resync. `resync()` requests replay from sequence/offset zero, and works only while the full prefix is retained. If that prefix has been evicted it produces gap again, with resetRequired; it does not feed an incomplete suffix to an assumed synchronized terminal. Recovery then needs a new stream or a separately implemented atomic terminal-state checkpoint. This prototype does not invent a checkpoint from capture-pane.

`finish()` emits EOF once; append/finish afterward fail. A receiver ignores coherent duplicate EOF but rejects subsequent data. Ending the transport without protocol EOF reports OUTPUT_UNEXPECTED_END. `close()` releases retained journal data. No disk journal or recovery/replay of input exists.

## Security and display boundaries

Output history has no five-second authorization lifetime: it is bounded by retained bytes/events and explicit close. This protocol does not expose snapshotId, grant, input, lease renewal or execution capability. Keeping output for longer cannot extend or mint permission to write. Snapshot presentation remains experimental and keeps its existing five-second budget and eight-second RTT limitation; no time limit has been increased.

Bytes are deliberately preserved, including partial UTF-8, OSC 52/8, CSI, DCS and bidi sequences. They are **untrusted bytes**, never executed, rendered or echoed to a real terminal by this implementation. A future VT renderer must implement a separate security policy and must not turn parser-generated terminal replies into an unmediated input channel. Tests compare byte arrays; they do not print the sequences. The journal itself does not render VT or implement input arbitration. Separate source, observer and v2 geometry modules are described below; atomic terminal-state checkpoints remain unimplemented.

## Evidence and next increment

Tests cover two consumers seeing the same split-byte stream and explicit EOF; slow-reader eviction; retained-prefix replay and impossible resync after eviction; duplicates, overlap and ordering; all identity components; canonical base64; 10000 small events bounded by event count; maximum frame size; mutable source buffers; idempotent disconnect; malformed/oversized/fragmented framing; real MCP over memory streams; and isolation of legacy freshness evidence even when opt-in output expires. Existing lease/freshness tests continue to run.

The implemented source adapter, xterm observer and synthetic resize tests exercise
this protocol. [RUNTIME-ORDERED-OUTPUT.md](RUNTIME-ORDERED-OUTPUT.md) documents the
OFF-by-default launcher integration. Cloud transport acceptance remains pending.

## Subsequent opt-in geometry

[ORDERED-RESIZE.md](ORDERED-RESIZE.md) documents implemented v2 ordered geometry and dynamic resize only in the controlled synthetic PTY test. V1 remains fixed geometry. Paste/mouse event guards are unit-tested; browser gestures are covered by the synthetic Chromium harness described in COLLABORATOR-TODO.md.
