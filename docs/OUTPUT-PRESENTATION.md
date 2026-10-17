# Limited output presentation and cloud QA artifact

This module is a literal filtered transcript. The separate xterm observer now
provides VT rendering; see XTERM-OBSERVER.md. Neither implies arbitrary TUI compatibility.

## Implemented scope

`OutputPresentation` is a browser-compatible **filtered transcript**, not a terminal emulator or a screen snapshot. It consumes the existing ordered frames, validates identity, sequence, byte offset and canonical base64, and incrementally decodes UTF-8. It keeps up to 4096 UTF-8 bytes of transcript with a truncation flag. Invalid/incomplete UTF-8 fails closed and clears the transcript; the original journal still preserves arbitrary binary output.

It discards CSI, OSC, DCS, APC, PM and SOS control sequences, including split sequences. It does not store unbounded control payloads. Clipboard, title and hyperlink controls have no callbacks. C0/C1 controls except LF and bidi override/isolate controls are removed. CR/backspace do not reposition text; SGR does not create color; cursor movements, alternate screen and screen erase have no visual semantics. This can differ substantially from what a full terminal displays. Plain hyperlink-looking text remains text because the artifact uses textContent and creates no anchors.

Duplicates produce no new text. Gap, invalid frame or order violation clears text and decoder/parser state. Explicit resync resets to the stream start; the complete retained prefix must be replayed. Identity change fences the presentation permanently. EOF flushes the decoder and marks the view; incomplete escape strings are discarded, never interpreted. There is no write callback, response channel, command execution, title update or clipboard API.

## Fixed geometry policy and backend verification

The only supported geometry is **80 columns × 24 rows**, configured once on a newly created test PTY slave before its writer starts. The Python test helper uses TIOCSWINSZ and verifies TIOCGWINSZ on its own master before cleanup. No existing terminal or profile is affected. The presentation's resize method always rejects; UI layout changes do not send resize to the backend. This transcript remains fixed geometry. The separate v2 protocol supports controlled fixture resize; checkpoint recovery remains unimplemented.

The native PTY test now delivers each captured frame to two actual presentation instances as well as the byte receivers. It asserts equal filtered text, no raw escape character, fixed backend geometry and rejected presentation resize. The same test can export its synthetic-only frames with DOT_OUTPUT_QA_FILE for artifact generation. This is an explicit test output file, not a capture mechanism for real sessions.

## Standalone artifact

`scripts/presentation-qa.mjs --test-fixture PATH` validates the exported test fixture, requires identical streams, fixed geometry and EOF, and emits self-contained HTML. Both panes run the same OutputPresentation implementation embedded directly, with no remote dependency. CSP disables external resources and network access. Buttons replay the retained test prefix, deliberately introduce a gap in the agent view, and demonstrate rejected resize. Output is inserted only with textContent.

This is a replay of frames captured from one test-owned PTY, not a live terminal connection. Automated QA executes this embedded transcript with a minimal DOM and verifies equal UTF-8 output, control suppression, clearing on gap, replay and resize rejection. The separate xterm observer has Chromium QA; this literal HTML artifact has no browser visual acceptance claim.

Suggested visual checks: both panes show the emoji and same identity/offset/EOF; OSC payload is absent; gap clears only the agent pane; replay restores equality; resize reports disabled; browser width only changes layout. No clipboard, title, links or terminal replies should be created by output.

Lease, freshness, grant, input arbitration and the active tunnel are unchanged. This is a limited presentation step toward a shared terminal, not the final VT experience.

## Read-only xterm renderer

The original filtered-transcript limitation remains accurate for this module. A separate [xterm 6.0.0 observer](XTERM-OBSERVER.md) now uses original bytes; it does not turn this transcript into a VT emulator.
