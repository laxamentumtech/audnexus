# Repository Standards for AI Agents

This document establishes comprehensive standards for AI agents working on the audnexus project. All agents must follow these guidelines to ensure consistency, quality, and maintainability.

## 1. Testing Standards

### 1.1 Unit Test Requirements

All code changes must include appropriate unit tests. Tests are located in the `tests/` directory and follow the naming patterns:

- **Test file pattern**: `**/*.+(spec|test).+(ts|tsx|js)`
- **Location**: `tests/**/*.+(ts|tsx|js)`
- **Live tests excluded**: `tests/live/` (see Section 6)

**Run unit tests:**

```bash
bun run test
```

This command executes Bun's test runner with the following options:

- `--timeout 30000`: Sets per-test timeout to 30 seconds
- Runs only Bun-compatible tests (subset of total test suite during migration)

**Note:** Some legacy tests use Jest-specific APIs (`jest.mock()`, `jest-mock-extended`) and are not included in the default test command. These tests are being converted to use Bun's native testing APIs. New tests should use Bun's native mocking capabilities.

### 1.2 Coverage

Coverage reports are generated automatically by Bun test. Coverage configuration is defined in `bunfig.toml`:

**Coverage reports are generated in:** `coverage/` directory

### 1.3 Mock Guidelines

**Recommended approach:** Use Bun's native mocking capabilities or simple function stubs.

Example of Bun-compatible mock:

```typescript
import { mock } from 'bun:test'

// Example: Mocking a simple function
const mockFetch = mock(() => Promise.resolve({ data: 'test' }))
```

### 1.4 Test Execution Commands

| Command             | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `bun run test`      | Run Bun-compatible unit tests with coverage |
| `bun run test:live` | Run live integration tests (see Section 6)  |

---

## 2. Code Quality Standards

### 2.1 TypeScript Configuration
The project uses TypeScript 5.9.3 with strict mode enabled. See `tsconfig.json`.
**Build command:**
```bash
bun run build-ts  # or bun run build (includes build-ts)
```

### 2.2 ESLint Rules

The project uses ESLint 10.0.0 with the following configuration (`eslint.config.mjs`):

**Extended configs:**

- `eslint:recommended`
- `plugin:@typescript-eslint/recommended`
- `prettier`

**Custom rules:**

| Rule                         | Level | Description                   |
| ---------------------------- | ----- | ----------------------------- |
| `simple-import-sort/imports` | error | Enforces import sorting order |
| `simple-import-sort/exports` | error | Enforces export sorting order |

**Import sort order:** Use `simple-import-sort/imports` rule via `bun run lint`.

**Run linting:**

```bash
bun run lint
```

This runs:

1. Prettier check: `prettier --config .prettierrc --check 'src/**/*.ts'`
2. TypeScript check: `tsc --noEmit`
3. ESLint: `eslint "**/*.{js,ts}" --quiet --fix`

### 2.3 Prettier Configuration

**Format code:**

```bash
bun run format
```

### 2.4 Module Aliases

The project uses module aliases. Use `#imports/*` aliases (defined in `package.json`).

---

## 3. Dependency Management

### 3.1 Update Process

**Standard update workflow:**

```bash
# 1. Check for outdated packages
bun outdated

# 2. Update dependencies
bun update

# 3. Install new dependencies
bun install

# 4. Run full verification
bun run lint && bun run test && bun run build
```

### 3.2 Major Version Handling

Major version updates require special attention.

**Breaking change detection checklist:**

1. Review the package's CHANGELOG or release notes
2. Check for peer dependency warnings
3. Look for deprecated API usage warnings
4. Run `bun run test` to verify all tests pass
5. Check `bun run build` compiles without errors

### 3.3 Security Patch SLA

**Priority levels:**

| Severity                        | SLA          | Action                       |
| ------------------------------- | ------------ | ---------------------------- |
| Critical (RCE, data breach)     | 24 hours     | Immediate patch or rollback  |
| High (privilege escalation)     | 72 hours     | Apply patch within SLA       |
| Medium (information disclosure) | 7 days       | Include in next update cycle |
| Low (best practice)             | Next release | Document and plan fix        |

**Check for vulnerabilities:**

```bash
bun audit
```

### 3.4 Rollback Procedures
**If a dependency update causes issues:**
```bash
```bash
# 1. Revert package.json and bun.lock changes
git checkout package.json bun.lock
# 2. Reinstall previous versions
bun install
# 3. Verify restoration
bun run lint && bun run test && bun run build
```

---

## 4. CI/CD Standards

### 4.1 What Runs in CI

**Bun CI Workflow** (`.github/workflows/bun.yml`):

Triggers:

- Push to `main`, `develop`, `renovate/*` branches
- Pull requests to `main`, `develop`
- Scheduled: Every Monday at 13:00 UTC

**Steps:**

```bash
bun install
bun run lint
bun run test
bun run build
```

### 4.2 Required Checks

All pull requests must pass:

| Check                | Command         | Status   |
| -------------------- | --------------- | -------- |
| Linting              | `bun run lint`  | Required |
| Tests                | `bun run test`  | Required |
| Build                | `bun run build` | Required |
| Conventional Commits | CI validation   | Required |

### 4.3 Failure Handling

**On CI failure:**

1. **Check the workflow logs** in GitHub Actions
2. **Identify the failing step** (lint, test, or build)
3. **Fix locally**:

   ```bash
   bun run lint   # Check for issues
   bun run test   # Run tests
   bun run build  # Verify build
   ```

4. **Push fixes** to the PR branch
5. **Re-run CI** by pushing new commits

**Common failures:**

| Failure       | Solution                             |
| ------------- | ------------------------------------ |
| Lint errors   | Run `bun run lint` and fix issues    |
| Test failures | Check test logic and fix issues      |
| Build errors  | Check TypeScript compilation errors  |
| Type errors   | Run `tsc --noEmit` to see all errors |

### 4.4 Live Tests CI

**Live Tests Workflow** (`.github/workflows/live-tests.yml`):

Triggers:

- Scheduled: Daily at 09:00 UTC
- Manual: `workflow_dispatch` with optional chapter tests

**Environment:**

```bash
RUN_LIVE_TESTS=true bun run test:live
```

**Failure handling:**

- Creates automatic issue with `[AUDIBLE API CHANGE]` or `[AUDIBLE HTML CHANGE]` label
- Requires human review and code updates

### 4.5 Deployment Workflows
See `.github/workflows/` for deployment workflows (`deploy-coolify.yml`, `deploy-caprover.yml`, `docker-publish.yml`).
---

## 5. Commit Standards

### 5.1 Conventional Commit Format

All commits must follow the Conventional Commits specification:

```text
<type>(<scope>): <description>
```

**Types:**

| Type       | Description               | Example                                     |
| ---------- | ------------------------- | ------------------------------------------- |
| `feat`     | A new feature             | `feat(api): add book search endpoint`       |
| `fix`      | A bug fix                 | `fix(auth): resolve token expiration issue` |
| `chore`    | Maintenance tasks         | `chore(deps): update axios version`         |
| `docs`     | Documentation changes     | `docs: update API documentation`            |
| `style`    | Code style changes        | `style: format code with prettier`          |
| `refactor` | Code refactoring          | `refactor(helper): simplify book parsing`   |
| `perf`     | Performance improvements  | `perf(db): optimize query performance`      |
| `test`     | Adding or modifying tests | `test: add unit tests for ApiHelper`        |
| `deps`     | Dependency updates        | `deps: update mongodb to 7.1.0`             |
| `ci`       | CI/CD changes             | `ci: add new GitHub workflow`               |
- `api` - API-related changes
- `db` - Database-related changes
- `auth` - Authentication changes
- `scraper` - Web scraping changes
- `helper` - Helper function changes
- `config` - Configuration changes
Invalid: missing type, non-conventional format, or vague description.
### 5.2 CI Validation

The repository uses `webiny/action-conventional-commits` to validate commit messages on PRs to `main`.

**Enforcement:**

- All PRs to `main` must have conventional commit messages
- PRs with invalid commit messages will fail the `Conventional Commits` check

---

## 6. Live Test Standards

### 6.1 When to Run Live Tests

**Environment variable required:**

```bash
RUN_LIVE_TESTS=true bun run test:live
```

**Live tests are located in:** `tests/live/`

**Use cases:**

- Testing against real Audible API responses
- Detecting changes in Audible's HTML structure
- Verifying API endpoint changes
- Integration testing with real data

### 6.2 Handling Test Results
### 6.3 Warning vs Failure Interpretation

**Warnings (non-blocking):**

```text
[AUDIBLE API CHANGE] - Minor structure change detected
[AUDIBLE HTML CHANGE] - HTML parsing warning
```

Warnings indicate potential issues that should be reviewed but don't fail the build.

**Failures (blocking):**

```text
[AUDIBLE API CHANGE] - Breaking API change detected
[AUDIBLE HTML CHANGE] - Critical HTML structure change
```

Failures indicate breaking changes that require immediate attention and code updates.

### 6.4 Handling Audible Changes

When live tests detect changes:

1. **Review the test output** for specific change details
2. **Identify the affected helper** in `src/helpers/audible/`
3. **Update the helper** to handle the new structure
4. **Update tests** in `tests/audible/` if needed
5. **Re-run live tests** to confirm fixes
6. **Commit changes** with appropriate message:

   ```bash
   fix(audible): update book scraper for new HTML structure
   ```

---


## Quick Reference Commands

```bash
# Development
bun install           # Install dependencies
bun run watch         # Watch mode for development
bun run debug         # Build and watch with debug

# Testing
bun run test          # Run unit tests with coverage
bun run test:live     # Run live integration tests

# Quality
bun run lint          # Check linting and formatting
bun run format        # Format code with Prettier
bun run build         # Build TypeScript

# Documentation
bun run build-docs    # Build API documentation

# Release
bun run release       # Create new release (standard-version)
```

---

## File References

| File                                         | Purpose                                      |
| -------------------------------------------- | -------------------------------------------- |
| `bunfig.toml`                                | Bun configuration and test coverage settings |
| `eslint.config.mjs`                          | ESLint rules and configuration               |
| `package.json`                               | Dependencies and scripts                     |
| `tsconfig.json`                              | TypeScript configuration                     |
| `.github/workflows/bun.yml`                  | CI/CD pipeline                               |
| `.github/workflows/live-tests.yml`           | Live test workflow                           |
| `.github/workflows/conventional-commits.yml` | Commit validation                            |
| `.github/workflows/deploy-coolify.yml`       | Coolify deployment integration               |
| `.github/workflows/deploy-caprover.yml`      | CapRover deployment integration              |
| `.github/workflows/docker-publish.yml`       | Docker image publishing                      |

---

_Last updated: 2026-02-19_
_Maintained by: Repository maintainers_
