# Read-only xterm observer

The exact dependency is @xterm/xterm 6.0.0, pinned in package-lock.json. Its MIT
license applies to that dependency; the repository remains UNLICENSED.

XtermObserver feeds original Uint8Array bytes into the real xterm parser.
disableStdin, disabled alternate-click movement, empty windowOptions and bounded
scrollback accompany consuming OSC handlers for title, hyperlinks and clipboard.
Outbound onData/onBinary events are discarded; there is no terminal input sink.
DOM guards prevent keyboard, paste, mouse, selection and drag/drop effects.

Identity, sequence and byte offsets must match. One asynchronous write of at most
16 KiB may be pending, with a three-second deadline and no queue. Duplicate frames
add no bytes. Gap, mismatch, invalid frame or reorder disposes the renderer and
requires a new instance with a complete retained prefix. No checkpoint recovery
from a partial suffix is implemented. EOF follows the final acknowledged frame.

Initial geometry must be 80x24 at sequence/offset zero. V1 stays fixed; opt-in v2
accepts ordered owner geometry events. Dynamic resize is tested only with the
controlled synthetic PTY fixture. The runtime source stays fixed at 80x24 and
fences unexpected geometry changes. Browser layout cannot resize the owner PTY.

Unit tests use the actual parser and public buffer API. Native tests feed two
observers from one owned PTY. The Chromium harness tests real DOM rendering,
fragmented UTF-8/VT, keyboard/paste/mouse guards, OSC blocking, narrow layout and
lifecycle disposal. An optional trace replays bytes actually delivered by MCP.
This is recorded-output replay, not a live browser-to-PTY or cloud connection.
See [reproduction commands](COLLABORATOR-TODO.md).

No arbitrary TUI compatibility or complete browser-security guarantee is claimed.
Emoji width can differ from other terminals; no Unicode addon is installed.
scripts/xterm-qa.mjs can produce self-contained synthetic HTML using installed
JS/CSS/license and an explicit fixture path; keep generated artifacts outside Git.
The [planner](CONFIGURATOR.md) remains independent and never activates a runtime.
