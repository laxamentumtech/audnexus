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

The project uses TypeScript 5.9.3 with strict mode enabled. Key configuration in `tsconfig.json`:

```json
{
	"compilerOptions": {
		"strict": true,
		"target": "ESNext",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"isolatedModules": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true
	}
}
```

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

**Import sort order:**

1. React and React-related packages: `['react', '^@?\\w']`
2. Internal packages: `['^(@|components)(/.*|$)']`
3. Side effect imports: `['^\\u0000']`
4. Parent imports: `['^\\.\\.(?!/?$)', '^\\.\\./?$']`
5. Relative imports: `['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$']`
6. Style imports: `['^.+\\.?(css)$']`

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

The project uses module aliases for cleaner imports via the `package.json` `"imports"` field (native Bun/Node.js ESM support):

| Alias                 | Maps To                        |
| --------------------- | ------------------------------ |
| `#config/*`           | `./dist/config/*.js`           |
| `#helpers/*`          | `./dist/helpers/*.js`          |
| `#helpers/audible/*`  | `./dist/helpers/audible/*.js`  |
| `#helpers/books/*`    | `./dist/helpers/books/*.js`    |
| `#helpers/database/*` | `./dist/helpers/database/*.js` |
| `#helpers/errors/*`   | `./dist/helpers/errors/*.js`   |
| `#helpers/routes/*`   | `./dist/helpers/routes/*.js`   |
| `#helpers/utils/*`    | `./dist/helpers/utils/*.js`    |
| `#static/*`           | `./dist/static/*.js`           |
| `#interfaces/*`       | `./dist/interfaces/*.js`       |
| `#tests/*`            | `./tests/*`                    |

**Usage example:**

```typescript
import { ApiHelper } from '#helpers/audible/ApiHelper'
import { config } from '#config/index'
```

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
# 1. Revert package.json changes
git checkout package.json

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

**Coolify Workflow** (`.github/workflows/deploy-coolify.yml`):

Triggers:

- Push to `main` or `develop` branches

**Required secrets:**

| Secret Name       | Description                                                                      |
| ----------------- | -------------------------------------------------------------------------------- |
| `COOLIFY_WEBHOOK` | Coolify deploy webhook URL from application's Webhook page                       |
| `COOLIFY_TOKEN`   | Coolify API token from "Keys & Tokens" > "API Tokens" (with "Deploy" permission) |

**Deployment process:**

1. Builds Docker image from Dockerfile and pushes to ghcr.io
2. Triggers Coolify deployment via API call on push to main/develop
3. Uses Bearer token authentication with `COOLIFY_TOKEN`
4. Coolify pulls the prebuilt image from ghcr.io and deploys it

**CapRover Workflow** (`.github/workflows/deploy-caprover.yml`):

Triggers:

- Push to `main` branch

**Required secrets:**

| Secret Name         | Description              |
| ------------------- | ------------------------ |
| `CAPROVER_HOST`     | CapRover server host     |
| `CAPROVER_PASSWORD` | CapRover server password |

**Deployment process:**

1. Installs CapRover CLI
2. Deploys to CapRover using CLI
3. Deploys from `main` branch

**Docker Publish Workflow** (`.github/workflows/docker-publish.yml`):

Triggers:

- Schedule: Daily at 05:15 UTC
- Push to `develop`, `main`, or semver tags (`v*.*.*`)
- Pull requests to `main`

**Process:**

1. Builds Docker image using project Dockerfile
2. Pushes to GitHub Container Registry (ghcr.io)
3. Tags image with branch name or version tag

**Note:** This workflow only builds and pushes images to ghcr.io - it does not deploy. Use the Coolify workflow for actual deployments.

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

**Scope (optional but recommended):**

- `api` - API-related changes
- `db` - Database-related changes
- `auth` - Authentication changes
- `scraper` - Web scraping changes
- `helper` - Helper function changes
- `config` - Configuration changes

### 5.2 Commit Message Examples

**Valid examples:**

```bash
feat(api): add new book endpoint for author search
fix(db): resolve connection pool timeout issue
chore(deps): update fastify to version 5.7.4
docs: update README with new API examples
test: add integration tests for RedisHelper
refactor(helper): simplify chapter parsing logic
deps: upgrade mongodb driver to 7.1.0
ci: add live test workflow
```

**Invalid examples (will fail CI):**

```bash
update stuff          # Missing type
Fixed bug              # Not conventional format
chore: update          # Too vague
feat: did things       # Unclear description
```

### 5.3 CI Validation

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

### 6.2 Live Test Configuration

**Command:**

```bash
bun run test:live
```

**Bun Configuration (bunfig.toml):**

- Live tests are run with Bun's native test runner
- Configuration is defined in `bunfig.toml` (test timeout, coverage settings)
- Requires `RUN_LIVE_TESTS=true` environment variable to enable live tests
- Run locally with: `RUN_LIVE_TESTS=true bun run test:live`

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

## 7. Rollback Procedures

### 7.1 Breaking Change Detection

**Before any dependency update, check for breaking changes:**

1. **Review changelog:**

   ```bash
   # Check package changelog
   npm view <package-name> changelog
   ```

2. **Check peer dependencies:**

   ```bash
   bun pm ls
   ```

3. **Test in isolation:**

   ```bash
   # Create a test branch
   git checkout -b test/update-<package>
   bun update <package-name>
   bun install
   bun run lint && bun run test && bun run build
   ```

4. **Review test output for warnings:**

   ```text
   [warning] Deprecated API usage detected
   [warning] Peer dependency mismatch
   ```

### 7.2 Rollback Steps

**If a change causes failures:**

```bash
# 1. Identify the problematic commit
git log --oneline -10

# 2. Revert the specific commit
git revert <commit-hash>

# 3. Push the revert
git push origin <branch-name>

# 4. Verify the fix
bun run lint && bun run test && bun run build
```

**Full rollback of dependency update:**

```bash
# 1. Edit package.json to previous versions
git checkout package.json

# 2. Remove lock file changes
git checkout bun.lockb

# 3. Reinstall
bun install

# 4. Verify
bun run lint && bun run test && bun run build
```

### 7.3 Commit Format for Rollbacks

**When reverting a dependency update:**

```bash
chore(revert): revert mongodb driver to 6.8.0

Reason: Breaking change detected in connection pool behavior

Reverts commit abc123def456
```

**When reverting a feature:**

```bash
revert: feat(api): add new book endpoint

Reason: Causes memory leak under high load

Reverts commit abc123def456
```

### 7.4 Emergency Procedures

**Critical bug in production:**

1. **Identify the breaking commit:**

   ```bash
   git log --oneline --since="1 day ago"
   ```

2. **Revert immediately:**

   ```bash
   git revert <commit-hash>
   # ⚠️ CRITICAL WARNING: Before force-pushing, confirm that no one else has pushed to main,
   # notify your team, and exhaust all alternatives. First verify repo state:
   git fetch origin main
   git log origin/main..main
   git push --force-with-lease origin main  # ONLY if absolutely necessary and after confirming no other pushes
   ```

3. **Document the incident:**

   ```markdown
   ## Incident: [Brief Description]

   **Date:** YYYY-MM-DD
   **Severity:** Critical
   **Impact:** [Description of impact]

   ### Root Cause

   [Explanation of what caused the issue]

   ### Resolution

   [Steps taken to resolve]

   ### Prevention

   [Steps to prevent recurrence]
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
