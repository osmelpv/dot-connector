# Future-session console laboratory (unpublished)

This local experiment is separate from published/installed 0.1.10. lab/ is excluded from runtime archives and is not included in the npm package. No CLI or product helper activates it. Its executable accepts only --self-test with fake APIs; normal arguments return unavailable. No actual wsl.exe, attachment, viewport read or input has been executed for this experiment. The separate 0.1.10 helper was subsequently prepared with its own explicit approval from verified release files; this laboratory was not included. Its real metadata transport success does not validate this experiment.

## Why a future-session launcher

The pinned [WSL svccomm.cpp](https://github.com/microsoft/WSL/blob/c40740d870fb6441ddbe5bb4042e1aaf0f9697b7/src/windows/common/svccomm.cpp#L447-L481) obtains standard input with GetStdHandle. Sharing a console does not prove that this handle points to its input buffer: it may be redirected. The candidate launcher opens CONIN$ and CONOUT$ and supplies all three child standard handles explicitly; stderr shares CONOUT$. STARTUPINFOEX restricts inheritance to those two handles. The native declarations and backend compile, but their behavior is untested. The candidate uses the system wsl.exe with no caller-supplied command string; distro/shell selection is not implemented.

The launcher waits synchronously for its owned child. Controller disconnection leaves operations disabled and does not return while the child is live. Wait errors disable operations and continue waiting; they never signal success or kill the child. It never reads stdin. Process/thread and console-handle cleanup is attempted independently and failures remain cleanup unknown. There is no implemented controller endpoint or authentication. Forced termination of the launcher/OS failure is outside the tested disconnection contract; maintaining the parent-shell invariant under such termination is unresolved and must be addressed before a live trial.

This prepares a future session only. It does not adopt an existing OpenCode/TUI or prove that input reaches one already running. Starting this from a WSL shell is not proof of the outer Windows Terminal console because interop may introduce another ConPTY. A future native PowerShell/cmd launch must separately establish pane identity and input routing.

## Read-only ConsoleProbe code

The inactive probe takes a copied expected identity (PID, creation ticks, owner and session), compares it with a provider observation before attach, after membership lookup and after reading, bounds GetConsoleProcessList to 64 entries, and reads at most a 200-by-80 viewport (16,000 cells) using ReadConsoleOutputW. It rejects a changed identity, missing membership, oversized viewport, failed/partial read or resize. Only its own successful attachment is detached. It does not consume the input buffer, change focus/modes or write input. Cleanup uncertainty suppresses returned text.

The OS-backed identity provider is not implemented: the callback is an internal test seam, not trusted evidence from arbitrary JSON. Keep the helper unavailable until owner/session/process lifetime and authorization are independently verified. A real API-compatible read would prove only console output. Correlation with UIA or a viewport is at most output-correlated, never input-proven; the result always has InputProven false. Process lists, WT_SESSION and markers cannot replace the missing route proof.

## Verification and next gate

Compile using existing .NET Framework x64 csc with warnings as errors and run only --self-test. Fake cases cover controller disconnect/wait failure, one-shot launch, cleanup failures, PID-start/owner/session mismatch, process-list limits, read/resize failures and viewport bounds. Source tests forbid product activation, input/focus API calls and runtime packaging of lab files. These checks validate state-machine logic and layout declarations, not native handle inheritance, WSL behavior or actual target identity.

A future live lab launch, even with no input, would require explicit separate authorization naming the new disposable session and the reviewed activation mechanism. No real launch command is exposed now. No grants, credentials, named pipes, shell hooks or persistent access were created by this work.

Local result: x64 compilation with warnings as errors and 21 fake assertions passed; three source isolation tests and the existing 93-test suite passed. Normal --launch is refused. Independent read-only review closed the resource-cleanup and identity-copy findings. No actual wsl.exe or ConsoleProbe native execution occurred.
