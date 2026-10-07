# Native claim lifecycle: 0.1.11 experimental

This version implements file reservations, Windows owner identity and MCP
shutdown integration. Updating the consumer does not upgrade an existing native
helper or migrate its real claims; helpers are prepared and verified separately.

## Original defect and scope

The published implementation reserves {hwnd,pid,startTimeTicks} for an entire
terminal window, deliberately excluding panePath. Its close path pauses control
without releasing the global reservation or helper server.lock.

The recorded later selection had the same window/process/start identity but a
different UIA leaf. That proves a window-level reservation collision; it does
not establish why that window was selected. Repeating SELECT is not a fix.

## Implemented protocol

- native-claim-store.mjs serializes cooperating callers with an exclusive
  adjacent guard directory. Acquisition publishes the actual claim with wx,
  never replacement rename: older clients that ignore guards also use wx.
  A crashed or uncertain mutation leaves its guard/claim and blocks reuse.
  There is no expiry, age-based takeover, retry loop or dead-owner reclamation.
- native-claim-lease.mjs records a canonical target, random nonce and immutable
  owner PID, process creation ticks, token SID and Windows session ID.
  Release compares the exact acquired record while holding the guard.
- native-owner.mjs binds every OS query to process.pid of its own Node caller.
  The OWNER_IDENTITY build of native-control-host.cs uses read-only process
  handles and token queries; it does not enumerate processes, use UIA, focus
  windows or send input. Identity is checked at acquisition and release.
- NativeControl reserves the helper before the global window and resets the
  grant before becoming ready. Close synchronously shuts the dispatch gate,
  waits for opening and tracked operations, stops/reaps owned workers,
  invalidates the snapshot, pauses the grant and verifies owner/quiescence.
  It releases the window first and the helper last. Operation journals remain.
- native-lifecycle.mjs connects EOF, transport closure, input error and supported
  signals to one awaited close. No forced successful exit hides cleanup failure.

The supervisor permanently rejects new requests after shutdown. Cleanup that
cannot confirm termination leaves reservations blocked. A failed/uncertain open
may also retain the helper reservation rather than risk unsafe cleanup.

## Deliberate limits

Any attempted native dispatch permanently prevents automatic release for that
session, even if SendInput was reported successful. OS dispatch is not proof
that the terminal consumed input; closing a worker cannot retract queued input.
This candidate therefore fixes clean read-session reuse, not the complete
write-session recovery problem.

Legacy records contain no verifiable owner/quiescence evidence. They remain
blocked. Nothing here retires, deletes, adopts or rewrites historical claims.
Abrupt termination also requires a separate reviewed recovery procedure.

The filesystem protocol assumes cooperating software, stable local filesystem
paths and normal same-user file permissions. It is not a security boundary
against malicious code running as that user. Guard creation and exclusive
file creation protect process races; process-crash tests do not establish
power-loss/filesystem durability. No guarantee is claimed for network shares.
A storage error after a commit may leave its result unknown; the lease blocks
without retry and the record is not assumed present or absent.

## Packaging and verification

The identity executable is a separate preprocessor build of the existing
allowed native-control-host.cs source. This preserves compatibility with the
historical updater without broadening its source allowlist. Helper preparation,
source copying and inventory verification include the four new JS modules and
the identity executable.

Local tests cover real temporary files and competing Node processes, including
legacy wx writers; exact-owner release and stale/corrupt guards; mocked terminal
operations; deferred opening/read during close; owner mismatch; possible input
retention; supervisor shutdown/spawn failure; and real stdio EOF, POSIX signals
and abrupt termination of owned fixtures.

Windows validation compiled both C# variants, but executed only the identity
variant against its own live Node caller. Real Windows temporary-file and
concurrency tests passed. No terminal UIA/input operation was executed.

Independent source review found and closed three issues: replacement rename
versus legacy acquisition, close during opening, and unresolved completion on
synchronous spawn failure. The earlier simulation also closed identity-alias
and mutable-owner findings.

## Deployment boundary

No installed helper, real claim, target, grant or consumer was touched.
No GUI, new port, tunnel, service, credential, policy, ACL or administrator
elevation is introduced by these local tests. No publication or push occurred.

A deployment would add one read-only identity executable and four modules to a
new verified helper, and change normal clean shutdown to release its own new
reservations. It needs review before installation. A real terminal trial must
be announced and coordinated before focus is required. Historical claim
migration and write-session recovery are separate unresolved actions, not
permission to delete locks.
