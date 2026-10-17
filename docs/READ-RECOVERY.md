# Read-only recovery from a retained beginning

The optional human browser view can recover from a transport cut without
reopening the terminal, repeating input or granting control. This only recovers
HTTP reads against the same running CLI companion and its existing human IPC
client; it does not reconnect a lost terminal or adopt another session.

The first successful config pins all six identity fields, including incarnation
and streamEpoch, and the known initial 80×24 geometry. Before identity is known,
a failed connection stays closed. Each later transport failure disposes the old
renderer. There are at most two recovery attempts over the page's lifetime, with
250 ms then 500 ms waits. Each request has a 10-second browser deadline; the
underlying IPC deadline stays eight seconds. HTTP errors are explicit source
rejections and are not retried.

Recovery fetches config again and requires the exact pinned identity and geometry.
It creates an empty XtermObserver and reads ordered frames from cursor (0,0).
The first frame must be the initial resize at sequence 1, offset zero. Each frame
is validated by the existing renderer. The view displays Rebuilding until the
previously accepted sequence/offset is reached; that means its previous view is
reconstructed, not that all newly generated output has already been consumed.

No bytes or checkpoints are retained by the recovery controller: only identity,
sequence, offset and counters. Existing journal capacity and renderer scrollback
are unchanged. Repeated data is consumed by a fresh renderer rather than appended
to the old screen. Duplicate frames are ignored by XtermObserver; more than two
duplicate responses without progress terminate the read loop.

Any missing prefix/gap, changed identity/epoch, unknown geometry, invalid frame,
or incomplete replay (idle/EOF before the former accepted position) stays closed
with a stopped message. A gap is not repaired by displaying a suffix. Recovery
can fail if the prefix is evicted while replay is underway. There are no new
checkpoints, serialization addons, retention changes or dynamic resize.

Disconnect view and pagehide abort a pending request or recovery delay and
dispose the renderer. Cancellation during rendering joins the pending callback
through the existing observer cancellation mechanism. EOF ends polling; the
final screen remains until disconnected. No recovery starts after cancellation
or EOF. Manual page reload begins a new observation attempt, still subject to
identity/prefix validation; it grants no terminal authority.

Input pause/revocation continues to preserve observation by design. Explicit
source closure/rejection invalidates the reader, without attempting a new grant.
There is no input/control API in the reader: only /config and /frame GETs.

Tests cover cuts before/after a frame, a lost response, exact reconstruction,
duplicates/no progress, all identity fields, missing prefix, unknown geometry,
bounded attempts, source rejection, cancellation during read/render/wait and EOF.
Chromium QA cuts the HTTP transport before a response and after fetching it from
the real owned runtime, checks identical reconstructed screens, then verifies a
third cut stops recovery. These are synthetic-owned fixtures, not an active
tunnel or real user terminal. The local cooperative security limits documented in
[LOCAL-HUMAN-VIEW](LOCAL-HUMAN-VIEW.md) remain unchanged.
