# Owned control-client cleanup evidence

`createOwnedTmuxOutput().close()` returns true only after the child emits `close`.
Node's [`error` event](https://nodejs.org/api/child_process.html#event-error)
also covers failed signal delivery and is not proof of process termination.
[`exit`](https://nodejs.org/api/child_process.html#event-exit) prevents further
signals, but streams may still be open; it does not complete this join.

Cleanup requests SIGTERM, waits up to three seconds for close, then requests
SIGKILL only if the process has not exited or failed to spawn, and waits up to
one additional second. Without close, cleanup returns false and the session
cannot report a verified stop even if its server/pane exit check succeeds.
An error before spawn with no child PID rejects startup; cleanup still waits
for close rather than treating the error as confirmation. Signal errors and
synchronous signal exceptions never substitute for close.

Concurrent calls share one cleanup promise. Local streams are destroyed once
after the bounded join attempt. A late close cannot change a result already
returned as false. Repeated errors remain handled. No new public configuration,
arbitrary attach interface or mutation scope is introduced.

The regression uses EventEmitter/PassThrough child fixtures: ready child with
kill errors but no close, eventual close after escalation, signal delivery with
no exit, exit without stream close, spawn failure, synchronous signal exceptions,
concurrent close and propagation to `TmuxSession.stop()` as `stop_unverified`.
This reproduces the JavaScript lifecycle defect, not a native OS kill failure.
Native Linux tests exercise only newly created, owned synthetic sessions.
Windows native cleanup behavior is not established by these tests.
