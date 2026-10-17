# Collaborator and agent onboarding TODO

Work from the branch checkout in [CONTRIBUTING.md](../CONTRIBUTING.md). Record the
resolved commit SHA so results remain reproducible after the branch advances.
Use only synthetic fixtures. Preserve UNLICENSED and the installed runtime state.

## Baseline checks

- [ ] Record commit, OS/WSL version, Node/npm/Python/tmux versions.
- [ ] Complete the locked dependency install from CONTRIBUTING.md.
- [ ] Run this block from the repository root in a fresh Bash shell. From fish or
  zsh, start `bash` first (or save the block to a file and run `bash file.sh`);
  do not change your default shell, and do not paste Bash-only lines into fish.
- [ ] Run this block:

```sh
QA_ROOT=$(mktemp -d)
export QA_ROOT
mkdir "$QA_ROOT/home" "$QA_ROOT/tmp" "$QA_ROOT/cache" "$QA_ROOT/evidence"
(
  export HOME="$QA_ROOT/home" TMPDIR="$QA_ROOT/tmp"
  export npm_config_cache="$QA_ROOT/cache" npm_config_offline=true
  export NODE_DISABLE_COMPILE_CACHE=1 DOT_TMUX_LAB_TEST=1
  export DOT_RUNTIME_OUTPUT_TRACE="$QA_ROOT/evidence/runtime-trace.json"
  unset TMUX NODE_OPTIONS
  node --test --test-concurrency=1 --test-timeout=30000 test/*.test.mjs >"$QA_ROOT/evidence/tests.log" 2>&1
  TEST_RESULT=$?
  npm run build >"$QA_ROOT/evidence/build.log" 2>&1
  BUILD_RESULT=$?
  npm run check:release >"$QA_ROOT/evidence/package.log" 2>&1
  PACKAGE_RESULT=$?
  printf 'tests=%s build=%s package=%s\n' "$TEST_RESULT" "$BUILD_RESULT" "$PACKAGE_RESULT"
  test "$TEST_RESULT" = 0 && test "$BUILD_RESULT" = 0 && test "$PACKAGE_RESULT" = 0
)
git diff --check
find "$QA_ROOT/tmp" -mindepth 1 -maxdepth 1 -print
tail -12 "$QA_ROOT/evidence/tests.log"
```

- [ ] Expected counts depend on the branch; compare only with the matching row:
  - Baseline `review/ordered-output-collaborator-onboarding` (8e8440f): 251 tests,
    250 pass, zero failures, one intentional skip.
  - Integrated review `review/integrated-setup-preview`: 329 tests, 328 pass, zero
    failures, one intentional skip (321/320 at 02a9088, before the configurator
    usability tests).
  In both, the skip is the Windows identity helper; build/package exit zero; no
  remaining fixtures in the isolated tmp directory.
  Investigate any changed count or skip reason rather than treating it as a pass.
- [ ] Inspect the package inventory: no internal proposals/reviews, credentials,
  local configuration, screenshots or private evidence. The package checker is a
  heuristic; review staged content before pushing.

## Optional browser QA

This requires Playwright 1.58.2 and its Chromium 145.0.7632.6 build 1208. If absent,
the collaborator may explicitly opt into the following isolated download; it
does not change project dependencies. Missing OS libraries are a blocker to report.

```sh
QA_TOOLS=$(mktemp -d)
npm install --prefix "$QA_TOOLS" --ignore-scripts --no-audit --no-fund --save-exact playwright@1.58.2
PLAYWRIGHT_BROWSERS_PATH="$QA_TOOLS/browsers" node "$QA_TOOLS/node_modules/playwright/cli.js" install chromium
PLAYWRIGHT_BROWSERS_PATH="$QA_TOOLS/browsers" \
PLAYWRIGHT_MODULE="$QA_TOOLS/node_modules/playwright/index.mjs" \
OBSERVER_QA_FRAMES="$QA_ROOT/evidence/runtime-trace.json" \
OBSERVER_QA_OUTPUT="$QA_ROOT/evidence/browser" \
node scripts/browser-observer-qa.mjs
```

- [ ] Expect seven passed groups, result.json status passed, sandbox true, and
  cleanup.json confirming context/browser closure. Without a trace there are six
  groups; that does not verify runtime-frame replay. Do not use --no-sandbox.
- [ ] Integrated review only: also run the local human view QA. Unlike the observer
  QA above, which creates no runtime and replays fixtures and the recorded trace in
  memory, it starts its own synthetic runtime and needs no trace:

```sh
PLAYWRIGHT_BROWSERS_PATH="$QA_TOOLS/browsers" \
PLAYWRIGHT_MODULE="$QA_TOOLS/node_modules/playwright/index.mjs" \
HUMAN_VIEW_QA_OUTPUT="$QA_ROOT/evidence/human-view" \
node scripts/browser-human-view-qa.mjs
```

- [ ] Expect eleven passed groups, result.json status passed, and cleanup.json with
  `verified: true` and `fixturesRemoved: true`.
- [ ] Review screenshots locally for matching views and legibility. Keep all
  evidence outside Git. The harness uses an ephemeral profile and fulfills assets
  in memory; it does not open a live terminal or connect to the active tunnel.

## Report and remaining work

- [ ] Report commit, versions, commands/exit codes, counts, skip reason and QA group
  results. Include sanitized symptoms and minimal synthetic reproduction for bugs.
- [ ] Confirm default launcher retains five tools; opt-in tests exercise seven,
  identity fencing, input freshness isolation and verified cleanup.
- [ ] Do not claim cloud delivery: actual tunnel tool discovery, correlated remote
  reads and remote disconnect behavior remain unverified.
- [ ] Dynamic resize is fixture-only; runtime stays fixed at 80x24. The human CLI
  remains snapshot-based, and the configurator remains planning-only.
- [ ] Owner reviews findings before merge/activation. No release or deployment is
  part of this checklist; do not restart or inspect private tunnel configuration.
