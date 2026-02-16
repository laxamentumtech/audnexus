# Dependency Changes Log

This log documents all dependency changes (additions, upgrades and rollbacks) following the standards defined in [AGENTS.md](AGENTS.md) Section 3.

## p-limit 3.1.0 (retained from pre-existing)

**Date:** 2026-02-15

**Prior Version:** 3.1.0 (no change)

**Reason:** Retained v3.1.0 due to CommonJS compatibility. p-limit v5+ is ESM-only and not compatible with this project's CommonJS module system.

### Breaking Changes Review

1. **API Changes**: No changes. Version 3.1.0 retained.

2. **Peer Dependencies**: No new peer dependencies.

3. **Deprecation Warnings**: None.

4. [x] Reviewed package requirements for ESM-only constraint

### Verification Steps

- [x] Verified p-limit v5 requires ESM-only environment
- [x] Confirmed project uses CommonJS (module-type: commonjs in tsconfig)
- [x] Retained v3.1.0 which supports both ESM and CommonJS

### Verification Outcome

Verified: p-limit v5+ requires ESM, project is CommonJS, v3.1.0 retained for compatibility

## ip-range-check ^0.2.0

**Date:** 2026-02-15

**Reason:** Added for IP matching and validation in metrics endpoint access control.

### Breaking Changes Review

1. **API Changes**: No breaking changes. This is a new dependency addition.
2. **Peer Dependencies**: No peer dependencies.
3. **Deprecation Warnings**: None.
4. [x] Reviewed package documentation

### Verification Steps

- [x] Run unit tests (`pnpm test`)
- [x] Run CI pipeline (`pnpm lint && pnpm test && pnpm build`)
- [x] Verify IP range checking functionality in metrics endpoint

### Verification Outcome

Verified: Tests passed, build succeeded, IP range checking functional

---

_References:_

- _AGENTS.md Section 3: Dependency Management_
- _AGENTS.md Section 3.2: Major Version Handling_
- _AGENTS.md Section 3.4: Rollback Procedures_
