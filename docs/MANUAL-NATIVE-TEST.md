# User-run native visible-text test

This is a manual-only experiment, not an enabled agent integration. The user runs it on Windows and deliberately selects a synthetic test terminal. The agent must not invoke the probe's read mode or use it to bypass unavailable computer-use tools.

## What to do

1. Manually open a separate, empty Windows Terminal window with ordinary PowerShell, not Administrator. Do not use a terminal containing personal work, credentials, an AI session, or private scrollback. Type `Write-Output DOT_NATIVE_TEST_7F3A2C9B` yourself. Leave the resulting standalone marker line visible.
2. In a different PowerShell window, run the supplied exact command for the verified local `manual-native-test.mjs` artifact with Windows Node. No install is required. Do not use WSL Node or the `--check-only` option for the actual manual test.
3. The probe announces a 10-second countdown. During that interval, focus the safe synthetic-output window and leave it focused without typing. That exact foreground window becomes the target; no title guessing or automatic window selection is performed. Do not focus any personal terminal instead.
4. After approximately 15 seconds total, manually return to the launcher window. It prints one JSON result. Send only that result line back; no screenshot or terminal contents are needed. `PASS` / `VISIBLE_MARKER_LINE_MATCHED` confirms that a standalone marker line appeared in the bounded UIA visible ranges. The echoed command alone cannot pass. A refusal/timeout prints a generic `FAIL` diagnosis; do not retry automatically.

The result contains HWND, PID, process start ticks, truncation state and elapsed time, not terminal text, window titles, paths, full history or raw exceptions. The user may close their own test windows normally afterward. The probe does not open, close, activate or type into windows.

## Scope and reviewed paths

Own executable sources: `src/manual-native-test.mjs`, `src/native-supervisor.mjs`, `src/native-manual-probe.cs`, and `src/native-uia-provider.cs`. The compiler/runtime references are existing Windows .NET Framework, UIAutomationClient, UIAutomationTypes, WindowsBase and System.Web.Extensions; Windows Node is already installed. These platform components are trusted dependencies, not comprehensively audited source.

The JS entry waits for deliberate user selection, then supervises one hidden own child for at most five seconds. Cancellation/timeout kills only that child process object and waits for close; unconfirmed cleanup disables the supervisor. No global hooks, clipboard, input, focus changes, elevated launch, downloads or security-policy changes are included. Binding uses HWND/PID/start time and the focused element's exact RawView ancestry; subsequent resolution rejects ambiguous/missing identities, nonforeground targets, elevated/inaccessible processes and nondefault desktops.

The probe requests `GetVisibleRanges` only, with at most 64 ranges and 16,000 UTF-16 code units. It matches a standalone synthetic line and discards the text without printing it. It traverses bounded UIA ancestry and sibling identity metadata; it does not read sibling text. A foreground selection mistake could still read up to the bound from the wrong allowed terminal, so deliberately choosing the empty test window is essential. This is not proof of full fidelity, pixel visibility, safe arbitrary applications, or native input.

## Pre-delivery checks

Both C# artifacts compile offline using existing `csc.exe`; no package restore. Three pure marker self-tests pass, including rejecting echoed-command-only and substring-only matches. The supervised `--check-only` codec path passes with `nativeCalls:false`. Existing supervisor deadline/cleanup tests have passed on owned fixtures. A separate reviewer inspected every own executable-source path and the build/test evidence. No UIA call has been executed by the agent.

Actual target binding, UIA visibility behavior, native-call timeout and target-specific refusal behavior remain unverified until the user runs the manual test. Automatic native integration stays disabled. A successful manual test does not authorize automatic use.

## First manual result and diagnostic correction

The user's first real manual run returned `TARGET_READ_REFUSED_OR_TIMEOUT` in 102 ms. That old message collapsed provider refusals, launch/protocol failures and deadlines. The duration does not meet either the 5,000 ms supervisor deadline or the 1,000 ms provider elapsed gate. An immediate refusal/error is supported; its specific cause is unknown. A working-directory prompt containing System32 does not establish elevation.

The revised probe returns fixed gate codes without text or raw exception details. Examples: TARGET_ELEVATED and READER_ELEVATED explicitly distinguish which queried token was elevated; TARGET_PROCESS_UNSUPPORTED, FOREGROUND_MISMATCH, UIA_PANE_NOT_FOCUSED, UIA_TEXT_PATTERN_UNAVAILABLE and UIA_FOCUSED_ANCESTRY_UNRESOLVED identify refusal stages. Token-query failures are separate from elevation. A genuine supervisor deadline is WORKER_DEADLINE_EXCEEDED; invalid JSON/failed launch/worker exit have separate codes. A stage code identifies the failed boundary, not necessarily its ultimate Windows cause. No permissions or protections are weakened to diagnose it.

The next manual run is diagnostic, not a blind retry: retain the synthetic terminal and return the new single JSON line. Stop after one result; do not change permissions or run elevated. Revised own-source tests and independent review precede delivery; the agent does not execute the UIA path.

## Token-query defect reproduced and corrected

Two user runs stopped at TARGET_TOKEN_QUERY_REFUSED after 99/111 ms. That stage previously covered both token opening and the elevation query. An isolated own-process-only check reproduced a code defect: GetTokenInformation(TokenElevation) with length 4096 returned false, Win32 24, required length 4; passing length 4 succeeded. The reader now allocates/passes exactly four bytes for TOKEN_ELEVATION. TokenIntegrityLevel uses a zero-length size query (expected Win32 122), validates a bounded required length and allocates/passes that exact size. An own-process test observed required length 28 and a successful exact-size query.

OpenProcess remains PROCESS_QUERY_LIMITED_INFORMATION (0x1000), and token access remains TOKEN_QUERY (0x8). No permissions were expanded. Elevated and above-medium targets/readers remain rejected. Relevant P/Invoke declarations now preserve last error; failures immediately capture only its numeric value before cleanup. Fixed stage codes distinguish process access, token opening, elevation query and integrity query. No token bytes, SID, account details, handles or raw Windows messages are returned.

The actual compiled provider's own-process integrity self-test passed without UIA; the manual probe now reports five self-tests with uiAutomationCalls:false and ownTokenQuery:true. The JSON-only supervised check also passed. This confirms the correction in the same Windows environment, not successful reading of the user's target. Independent source review precedes the next one-time manual test; no Administrator launch or security change is requested.

## User-reported manual outcome

The user ran the corrected probe and reported PASS / VISIBLE_MARKER_LINE_MATCHED, source TextPattern.GetVisibleRanges, truncated false, elapsed 261 ms. This was user execution, not an agent UIA invocation. It confirms the standalone synthetic visible line for the selected target; keyboard and autonomous native operation remain unverified and disabled. See STATUS.md for current source/artifact identities and exact next gates.
