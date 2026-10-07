# Focusless console candidate: design only

An isolated C# adapter prototype is implemented, but no native binding provider or product adapter is enabled. The pure console-identity module accepts synthetic evidence for contract tests; its provider-bound label is not authentication. It is not wired into the CLI, discovery, authorization or input path. All execution capabilities remain false.

## Metadata contract

A bounded list (at most 128) contains opaque pane ID, console/session ID, Windows host PID plus creation ticks, actual client PID plus creation ticks and executable kind, binding generation and observation timestamp. WSL additionally requires distro identity, tty and session identity. Responses whitelist these fields and exclude command lines, environment, window titles and screen contents. IDs and process creation times must be revalidated immediately before any future operation; the five-second maximum age is only a rejection bound, not protection from races.

Missing targets, multiple candidate associations, stale/future evidence, unsupported client identities and incomplete WSL identity fail closed with distinct errors. Matching window titles, process ancestry, executable name and GetConsoleWindow do not prove pane-to-client mapping. A future trusted provider must establish the complete pane ↔ client ↔ console ↔ WSL distro/tty association, plus current user/session ownership, before capabilities can become available. Such a provider has not been found or tested for this existing terminal. Never attach to the shared WindowsTerminal.exe host PID.

## Candidate mechanics and limits

A future ephemeral Windows helper could use AttachConsole with the exact validated client PID, then CONIN$ and WriteConsoleInputW. Read transport remains separate (UIA visible range or CONOUT$ with separately verified semantics). Attach success proves attachment to a console, not that it is the selected visible pane. Microsoft documents that GetConsoleWindow in a pseudoconsole returns a message-queue handle whose window is not displayed. WSL source consumes INPUT_RECORD; this supports investigation, not a guarantee for every terminal or application mode.

WSL interop can create another ConPTY when a Linux shell launches a Windows helper. Inheriting that helper's console therefore does not prove membership in the outer Windows Terminal console. This conclusion follows the pinned [WSL interop.cpp](https://github.com/microsoft/WSL/blob/d8e5d9826bc0fde480774b295bd236500c76d178/src/windows/common/interop.cpp) and [Linux binfmt.cpp](https://github.com/microsoft/WSL/blob/d8e5d9826bc0fde480774b295bd236500c76d178/src/linux/init/binfmt.cpp). WT_SESSION or an observed marker can corroborate an output route; neither proves the input route through tmux or other relays. No sufficient public resolver for arbitrary pane/client/console/tty association was found. Generic WriteConsoleInput toward WSL remains blocked.

Two unimplemented design alternatives have distinct scope: a helper started natively from PowerShell/cmd could inherit that native console and authenticate its peer over a named pipe; a temporary Linux-shell cooperative endpoint could use SO_PEERCRED plus process/tty lifetime checks. Neither alone proves the visible pane binding. The Linux-shell alternative occupies the prompt and cannot control an already-running OpenCode or other TUI. That running-TUI case is the user's priority, so shell cooperation is not an equivalent solution. No endpoint, named pipe or shell integration is created here.

Paste must exclude implicit submit; Enter remains a separate authorized operation. Check both API return status and the count actually written. Partial write or lost acknowledgement means uncertain outcome: pause and never resend the entire payload blindly. Success acknowledges enqueued records, not application consumption. Records can sit behind existing input. Do not flush the shared input buffer to cancel: it may contain human input. Cancel only connector operations not yet dispatched; reliable automatic detection of human intervention and recall of already written records are unproven. No global keyboard fallback or focus change is permitted.

WezTerm/tmux pane IPC may be preferable when the existing session already belongs to them. Moving the user's existing terminal into a replacement session is outside this design.

## Primary references

- https://learn.microsoft.com/en-us/windows/console/attachconsole
- https://learn.microsoft.com/en-us/windows/console/getconsolewindow
- https://learn.microsoft.com/en-us/windows/console/writeconsoleinput
- https://github.com/microsoft/WSL/blob/d8e5d9826bc0fde480774b295bd236500c76d178/src/windows/common/HandleIO.cpp

The community injector is not incorporated. No attachment, process enumeration, window read or input was performed for this design.

## Isolated compiled prototype

`src/native-console-prototype.cs` defines IConsoleApi, an unused Windows implementation and a single-use Adapter. The executable supports only `--self-test` with a fake API; every other invocation exits unavailable without parsing a target or text. No product launcher or native preparation script includes this helper. The Windows implementation is never constructed by the executable. Compile with the existing .NET Framework x64 compiler; no policy change or runtime installation is required.

The adapter validates bounded literal UTF-16 text, rejecting controls (including CR/LF, tab, ESC), unpaired surrogates and line separators. It builds Unicode key-down/up records without a virtual Enter key, then requires an internal cooperative binding check both before attachment and before writing. That callback is a test seam, not a production identity proof. An existing attachment causing AttachConsole failure is not detached or adopted. Only a successful owned attachment is freed, and valid input handles are closed even after write failure. There is one write call and no retry, including partial, excess, zero-count and lost-acknowledgement results. Success means enqueued, not consumed. Close/detach failure overrides the result with cleanup unknown.

The 20-byte INPUT_RECORD layout uses DWORD/BOOL-sized fields and Unicode at offset 14. Native ABI declarations are compiled; runtime marshaling and console behavior remain untested. The self-test exercises fake attach/open/write/close/free failures, identity changes, text rejection, partial counts, helper reuse prevention and cleanup. This does not establish WSL support, preserve TUI modes or prove literal text rendering in an actual application. Control-key/submit support is intentionally absent.

A trusted cooperative registration provider must bind pane ID, host/client creation identity, console generation and WSL distro/session/tty, detect ambiguity, enforce owner/session authorization and hold an appropriate identity lifetime across attach/write. The current snapshot checks cannot close process-exit/reuse races alone. Human intervention still cannot retract already enqueued records; never flush the shared input buffer. No automatic discovery by title or PID guessing is implemented.

Additional primary ABI references:
- https://learn.microsoft.com/en-us/windows/console/input-record-str
- https://learn.microsoft.com/en-us/windows/console/key-event-record-str
- https://learn.microsoft.com/en-us/windows/console/console-handles

Local validation: the existing Windows .NET Framework x64 compiler passed with warnings treated as errors. The final fake self-test passed 97 assertions with nativeCalls false; a normal --paste invocation returned unavailable with exit 2 without constructing WindowsApi. The JavaScript suite passed 85 tests, including deterministic invalid-identity fuzz and product isolation checks. No attach, console enumeration, GUI read or input was performed. Unexpected attach/open exceptions mark cleanup unknown; no blind detach is attempted. Admission uses an atomic single-use guard.
