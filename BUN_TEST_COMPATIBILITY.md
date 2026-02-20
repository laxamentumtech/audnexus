# Bun Test Compatibility

This document describes the bun:test infrastructure setup and which tests are compatible with Bun vs requiring Node.js/Jest.

## Overview

The audnexus project is transitioning to support Bun as an alternative runtime. As part of this transition, we've set up `bun:test` for unit tests that don't require Fastify's `light-my-request` or Jest-specific mocking APIs.

## Bun-Compatible Tests

The following tests have been updated to work with `bun:test`:

| Test File                                        | Description                   | Why Compatible                 |
| ------------------------------------------------ | ----------------------------- | ------------------------------ |
| `tests/typing/types.test.ts`                     | Zod schema validation tests   | No mocking, pure validation    |
| `tests/typing/checkers.test.ts`                  | Type guard tests              | No mocking, pure type checking |
| `tests/static/messages.test.ts`                  | Static message function tests | No mocking, pure functions     |
| `tests/helpers/errors/ApiErrors.test.ts`         | Error class tests             | Uses standard Error API        |
| `tests/helpers/utils/cleanupDescription.test.ts` | Description cleanup tests     | No mocking, pure functions     |

## Tests Requiring Jest (Node.js)

The following tests require Jest and cannot run with Bun due to dependencies on Fastify or Jest-specific APIs:

### Fastify/light-my-request Dependent

These tests use Fastify's `inject()` method which is incompatible with Bun:

- `tests/config/routes/metrics.test.ts`
- `tests/config/performance/hooks.test.ts`
- `tests/config/routes/health.test.ts`

### jest-mock-extended Dependent

These tests use `jest-mock-extended` for type-safe mocking:

- `tests/database/redis/RedisHelper.test.ts`
- `tests/database/papr/audible/PaprAudibleBookHelper.test.ts`
- `tests/database/papr/audible/PaprAudibleChapterHelper.test.ts`
- `tests/database/papr/audible/PaprAudibleAuthorHelper.test.ts`
- `tests/helpers/routes/BookShowHelper.test.ts`
- `tests/helpers/routes/AuthorShowHelper.test.ts`
- `tests/helpers/routes/ChapterShowHelper.test.ts`
- `tests/helpers/routes/RouteCommonHelper.test.ts`
- `tests/helpers/routes/GenericShowHelper.test.ts`

### jest.mock() Dependent

These tests use `jest.mock()` for module mocking:

- `tests/helpers/books/audible/ApiHelper.test.ts`
- `tests/helpers/books/audible/ScrapeHelper.test.ts`
- `tests/helpers/books/audible/ChapterHelper.test.ts`
- `tests/helpers/books/audible/StitchHelper.test.ts`
- `tests/helpers/authors/audible/ScrapeHelper.test.ts`
- `tests/helpers/authors/audible/SeedHelper.test.ts`
- `tests/helpers/utils/UpdateScheduler.test.ts`
- `tests/helpers/utils/UpdateScheduler.parallel.test.ts`
- `tests/helpers/utils/shared.test.ts`
- `tests/helpers/utils/batchProcessor.test.ts`
- `tests/helpers/utils/connectionPool.test.ts`
- `tests/helpers/utils/fetchPlus.test.ts`
- `tests/helpers/utils/CircuitBreaker.test.ts`
- `tests/audible/books/api.test.ts`
- `tests/audible/books/scrape.test.ts`
- `tests/audible/books/chapter.test.ts`
- `tests/audible/books/stitch.test.ts`
- `tests/audible/authors/scrape.test.ts`

### Live Tests (Network Dependent)

These tests make real API calls and require the `RUN_LIVE_TESTS` environment variable:

- `tests/live/audible/books/api.live.test.ts`
- `tests/live/audible/books/scrape.live.test.ts`
- `tests/live/audible/books/chapter.live.test.ts`
- `tests/live/audible/authors/scrape.live.test.ts`

## Package.json Scripts

### Bun Tests

```bash
# Run bun-compatible unit tests
bun run test

# Run live integration tests (requires RUN_LIVE_TESTS=true)
bun run test:live

# Run server in watch mode for development
bun run watch
```

**Note:** The project has migrated from Jest to Bun's native test runner. To run tests in watch mode, use `bun test --watch` directly (not an npm script). Use `bun run watch` to start the server in watch mode during development.

## Migration Notes

### API Differences

| Feature        | Jest                                   | bun:test                                            |
| -------------- | -------------------------------------- | --------------------------------------------------- |
| Import         | `import { jest } from '@jest/globals'` | `import { describe, test, expect } from 'bun:test'` |
| Mock function  | `jest.fn()`                            | `jest.fn()` (same API)                              |
| Spy on         | `jest.spyOn(obj, 'method')`            | `spyOn(obj, 'method')` from bun:test                |
| Module mock    | `jest.mock('./module')`                | `mock.module('./module', () => {...})`              |
| Type-safe mock | `jest-mock-extended`                   | Not available in Bun                                |

### Known Limitations

1. **light-my-request**: Fastify's testing utility requires Node.js streams
2. **jest-mock-extended**: No equivalent in Bun ecosystem
3. **Module mocking**: Bun's `mock.module()` has different semantics than Jest's `jest.mock()`
4. **Coverage**: Bun's built-in coverage reporter differs from Jest's Istanbul-based reporter

## Future Work

To migrate more tests to Bun:

1. Replace `jest-mock-extended` with manual mocks or Bun's `mock()`
2. Refactor Fastify route tests to use a different testing approach
3. Create Bun-compatible versions of heavily mocked tests

## References

- [Bun Test Documentation](https://bun.sh/docs/cli/test)
- [Jest Compatibility](https://bun.sh/docs/cli/test#jest-compatibility)
