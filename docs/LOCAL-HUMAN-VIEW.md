# Local human ordered-output view (opt-in)

The existing snapshot CLI and its explicit human commands remain the default.
For a newly created synthetic runtime already started with `--ordered-output-v2`,
use its printed human socket explicitly:

```sh
node scripts/tmux-bridge-view.mjs /absolute/owned/human-view.sock --ordered-view
```

The explicit discovery form also accepts `--ordered-view` after the instance ID.
No browser is opened automatically. Open the printed `http://127.0.0.1:PORT/` in
a local browser. A fixed 80×24 xterm screen shows live ordered output, with a frame
and byte counter, session identity and a Disconnect view button. Horizontal
overflow stays inside the screen panel on narrow displays.

Keep the CLI open: `/read /grant /pause /paste TEXT /submit /stop /quit` retain
their existing meanings and escaped snapshot display. The browser is observation
only. Disconnecting/closing its tab stops that tab's polling; it does not pause,
stop or grant input. `/quit` closes the local companion and disconnects the human
client. `/stop` retains the existing owned-session shutdown behavior.

The CLI shares its single selected human IPC client with the companion. No new
human socket connection, credentials, project discovery or input protocol is
introduced. The companion forwards only status at startup and `ordered-read`
with the fixed session binding/stream identity. Browser data never selects an
action, target, grant or input payload. Runtime and installed launcher defaults
remain unchanged; unavailable ordered output fails closed before listening.

The server binds an ephemeral port on 127.0.0.1 only. Exact Host and Origin checks,
same-origin Fetch Metadata on JSON endpoints, no CORS, restrictive CSP and fixed
asset routes limit browser access. This is a cooperative local-user surface,
not authentication against hostile local processes or a multi-user boundary.
No tokens or cookies are issued. It must not be forwarded through a tunnel.

One ordered read is outstanding at a time; responses are limited to 32 KiB,
cursor/request sizes and HTTP connections are bounded. The browser awaits each
validated frame and renderer completion before polling again. No replay queue is added. Transport failures permit at most two read-only
recovery attempts per page lifetime, rebuilding from cursor zero with the same
identity and complete retained prefix; see [read recovery](READ-RECOVERY.md). The existing IPC request has an eight-second
deadline. View shutdown destroys its HTTP sockets and joins the outstanding read;
the CLI closes IPC first to settle a disconnected read.

The existing XtermObserver validates identity/order/bytes and suppresses keyboard,
paste, mouse and terminal replies. Its OSC handlers consume title, hyperlink and
clipboard commands. No raw VT is printed by the companion to the host terminal.
On a gap, changed identity, malformed frame or explicit source rejection, the
renderer is disposed and a stopped message appears. Transport cuts dispose the
old renderer before a bounded full-prefix reconstruction. Restarting a view begins at cursor
zero and may immediately hit a gap; there is no checkpoint or missing-prefix recovery. Runtime
geometry stays 80×24; window resizing changes only the outer page layout.

Tests use only fresh synthetic runtime/panes. Browser QA requires an existing
authorized Playwright installation, supplied through PLAYWRIGHT_MODULE, and
HUMAN_VIEW_QA_OUTPUT for evidence. Run `node scripts/browser-human-view-qa.mjs`.
For intermittent failures (#12) it also writes `diagnostics.json` after cleanup,
whether the run passed, failed during startup, or its cleanup failed. The
collector is created before startup, so a failure in `runtime-ready`, `view-url`
or `cli-ready` is recorded too. The file holds at most 200 entries with
millisecond timings: each harness wait (`runtime-ready`, `view-url`, `cli-ready`,
`marker-dispatched`) with `wait`/`ok`/`expired`, browser steps, the known
`ready`/`closed` events read only from the runtime's stderr, known CLI markers,
stderr lines made only of UPPER_CASE codes, each process exit code or signal,
and each failed cleanup step as a resource name plus code. JSON-shaped lines
from other sources, such as pane content echoed by the CLI, are dropped. It
never stores raw output, pane content, paths, URLs or socket names.

Cleanup attempts every resource (browser context, browser, CLI, runtime, runtime
`closed` verification, fixtures) even after one fails; `cleanup.json` lists the
failed steps by code (codes longer than 64 characters become `CLEANUP_FAILED`).
The retained runtime state (socket, ledger) is deleted only when the runtime's
`closed` event reports `verified: true`; otherwise it is kept for inspection and
the `fixtures` step reports `OWNED_FIXTURES_UNVERIFIED`. The original error stays
the one reported, and cleanup failures are kept beside it, never in its place.
A failed write of `failure.json`, `diagnostics.json` or `cleanup.json` is
printed to stderr by artifact name and code and does not replace that error.
Timeouts and the absence of retries are unchanged.

The artifacts differ in what they may contain. `diagnostics.json` and
`cleanup.json` are sanitized as described above. `failure.json` is not: besides
the error, the expired `phase` and a copy of the diagnostics, it still keeps raw
CLI and runtime stderr (which includes socket paths and binding data), HTTP
response bodies for 4xx/5xx responses and the page status text. Treat
`failure.json` and screenshots as local evidence: nothing is uploaded or
published automatically, and only `diagnostics.json`, or excerpts reviewed by
hand, should be shared in an issue or PR.
No installation, tunnel activation, real terminal adoption or ConPTY claim is
part of this increment.

Live-browser validation exposed a producer compatibility issue: tmux's documented
%window-renamed notification was previously fenced as unknown. The parser now
discards only that bounded metadata record; it never renders the title or uses it
as identity. Pane/session/geometry checks remain unchanged. See the official
[tmux control-mode notifications](https://github.com/tmux/tmux/wiki/Control-Mode).

Surface review: at most eight HTTP connections, four pending responses and 1 MiB
of reserved response bodies per connection; a pipelined client is disconnected
when the budget is exceeded. Each asset is at most 512 KiB, all assets at most
2 MiB. Header count, URL length and timeouts are bounded. Paths select a fixed
asset map, never filesystem paths from the request. No control endpoints exist.

The loopback URL is a locator, not a credential. There is no session token, login
or cookie. Any local process able to reach loopback and forge HTTP headers can
read this cooperative surface, including another local OS user; Host/Origin and
Fetch Metadata protect browser origins, not local attackers. Do not use this
experimental synthetic-only viewer for sensitive sessions or on a hostile shared
host. Closing the view never sends stop to the source; explicit CLI /stop is the
existing owned-session control. Pausing/revoking input intentionally leaves
observation available; closing or losing the output source invalidates reads.
