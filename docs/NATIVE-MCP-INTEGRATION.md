# Manual native MCP integration (development)

This is a user-launched Windows synthetic-terminal test route, separate from the released diagnostic plugin. The server now exposes real adapter operations for `terminal_snapshot`, `terminal_input` (paste or separate submit), `terminal_pause`, and metadata-only `terminal_status`. MCP protocol tests use a simulated native provider; they do not establish actual UI behavior. The agent must not invoke the manual route to bypass an unavailable supported computer-use runtime.

## Implemented boundaries

- User selection binds HWND, PID, process start time and exact UIA ancestry. Reads use the existing supervised, bounded visible-range contract and reject elevation, changed identity and focus.
- A persistent claim under the Windows user's `.dot-connector/native-target-claims` excludes another participating installation from the entire terminal HWND, including sibling panes. Claims and server locks are never automatically removed. This coordinates this implementation, not arbitrary programs or older standalone writers.
- Human grants name one operation ID, kind, exact text and expiry. MCP exposes no arm or retarget tool. The native worker rechecks the grant immediately before dispatch. Grant files are a cooperative workflow, not an OS security boundary against the same user.
- Paste accepts at most 256 UTF-16 code units of single-line text without controls. Submit is a separate explicit grant and emits VK_RETURN down/up. Synthetic prompt, visible collapsed cursor and exact pending text are checked before both actions. Wrapped or incompatible prompt layouts fail closed.
- Operation journals and native attempt files prevent replay. No queue, automatic retry, cleanup keystroke, focus activation or lock reset exists. Pause invalidates snapshots and cancels the owned worker. It cannot recall queued OS input; post-dispatch cancellation or partial send has an unknown outcome. Focus checking and SendInput remain non-atomic. Human typing is not automatically detected.
- Errors at the MCP boundary use a fixed public message rather than raw exception text or private paths.

## Prepared manual test

The prepared Windows artifact contains the reviewed DLL/EXE, source modules and an isolated copy of existing locked dependencies. It does not reuse the consumed earlier manual-writer state. No target or human grant is prepopulated. Native calls require the explicit `MANUAL_NATIVE_INTEGRATION` compilation symbol; the ordinary native host stays disabled. Compilation and `--self-test`/`--validate-only` checks perform no UI Automation or SendInput calls.

In a deliberately chosen empty synthetic PowerShell terminal, the user manually runs:

```powershell
function prompt { 'DOT_WRITE_READY> ' }; Write-Output DOT_NATIVE_TEST_7F3A2C9B
```

From another Windows terminal, the user launches Windows Node with the prepared `manual-native-mcp.mjs` path. Type SELECT, focus the synthetic terminal during the ten-second countdown, and release keyboard/mouse. The consumer verifies the synthetic marker, saves the exact target once, claims it and connects its MCP server.

Choose READ first. For PASTE, use `DOT_WRITE_TEST` and type `ARM PASTE`; focus the synthetic terminal during the countdown. Verify visually that it remains pending without Enter. QUIT is sufficient for this first test: submitting `DOT_WRITE_TEST` is unnecessary. The SUBMIT action is available for a separately coordinated harmless command, requires the exact pending text and `ARM SUBMIT`, and must not be used on an AI prompt without prior coordination.

PAUSE changes only the manual control file and cancels owned work. Ctrl+C stops remaining work but cannot reverse dispatch. On any refusal, cancellation or unknown outcome, inspect the terminal and stop. Do not delete claims or attempt files to retry. A new target/session requires an explicit reviewed selection workflow; this initial consumer deliberately refuses to overwrite its target file.

## Evidence still needed

Source review, compiler checks and simulated-provider MCP tests are complete; real MCP-to-UIA/SendInput validation remains pending the user's run. Earlier standalone manual read/write PASS results are not evidence for this new route. No OpenCode/ArtisanFeed configuration or published release was changed to enable native control. Dot invocation remains subject to a supported runtime and its policy, independently of the implementation and manual test.
