# 0.1.11 experimental: clean read-session claim release

A normal native read session previously left its window reservation and helper
lock behind after closing. Newly prepared 0.1.11 helpers can release their own
new reservations after a verified clean close and reuse the same selected target.

Release requires exact live broker PID, process creation time, token SID and
Windows session identity, a permanently closed dispatch gate, no pending
operations and confirmed owned-worker shutdown. File acquisition remains
exclusive against both new and legacy consumers. EOF, transport close and
signals share the cleanup path. Failure and crash do not authorize recovery.

Historical reservations are not migrated, removed or adopted. Any possible
native input dispatch prevents automatic release, even after a reported
successful send. This is not a write-session recovery release and does not
make a currently reserved window ready for input.

The new owner executable only queries the broker's process identity. It is a
separate build of an already allowed C# source; no new port, service, network
access, administrator privilege or policy exception is required by the code.
Preparing Windows helpers remains a separate, explicitly coordinated action.
All executed helper modules and the owner executable are inventory-pinned.

Disabled lab experiments remain versioned in Git and excluded from both runtime
archives. Private/UNLICENSED and metadata-only plugin capability are unchanged.
The unchanged historical updater regression still verifies original archives,
checksums, configuration preservation and rollback. Local tests cover temporary
real files, OS-process races including legacy writers, real stdio shutdown and
crash fixtures, mocked terminal operations and Windows self-identity queries.
No GUI/input or AI provider tests were executed. No remote CI is configured.

Validation before publication: 107 tests passed, one Windows-only probe skipped
under Linux and separately passed on Windows; 6/6 Windows adapter tests passed.
Both C# variants compiled. Build, package checks and independent source review
passed. Real release download/update checks are reported separately.
