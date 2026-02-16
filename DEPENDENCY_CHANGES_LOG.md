# Dependency Changes Log

This log documents all dependency changes (upgrades and rollbacks) following the standards defined in [AGENTS.md](AGENTS.md) Section 3.

## p-limit 3.1.0 → 5.0.0

**Date:** 2026-02-15

**Reason:** Upgrade to latest major version for improved concurrency control features and bug fixes.

### Breaking Changes Review

1. **API Changes**: No breaking changes detected. p-limit v5 uses a factory pattern: `pLimit(concurrency)` returns a `limit` function. To use it, first create the limiter with `const limit = pLimit(concurrency)`, then run tasks with `await limit(fn, ...args)`. The returned `limit` function accepts the function to run followed by its arguments.

2. **Peer Dependencies**: No new peer dependencies introduced. Compatible with current Node.js version in use.

3. **Deprecation Warnings**: No deprecation warnings detected during upgrade.

4. **- [x] Reviewed package CHANGELOG for breaking changes**

### Verification Steps

- [x] Run unit tests (`pnpm test`)
- [x] Verify jest mock/transformIgnorePatterns compatibility
- [x] Run CI pipeline (`pnpm lint && pnpm test && pnpm build`)
- [x] Sanity-run code paths that call p-limit (specifically `src/helpers/utils/batchProcessor.ts`)

### Verification Outcome

Verified: CHANGELOG reviewed, tests passed, build succeeded

---

_References:_

- _AGENTS.md Section 3: Dependency Management_
- _AGENTS.md Section 3.2: Major Version Handling_
- _AGENTS.md Section 3.4: Rollback Procedures_
