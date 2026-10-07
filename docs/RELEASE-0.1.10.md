# 0.1.10 experimental compatibility patch

Corrects the runtime archive boundary so the unchanged 0.1.8 updater can accept the new distribution using its existing allowlist and checksum verification. The disabled native-console-prototype.cs experiment and its source-only test remain in Git but are excluded from runtime source archives and the npm-format tarball. Both archives are generated from their original selected files; no published manifest is edited. All required runtime native modules and ordinary tests remain included. v0.1.9 and its assets are unchanged.

The regression test executes the exact historical 0.1.8 updater against an originally generated local candidate archive, checks corruption and forbidden-path rejection, verifies configuration preservation and real CLI version health, and rolls back. GitHub responses in that regression test are synthetic; a real consumer update from the downloaded published assets is verified and reported separately.

Logs and project-local installation are tested; WSL-to-Windows transport has been demonstrated for metadata with the previously approved helper. Helpers are source/version pinned: the 0.1.9 helper is not silently accepted as a 0.1.10 helper. Preparing a new helper may require a separately authorized Windows script-policy exception. No automatic exception or terminal target is configured by updating.

Focusless control remains unavailable. Its C# tests use a fake API; the cooperative registration model cannot authorize input. End-to-end WSL terminal read/write and an existing TUI's trustworthy pane/console binding remain pending. No GUI/input tests or AI provider calls are performed by this release. All verification is local; no remote CI workflow is configured. Package private and UNLICENSED are preserved; no npm registry publication.

The stable consumer launcher is retained, preserving rollback and lifecycle guards. It does not automatically gain newer metadata-concurrency behavior. No update resets native claims or grants, modifies application projects, or installs global runtimes.
