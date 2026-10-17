# Opt-in ordered snapshot output (unreleased)

`bridge_read` keeps its legacy response when called with binding and after.
The additive format `snapshot-v1` requires generation from a fresh status:

```json
{"binding":{"machineId":"local","projectId":"synthetic","incarnation":"12345678-1234-4234-8234-123456789abc","session":"$0","pane":"%0"},"after":0,"format":"snapshot-v1","generation":0}
```

This returns a full replacement snapshot: version 1, kind snapshot, encoding
literal-text-v1, identity (all five binding fields plus generation), seq, after,
baseSeq=seq, resync, reason, skippedSnapshots, text, truncated, lossless=false,
expiresAt and validForMs. No input token or grant is added. Legacy input requires
its existing fresh read, local human grant and generation checks.

There is no event journal or VT byte stream. Each successful capture increments
the existing bridge sequence; human and legacy reads also consume that sequence.
A gap therefore indicates unobserved snapshots, not a count of lost PTY bytes.
One opt-in capture per bridge may be in flight; overlap returns OUTPUT_BUSY
without queueing. A future cursor is invalid and exhaustion remains fenced.
Binding/generation are checked before capture and after it; a changed epoch
returns OUTPUT_BINDING_CHANGED without content. No silent fallback to after=0.

Limits: 4096 UTF-8 bytes of escaped text, 16384 bytes of JSON per envelope, no
retained producer history, one snapshot and one in-flight request per receiver.
Text keeps the newest suffix at complete Unicode/escaped-token boundaries.
These are post-parse envelope limits, not an end-to-end transport memory bound.
The new BoundedOutputMcp transport bounds supplied client streams before JSON
parsing; foreign SDK clients and the active tunnel are not patched. See
[ordered output](ORDERED-OUTPUT.md) for precise transport and queue limits. No disk output or
background poller is introduced. Snapshots can miss transient output and report truncation.

The producer budget is at most 5000 ms from request admission, including capture.
Elapsed time uses a monotonic clock. expiresAt is informational wall time; the
receiver uses its own monotonic request start plus validForMs, conservatively
charging transport/capture latency (capture is counted in both budgets). A 2s
capture and 4s RTT are rejected. RTT of eight seconds is rejected; no TTL or
grant is extended. Reading while paused remains permitted by the existing
read-only session policy; paused still denies ungranted agent input.

`SnapshotOutputReceiver` is a pure presentation state machine, not an adapter.
Pin its complete identity from the selected instance; begin() creates the next
request. accept() validates a bounded response, rejects unsafe controls and
replaces the entire text. Duplicates never extend freshness. A gap clears the
view and requires explicit begin({resync:true}); the resulting full snapshot
replaces state and labels it resynced. Binding changes clear the view and require
a newly selected receiver; epochs are never mixed. failed() clears content on
transport failure. view() clears expired content when read. A future UI must
call view on its render/timer loop and erase its rendered copy on expiration;
this module does not control a DOM, terminal window or persisted file.

Render text using textContent or a literal output API; never innerHTML, shell
eval, formatting strings or VT interpretation. The module exports no input,
grant, revocation, filesystem, network or terminal controls. It does not connect
Xfce, consume credentials or adopt an existing shell. The cloud adapter remains
to be implemented and tested on the actual selected transport.

## Scope and integration

Snapshots remain a bounded fallback and cannot be converted into a lossless
byte stream by diffing captures. The separate [ordered byte protocol](ORDERED-OUTPUT.md)
uses a real source hook in the [opt-in runtime](RUNTIME-ORDERED-OUTPUT.md).

Observation-only reads do not replace legacy input freshness evidence or bridge
tokens. They still participate in ordinary lease expiry and snapshot sequencing.
The [configurator](CONFIGURATOR.md) only validates plans; it creates no permissions,
isolation backend or document-transfer capability.
