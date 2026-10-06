> Current evidence: the user-run manual visible-marker read passed (261 ms). See [STATUS](STATUS.md). Historical source-only/compile-disabled checkpoints below do not describe an autonomous integration; automatic native use remains disabled.

# Native host integration — UIA compiled out

The own C# host in `src/native-uia-host.cs` references the compiled provider DLL and implements a bounded single-request JSON stdin/stdout bridge. It validates allowed methods, exact argument fields, canonical Int64 identity strings, Int32 PID/runtime IDs, path dimensions and read limits. `--validate-only` validates and returns target metadata without invoking the provider. No terminal data is returned by validation.

The ordinary build excludes the `NATIVE_RUNTIME_ENABLED` symbol. Therefore `--read` refuses the request before any provider invocation. Enabling that symbol is a separate runtime gate: do not change the build to circumvent missing permitted computer-use tools. Neither native tool registration nor native input is enabled.

`NativeWorkerSupervisor` can now launch the explicit own `.exe` directly from Windows Node, with no shell, hidden console, bounded IPC, deadline and process-object-only cancellation. It refuses `.exe` supervision from WSL because killing an interop wrapper would not establish termination of the actual Windows host. Existing Node-fixture supervision remains available in WSL.

## Measured no-GUI evidence (2026-10-06)

- Host compiled using the already installed Framework `csc.exe`, the existing provider DLL and `System.Web.Extensions.dll`. No package restoration, download or runtime installation.
- Direct Windows Node supervisor to C# host: 10 checks passed in 824 ms. Included valid observe/read-request codecs, rejected invalid PID/Int64/leading-zero identity and extra fields, excessive range limit, rejection of `--read` by the disabled build, and timeout/close of one owned stalled Node fixture.
- The normal workspace sandbox denied subprocess creation with `EPERM`; the same no-GUI test passed through the approved scoped executor call. No computer-use runtime restriction was bypassed.
- All 27 project tests, JS/hash build and package audit pass. `npm run build` still does not compile C#.

Provider source hash remains `43d377d361dbee3d314afc92c4e8407de9588262ff9cf6338df8b10f5a99e423`. Host source hash is `d7a982d723950e4e31319e51a02cce9c5cf0d5ea3653b426dcaee2200c9dc2c1`. Source hashes are not binary hashes. Build artifacts are in the private Windows workspace `.runtime/native-source-build`, outside the repository/package.

## Remaining limits

No UIA method, real HWND/pane binding, actual terminal read, native cancellation during a hung UIA call, or native input has been tested. The compile-disabled host and codec are integrated; live native integration is still disabled. A codec test cannot demonstrate UIA cleanup or security. Source, Windows/.NET, serialization behavior and providers have not received a complete formal security audit.

The current executor's available tools still do not expose Caskodia, `node_repl`, or `sky`. The user should not change Windows security, trust certificates or install packages to solve that. Route the live test to an executor exposing the supported desktop tools, then identify one authorized terminal/pane and announce any visible action. Only after that gate may the reviewed host build be enabled and a bounded read be attempted. No workaround through direct UIA/PowerShell is authorized by this artifact.
