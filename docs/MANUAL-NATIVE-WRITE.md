# Manual fixed-text experiment

This is a user-run experiment, not a connected dot write tool. Independent source review approved this limited experiment. Compilation, input-layout self-test and request validation passed without UI Automation or SendInput calls. The user subsequently reported a successful manual run: PENDING_MARKER_VISIBLE_NO_ENTER, 28 input events, 410 ms. This is manual evidence only; the prepared artifact has consumed its one attempt and must not be automatically rearmed.

Use only the existing synthetic terminal that passed the manual reader. The prepared private configuration pins its HWND, PID and process start time. There is no automatic retargeting. No administrator privileges or security-policy changes are needed.

1. In that same synthetic PowerShell terminal, manually run:

   ```powershell
   function prompt { 'DOT_WRITE_READY> ' }; Write-Output DOT_NATIVE_TEST_7F3A2C9B
   ```

2. Leave its new prompt empty. From another PowerShell window, run Windows Node with the prepared `manual-native-write.mjs` path supplied by the operator.
3. Type `ARM` in the launcher. Within ten seconds, focus the same synthetic terminal, then release the keyboard and mouse. Do not type during dispatch.
4. The sole attempted input is `DOT_WRITE_TEST`, without Enter. Leave it pending; do not press Enter to verify it. Return to the launcher and report its JSON result plus whether the marker appeared.

The worker checks the foreground target, exact UIA ancestry, visible synthetic marker, empty prompt and visible collapsed cursor. It rejects elevated targets and held modifiers or mouse buttons. A persistent atomic attempt file permits only one dispatch attempt from this prepared artifact, including concurrent invocations. It is never removed automatically.

There remains a non-atomic race between checking focus and SendInput. Keep the machine untouched during dispatch. Ctrl+C cancels remaining work and terminates only the owned worker; it cannot retract events already queued or sent. A timeout, partial send, failed post-read or cancellation may leave an unknown outcome. Inspect the terminal; do not automatically retry, rearm, erase input or send cleanup keys. The human ARM workflow is operational consent, not authentication against another program running under the same account.

The five-second supervisor deadline bounds waiting for the worker. The fixed-marker path passed one user-run test. Broader native UI compatibility and observed cancellation behavior remain unverified. Nothing here establishes agent access through dot or atomically routes SendInput to a specific pane.
