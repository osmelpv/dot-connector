# Ordered synthetic resize and observer input guards

This increment extends the existing journal, source ownership and xterm observer. No new dependency, process installer, active session, tunnel or permission is added.

## Opt-in protocol v2

V1 remains unchanged. An owner explicitly constructs `OrderedOutputJournal(identity,{version:2})`; readers/renderers must also select v2. There is no automatic upgrade. V2 adds resize events with exact fields version/kind/identity/seq/start/end/data/geometry. Geometry contains integer columns 20–160 and rows 5–60; data is empty and start=end. Resize advances the common event sequence but not the byte offset.

The first event must be geometry. The current synthetic owner and observer require initial 80×24 at byte offset zero, matching backend verification. Later owner resize events may change dimensions within the bounds. Only the journal producer capability has resize; read capabilities do not. A UI's direct resize method remains rejected. This capability separation is in-process ownership, not authentication for an arbitrary remote JSON source.

Geometry and data share the existing event ring. Its byte/event bounds are unchanged, so a geometry-only flood is bounded by event count. Evicted geometry produces a gap. A receiver cannot infer missing sizes or continue rendering after a gap: it requires a new observer and the full known prefix including initial geometry. Unknown versions, out-of-order events, malformed dimensions and identity mismatch fail closed.

The observer waits for the prior xterm.write callback before accepting another event. Resize during an in-flight write rejects without queueing; after completion the same unconsumed output event may be supplied in order. Duplicates never resize twice. Geometry changes are applied through the official xterm.resize API. EOF remains ordered; data/resize after EOF fails. This does not permit repeating uncertain terminal input, which is a separate unchanged protocol.

## Test-owned backend barrier

`attachSyntheticGeometrySource` consumes bounded supervisor events from a supplied exclusive binary readable. It shares the existing producer-claim registry with the raw source adapter, so the same journal/source cannot acquire a second producer through another adapter. It does not open or resize a PTY itself, run a command, accept remote control, or write terminal input. Geometry events must match the current captured byte offset. Missing EOF, malformed input or a wrong boundary clears the journal and closes the source.

The Linux native test alone creates a PTY using existing Python stdlib. Its single owner writes a small fixed output phase to the slave, drains exactly that phase from the master, verifies that no output remains pending, performs TIOCSWINSZ on its own slave, and reads back TIOCGWINSZ on its own master. Only then does it emit the resize event and start the next fixed output phase. Sizes are 80×24 → 40×12 → 100×30. Bytes are fragmented and carry normal CSI, UTF-8, OSC 52 and a terminal query.

There is one synthetic producer process, no shell or arbitrary child workload. It closes master/slave and emits cleanup evidence before EOF; Node verifies exit. Two consumers replay the same identity/sequence/offset stream through actual xterm 6.0.0, check all kernel geometry boundaries and compare screen state. No master input writes or renderer-generated replies are sent back.

This barrier is valid for the controlled test writer. It is **not** proof that arbitrary live applications, SIGWINCH reactions or asynchronous output can be resized atomically by the same approach. Extending it to a live backend needs a real producer-side barrier and lifecycle design; none is deployed here.

## Paste/mouse guard

Before opening xterm, the observer registers capture-phase, non-passive handlers on its mount element for paste/beforeinput, key events, mouse/pointer/touch events, wheel, drop/dragover and copy/cut. They prevent default and stop immediate propagation. The list is frozen, handlers are removed on disposal, and a fenced renderer cannot reopen. This conservative observer mode also disables selection/copy/wheel gestures; that usability limitation is explicit.

The prior disableStdin, altClickMovesCursor, empty windowOptions, OSC interception and discarded onData/onBinary events remain. No input sink exists. Actual xterm parser tests still check automatic replies and zero forwarded bytes.

The guard test uses Node EventTarget and a test-mounted subclass of the real Terminal: it validates cancellation/listener order and defaultPrevented before simulated renderer listeners. It is **not** a browser event propagation, system clipboard, paste(), real mouse gesture or visual QA result. The separate scripts/browser-observer-qa.mjs harness now exercises real browser gestures and distinguishes injected DOM events. See COLLABORATOR-TODO.md for reproduction.

## Validation changes

New cases: v2 resize/data ordering, both renderers, version rejection, initial geometry, direct resize denial, invalid dimensions, gaps, resize while busy, duplicate resize, geometry-only memory bound, guard events, malformed supervisor boundaries/missing EOF and actual dynamic PTY resize with cleanup. Existing v1, burst, cancellation, OSC, lease and configurator suites remain applicable.
