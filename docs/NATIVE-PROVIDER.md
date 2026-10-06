# Built-in UIA provider source — compiled, not executed

`src/native-uia-provider.cs` is a small C# library implementing the native-reader response shapes. It has no executable entry point. Its only public provider operations are `Observe(Target)` and `GetVisibleRanges(Target, maxRanges, maxCharacters)`; no MCP server or automatic launch path is added. The existing JavaScript contract remains the caller-side boundary. A reviewed host/codec bridge still needs to serialize the DTOs and supervise the library before any runtime integration.

## Trust and review

All own source was reviewed, including the following calls. This is not a complete audit of Windows/.NET/UIA or a malware-safety certification. There are no FlaUI, NuGet, FFmpeg, downloaded interop assemblies, or new package dependencies.

- `user32`: foreground/window PID/visibility/minimized-state queries; open the current input desktop with **DESKTOP_READOBJECTS only**, read its name, then close that query handle. No desktop switching, focus changes, input, or hooks.
- `kernel32`: open a process with **PROCESS_QUERY_LIMITED_INFORMATION only** and close handles.
- `advapi32`: open a token with **TOKEN_QUERY only**, inspect elevation/integrity and read the integrity SID. No token or privilege modification. Both target and reader must be unelevated and at or below medium integrity.
- Managed process queries compare PID, start-time ticks and a terminal process-name allowlist. The HWND must still belong to that PID and be the foreground, visible, non-minimized window. The active desktop must be named `Default`; inaccessible or other desktops fail. This is a conservative gate, not comprehensive validation of all session/security arrangements.
- UIA starts at the exact HWND. It follows only the supplied RawView ancestry of runtime IDs, checks uniqueness among immediate siblings, and caps traversal at 256 nodes/16 levels. It requires a non-password, on-screen leaf owned by the process, with keyboard focus and matching focused runtime ID.
- Only `TextPattern.GetVisibleRanges()` retrieves ranges. At most 64 range objects and 16,000 total characters are accepted, using `GetText(remaining)` rather than full-document extraction. Exact-capacity results conservatively set `truncated:true`. No `DocumentRange` fallback exists.

Identity/focus/desktop checks precede and follow extraction. A monotonic stopwatch rejects calls exceeding one second when control returns from each operation. **This cannot interrupt a hung UIA call.** The separate JavaScript supervisor now enforces deadlines and cancellation by terminating its own Node worker, with real stalled-fixture cleanup tests in WSL. Its bridge to this C# library is not implemented, so native integration remains disabled. A supported isolated UIA host and Windows cleanup verification are still required. The OS provider may allocate the range array internally before its length can be checked. Runtime calls, focus transient races, UIA provider honesty and pixel occlusion remain outside static proof. Process-name checks do not authenticate a publisher.

Errors are returned as generic exceptions without raw provider messages or terminal text. The library performs no logging, file/network IO, credential storage, activation, clipboard operations, input, or elevation. Handles and native buffers acquired by these methods are released in `finally` blocks. UIA can itself communicate with target providers; compiling the library does not exercise that behavior.

## Offline compilation recipe

On Windows with the already-installed .NET Framework compiler and WPF references, from the project root:

```powershell
$framework = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
New-Item -ItemType Directory -Force -Path dist | Out-Null
& "$framework\csc.exe" /nologo /target:library /platform:x64 /optimize+ /warnaserror+ /out:dist\DotConnector.Native.dll "/reference:$framework\WPF\UIAutomationClient.dll" "/reference:$framework\WPF\UIAutomationTypes.dll" "/reference:$framework\WPF\WindowsBase.dll" src\native-uia-provider.cs
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed' }
```

This only compiles owned source; do not run or load the resulting DLL into a UIA host before runtime approval and target authorization. No `dotnet restore`, package installation, policy change, or download is involved. The legacy compiler does not provide a byte-reproducibility guarantee; record hashes of each artifact instead of claiming identical binaries. The DLL is a local build artifact and is not in the npm package allowlist.

## Remaining gates

Compilation and a JavaScript static-import audit pass. The native contract tests use simulated providers; supervisor tests spawn and terminate only owned Node fixtures. None loads this DLL. No native method, UIA target traversal, integrity query, secure-desktop rejection, JSON bridge, visible-range extraction, cancellation, or cleanup behavior has been tested at runtime. No native input implementation exists.

The current executor lacks the required supported CUA runtime. Do not use this DLL as a way around that limitation. Before a live test: approve a supported host/runtime, identify one user-authorized native window and collect its exact pane ancestry through that permitted route, then compare a bounded read against known visible text. New windows require advance notice. No commands, prompts, or focus changes are part of the first native read test.

References: [Microsoft TextPattern.GetVisibleRanges](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.textpattern.getvisibleranges), [OpenInputDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-openinputdesktop), [Windows Terminal accessibility architecture](https://github.com/microsoft/terminal/blob/main/doc/terminal-a11y-2023.md).

## Build and correction evidence

`npm run build` checks JavaScript syntax/JSON and hashes all source files, including C#. It does **not** compile C#. The separate Windows compiler recipe above has been rerun successfully after the UTF-16 correction, without loading the DLL. Tests cover positive Int32/Int64 boundaries, supplementary characters, malformed surrogate sequences, identity changes in returned text and capture expiration during final observation. C# independently rejects malformed UTF-16 and trims a trailing high surrogate only at the imposed text cap, reporting truncation.

The supervisor accepts only an explicit own Node-worker path, uses no shell, passes a minimal environment, bounds request/output bytes, validates UTF-8/JSON, and does not expose command execution through MCP. Its only kill target is the process object it created. Explicit cancellation and deadlines use process termination, not Promise.race over an uninterruptible native call. An unconfirmed close poisons the supervisor; it never hunts for or kills arbitrary PIDs. These are reviewed own-source boundaries, not proof that Windows/.NET or a future worker is trustworthy.
