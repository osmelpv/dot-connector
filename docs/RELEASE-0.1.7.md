# 0.1.7 experimental release

Adds `dot-connector update` for a separately bootstrapped WSL/Linux installation: published GitHub release checks, explicit version selection, bounded manifest/archive verification, isolated dependency preparation, atomic activation and offline rollback. A shared lifecycle lease refuses updating during managed sessions. User state stays outside versioned code; no config, credentials, grants or consumed claims are migrated/reset.

Version 0.1.6 cannot self-update. Follow UPDATE.md to bootstrap a new root from this pinned release and retain the original installation. There is no global runtime/package install, npm registry publication, application change, native GUI operation or automatic ARM. Windows prepared native adapters remain separate. Checksums establish integrity under trust in GitHub and the publisher, not independent signature authentication.

Verification includes 52 project tests, independent source review and package audit. Failure/rollback tests use synthetic release fixtures; managed launcher session-conflict checks use real processes. Real published-artifact bootstrap and diagnostic/check/no-op evidence accompanies this release. Native terminal control through the new CLI remains unverified and subject to the executor runtime restriction.
