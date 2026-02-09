# Live Integration Tests

This directory contains live integration tests that run against real Audible API endpoints and HTML pages. These tests are designed to detect when Audible changes their API responses or HTML structure.

## Purpose

Live tests provide early warning when:

1. **Audible API response format changes** - Fields removed/renamed from API responses
2. **Audible HTML structure changes** - CSS selectors no longer work for scraping
3. **Audible endpoints return different status codes** - API behavior changes

## Running Live Tests

Live tests are disabled by default to prevent accidental execution during development.

### Enable and run live tests:

```bash
RUN_LIVE_TESTS=true pnpm test:live
```

### Run with credentials for chapter tests:

```bash
RUN_LIVE_TESTS=true ADP_TOKEN=your_token PRIVATE_KEY=your_key pnpm test:live
```

## Test Files

### `audible/books/api.live.test.ts`

Tests the Audible API for book data. Validates:

- Required fields exist in API responses (asin, title, authors, narrators, etc.)
- Response structure matches expected format
- Cross-region API availability (US, UK, AU)
- Error handling for non-existent ASINs

### `audible/books/scrape.live.test.ts`

Tests HTML scraping for book genres. Validates:

- Genres can be scraped from book pages
- CSS selectors still work for genre extraction
- Cross-region HTML scraping
- Graceful handling of missing genre data

### `audible/authors/scrape.live.test.ts`

Tests HTML scraping for author data. Validates:

- Author names can be extracted
- Genres can be scraped from author pages
- Descriptions and images are accessible
- Similar authors section is parseable
- Cross-region author scraping

### `audible/books/chapter.live.test.ts`

Tests the Audible Chapter API. Validates:

- Chapter data can be fetched with valid credentials
- Chapter structure matches expected format
- Chapter titles and timing information is available
- Runtime and brand duration info is present

**Note:** Chapter tests are automatically skipped unless `ADP_TOKEN` and `PRIVATE_KEY` environment variables are set.

## Environment Variables

| Variable         | Required For   | Description                                               |
| ---------------- | -------------- | --------------------------------------------------------- |
| `RUN_LIVE_TESTS` | All live tests | Must be set to `true` to enable live tests                |
| `ADP_TOKEN`      | Chapter tests  | Audible Device Profile token for authenticated API access |
| `PRIVATE_KEY`    | Chapter tests  | Private key for signing API requests                      |

## Test Behavior

### Warning vs. Failure

Live tests are designed to **warn** rather than **fail** when Audible data changes format. This prevents build breaks due to external changes while still alerting developers.

When a test detects a change:

1. A warning message is logged with `[AUDIBLE API CHANGE]` or `[AUDIBLE HTML CHANGE]` prefix
2. The test continues to validate what it can
3. Tests only fail on critical errors (network failures, 500 errors, etc.)

### Timeout

All live tests have a 30-second timeout per test to account for network delays.

## Detected Changes

The following warning patterns indicate specific Audible changes:

### API Changes

- `[AUDIBLE API CHANGE] Missing required field 'X' for ASIN: Y` - API field removed
- `[AUDIBLE API CHANGE] Missing 'content_metadata' in chapter response` - API structure change

### HTML Changes

- `[AUDIBLE HTML CHANGE] Selector 'X' not found for ASIN: Y` - CSS selector no longer matches
- `[AUDIBLE HTML CHANGE] Could not parse genres for X` - Parsing logic needs update

## When Tests Detect Changes

If live tests detect changes:

1. Check the warning messages to identify what's changed
2. Update the corresponding helper in `src/helpers/audible/`
3. Update unit tests in `tests/audible/` if needed
4. Run live tests again to confirm fixes

## Continuous Integration (CI)

### Running Live Tests in CI

Live tests work seamlessly in CI environments. They will automatically skip unless explicitly enabled.

#### GitHub Actions Example

```yaml
name: Live Integration Tests

on:
  schedule:
    # Run daily at 9 AM UTC to detect Audible changes
    - cron: '0 9 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  live-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      # Run live tests without credentials (API and HTML scraping only)
      - name: Run Live Tests
        env:
          RUN_LIVE_TESTS: true
        run: pnpm test:live

      # Optional: Run with chapter API credentials (stored as secrets)
      - name: Run Live Tests with Chapter API
        if: github.event_name == 'workflow_dispatch'
        env:
          RUN_LIVE_TESTS: true
          ADP_TOKEN: ${{ secrets.ADP_TOKEN }}
          PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
        run: pnpm test:live
```

#### GitLab CI Example

```yaml
live_tests:
  script:
    - pnpm install
    - RUN_LIVE_TESTS=true pnpm test:live
  only:
    - schedules
  variables:
    RUN_LIVE_TESTS: 'true'
```

### CI Environment Detection

Live tests automatically detect CI environments and adjust behavior:

- **No interactive prompts** - Tests run headless
- **Force exit** - Jest `--forceExit` flag prevents hanging
- **Verbose output** - Full test names and results are shown
- **Warning aggregation** - All `[AUDIBLE * CHANGE]` warnings are logged for easy review

### Recommended CI Strategy

1. **Daily scheduled runs** - Detect Audible changes proactively
2. **Separate job** - Don't block regular CI pipeline
3. **Notifications** - Alert team when live tests detect changes
4. **Manual trigger** - Allow on-demand runs with credentials

### Security in CI

- Store `ADP_TOKEN` and `PRIVATE_KEY` as encrypted secrets
- Never log credentials (tests never output env var values)
- Use repository-level secrets, not organization-level for Audible credentials
- Rotate credentials regularly

## Security

- **Never commit credentials** - Always use environment variables
- **Live tests are disabled by default** - Require explicit opt-in via `RUN_LIVE_TESTS=true`
- **Separate Jest config** - `jest.live.config.ts` isolates live test settings
- **CI-safe by design** - Won't run accidentally in CI environments
