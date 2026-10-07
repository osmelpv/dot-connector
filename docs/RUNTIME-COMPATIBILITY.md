# Runtime archive compatibility fix (local candidate)

## Root cause

The unmodified 0.1.8 updater validates every manifest path before accepting the release. Its C# allowlist permits only native-uia-provider/host, native-control-host and native-manual-probe/writer. Published 0.1.9 also lists src/native-console-prototype.cs. That development experiment does not match the old list, so validateManifest throws UPDATE_INVALID_MANIFEST before preparation/activation. The updater cannot first install its newer validator because the old one correctly validates the whole candidate before executing any of it. This is packaging incompatibility, not an archive checksum failure or missing user consent.

## Candidate packaging boundary

The prototype is never imported or compiled by the product and cannot instantiate WindowsApi through its entry point. It belongs to development source, not the runtime update artifact. src/distribution-files.mjs now centrally excludes exactly src/native-console-prototype.cs and its source-only test/console-prototype.test.mjs from runtime source archives. Both remain in Git and continue to run in repository development verification. npm package exclusions match this boundary. Native files required by the real existing helper remain included.

Both original archive builders select runtime files before constructing the archive and manifest. Every distributed file retains its path allowlist, individual hash and whole-archive checksum. There is no rename to disguise the unsupported C# source, no modification of downloaded manifests, no patched installed validator and no alternate manifest used against the existing consumer. Complete development source remains in the Git repository. The updater archive called source.tar.gz contains runtime source and documented supporting files, not the entire repository snapshot.

## Reproducible compatibility test

The new test reads the exact 0.1.8 updater source from Git commit 5db8ffb0f84b71e53c45d40ef5f820de15059f14 without editing it. It constructs a pristine 0.1.8 archive from that commit and a new local candidate archive using the corrected builder. GitHub release/tag/download responses are synthetic fixtures; no published identity is claimed. Dependency installation in this test is an isolated copy of already installed dependencies, not a network npm install. Runtime version health checks use the real copied CLI.

The test bootstraps an isolated 0.1.8 installation, verifies that the unsupported original path remains rejected and corrupt candidate bytes cannot activate, then uses the original runUpdate to activate the candidate. It checks preserved opaque configuration and previous pointer, verifies installed hashes and CLI version, and performs rollback to the original 0.1.8 commit. No existing consumer installation, native claim or grant is touched. Reproducing this test requires the fixed historical Git commit locally; do not silently substitute a modern validator if history is unavailable.

## Reviewable next distribution plan

The corrected distribution is version 0.1.10; it must never overwrite or republish v0.1.9. Runtime/package metadata is bumped, compatibility and the complete suite are rerun, and assets are built from the approved clean commit with the corrected runtime selection. Record excluded development files in release notes. Publish a new immutable experimental tag/release only after explicit approval for that release, preserving v0.1.9 and its assets unchanged.

Then download and verify the new release/tag/manifest/assets, invoke the consumer's normal pinned update to the new version, retain rollback and reject active sessions. Only after successful update test its diagnostic and metadata commands. The old stable launcher remains unchanged and does not gain newer metadata-concurrency semantics automatically; migration of that launcher needs a separately designed/tested step. No window access or input follows from packaging compatibility. Focusless control remains disabled, and the existing terminal identity/registration problem remains unresolved.
