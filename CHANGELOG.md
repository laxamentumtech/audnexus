# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.13.0](https://github.com/laxamentumtech/audnexus/compare/v1.12.0...v1.13.0) (2026-02-17)


### Features

* add Cloudflare IP auto-discovery for rate limiting ([6b633a3](https://github.com/laxamentumtech/audnexus/commit/6b633a37dd2823cdba9fe9753541380b935b6df7))


### Bug Fixes

* **cloudflare:** prevent race condition in concurrent IP fetches ([08312af](https://github.com/laxamentumtech/audnexus/commit/08312af15566de03698101c3eec9167b0b5c9431))
* disable metrics by default, filter error responses, and secure rate limiting ([bb79540](https://github.com/laxamentumtech/audnexus/commit/bb79540f16f865e5ce81f3fcd78f8da6d0c8cd9f))
* implement rate limiting improvements ([7468147](https://github.com/laxamentumtech/audnexus/commit/7468147b415e3af0406bfc5ca9839e8e87cbfdf0))

## [1.12.0](https://github.com/laxamentumtech/audnexus/compare/v1.11.0...v1.12.0) (2026-02-16)


### Features

* **server:** register metrics hooks and routes ([273846f](https://github.com/laxamentumtech/audnexus/commit/273846fd1437d51a65423eb45605ac1c0d00cf02))


### Bug Fixes

* **ci:** align action SHAs with existing workflows ([c48588d](https://github.com/laxamentumtech/audnexus/commit/c48588d41a232c34630e90056495584aa8db0040))
* **ci:** correct pages action SHAs ([9c5c024](https://github.com/laxamentumtech/audnexus/commit/9c5c0247c98fc6d460e0b9e4e1ba325d79685cbc))
* **ci:** correct pnpm/action-setup SHA hash ([417a693](https://github.com/laxamentumtech/audnexus/commit/417a693e5bd08896b91af0789b5aa45c07a578ea))
* **scheduler:** remove artificial rate limiting in parallel mode ([d7cc5ae](https://github.com/laxamentumtech/audnexus/commit/d7cc5aeb7a9bb695ea1cf821df49c8240db87b8c))

## [1.11.0](https://github.com/laxamentumtech/audnexus/compare/v1.10.0...v1.11.0) (2026-02-16)


### Features

* **config:** add metrics auth warning and TRUSTED_PROXIES support ([c2b12fd](https://github.com/laxamentumtech/audnexus/commit/c2b12fdb16162c20861993542285c0bc9cb7e3a4))
* **config:** add SCHEDULER_MAX_PER_REGION and DEFAULT_REGION for configurable batch processing ([8af62be](https://github.com/laxamentumtech/audnexus/commit/8af62be57fc3f8ce14be0c617d281dc81b1a6baf))
* **metrics:** add CIDR support for IP allowlisting ([24d615a](https://github.com/laxamentumtech/audnexus/commit/24d615aa9c41877898a44d0f658a7c1bd0cf8bb1))


### Bug Fixes

* **batch-processor:** correct maxConcurrencyObserved initialization ([a7a568a](https://github.com/laxamentumtech/audnexus/commit/a7a568ac016ce7f7918658c97c02233cead357b1))
* **ci:** add curl timeout and response body capture to Coolify deploy ([3ba1ec7](https://github.com/laxamentumtech/audnexus/commit/3ba1ec70d464fb26c0b0fb76365c05cc61d5b2e9))
* **circuit-breaker:** validate and normalize options ([56b3aaf](https://github.com/laxamentumtech/audnexus/commit/56b3aaf99ceeb8925814939160a43f87ed41cbea))
* **security:** use timingSafeEqual for token comparison and restrict trustProxy ([60bd113](https://github.com/laxamentumtech/audnexus/commit/60bd113e556afcd7c063b110c8d7ec76e1a1fff4))
* **utils:** resolve race condition in batchProcessor and cap CircuitBreaker counter ([6019c8e](https://github.com/laxamentumtech/audnexus/commit/6019c8efe49123b652c692038ecf5adcea088157))


### Performance Improvements

* node performance optimization ([#844](https://github.com/laxamentumtech/audnexus/issues/844)) ([ca9749c](https://github.com/laxamentumtech/audnexus/commit/ca9749cf9a3c84e3f1a979a283de73780a3cb638))

## [1.10.0](https://github.com/laxamentumtech/audnexus/compare/v1.9.1...v1.10.0) (2026-02-15)

### Dependencies

- Upgrade p-limit from 3.1.0 to 5.0.0
  - Jest configuration updated to add custom mock registration for p-limit
  - transformIgnorePatterns adjusted to transform p-limit (pure ESM package)

### Features

- **docker:** add non-root user and healthcheck ([018d74c](https://github.com/laxamentumtech/audnexus/commit/018d74cec1d4814935eaf1ed0e5734d67609588d))
- **tests:** add live integration tests for Audible monitoring ([182d246](https://github.com/laxamentumtech/audnexus/commit/182d246398278f9e6a807b67768918c4ea1b9138))

### Bug Fixes

- **backup:** redirect log() to stderr and fix password passing ([f92de86](https://github.com/laxamentumtech/audnexus/commit/f92de860f7209f83bcca542dcfd0d7c71c2dc257))
- check for running container in migrate-mongodb.sh ([2967c3c](https://github.com/laxamentumtech/audnexus/commit/2967c3c840ef556c5998cefc08b3d0754dd30f1d))
- **ci:** update all workflows with SHA hashes and fix coverage threshold ([1f46fdd](https://github.com/laxamentumtech/audnexus/commit/1f46fdd2e495cb4265f70bec60d3f46c722897c7))
- **ci:** use full SHA hashes for GitHub Actions versions ([d0b5006](https://github.com/laxamentumtech/audnexus/commit/d0b5006908a2de43519d30ea2185469d1bd9dc12))
- **config:** standardize env var names and make mongoClient optional ([a8453b4](https://github.com/laxamentumtech/audnexus/commit/a8453b4f2cc1d5c83fcb675aa3a2b5833092b873))
- **docker:** remove NODE\_ prefix from env vars in docker-compose.yml for consistency ([29230b0](https://github.com/laxamentumtech/audnexus/commit/29230b0e802b599d50ca65f6efb5c1e861d97e42))
- **helpers:** improve error handling and add fallback logger ([cf0015f](https://github.com/laxamentumtech/audnexus/commit/cf0015ff92c5aa0d307ac0222e4b7ff20d0d5fcc))
- **lint:** fix linting issues causing CI failure ([11c8282](https://github.com/laxamentumtech/audnexus/commit/11c82825c51bae309047f5e069c7b2f12eceb2e6))
- **scripts:** ensure log directory exists before first log call ([aacf422](https://github.com/laxamentumtech/audnexus/commit/aacf42207db115a5db40218891edfe578ed4e4cc))
- **scripts:** improve security and error handling in backup scripts ([8c86eb9](https://github.com/laxamentumtech/audnexus/commit/8c86eb9b2f50aeeb3bfbec36045c145fbcee4e3f))
- **src:** improve error handling and logging ([977f082](https://github.com/laxamentumtech/audnexus/commit/977f082813c6dcfc36561e6892936e3e9952f848))
- **test:** check error type before casting to NotFoundError ([320bc98](https://github.com/laxamentumtech/audnexus/commit/320bc98c7cb74bc49197291ee25f99f482ec0423))
- **test:** remove misleading comment in live test ([e51016b](https://github.com/laxamentumtech/audnexus/commit/e51016b42b873f3cbcf84632033e4b82e1604064))
- **tests:** add clarification comments that RSA keys are fake/mock for testing ([d5610cb](https://github.com/laxamentumtech/audnexus/commit/d5610cb1573a9080eb328da8b98cedab51e17ea5))
- **tests:** fix test isolation and assertion issues ([1c68f24](https://github.com/laxamentumtech/audnexus/commit/1c68f24462080c98d348649d331eee3e139c2771))
- **tests:** resolve test failures and update mocks ([7e902b2](https://github.com/laxamentumtech/audnexus/commit/7e902b2b5ae22c6d2829d07dd1736681f2e4bfa6))

## [2.0.0](https://github.com/djdembeck/audnexus/compare/v1.9.0...v2.0.0) (2026-02-12)

### ⚠ BREAKING CHANGES

- **api:** Error response format has changed

  The API now returns structured error responses with error codes instead of simple string messages.

  **Old format:**

  ```json
  { "error": "Item not available in region" }
  ```

  **New format:**

  ```json
  {
  	"error": {
  		"code": "REGION_UNAVAILABLE",
  		"message": "Item not available in region 'us' for ASIN: B12345",
  		"details": {
  			"asin": "B12345"
  		}
  	}
  }
  ```

  **Migration Guide:**

  If you were parsing errors like this:

  ```javascript
  const errorMessage = response.error
  ```

  You now need to access the structured error:

  ```javascript
  const errorCode = response.error.code
  const errorMessage = response.error.message
  const errorDetails = response.error.details
  ```

### Features

- **errors:** Add `ContentTypeMismatchError` class for content type mismatches
- **errors:** Add `ValidationError` class for schema validation failures
- **errors:** Add `RegionUnavailableError` class for region restrictions
- **errors:** Add `NotFoundError` class for generic not found errors
- **errors:** Add `BadRequestError` class for bad request errors
- **errors:** Add structured error responses with error codes
- **books:** Detect content type mismatches in ApiHelper
- **authors:** Detect content type mismatches in ScrapeHelper
- **chapters:** Detect content type mismatches in ChapterHelper
- **server:** Update error handler for structured responses

### Bug Fixes

- **errors:** Improve error handling for region restrictions

## [1.9.0](https://github.com/djdembeck/audnexus/compare/v1.8.0...v1.9.0) (2023-12-18)

### Features

- **helper:** :sparkles: cleanup chapter titles with underscore ([7ff0148](https://github.com/djdembeck/audnexus/commit/7ff014883abc9b4fc1b1f41db84218a6ec40f164))

## [1.8.0](https://github.com/djdembeck/audnexus/compare/v1.7.0...v1.8.0) (2023-08-29)

### Features

- **schema:** :sparkles: add `literatureType` field for fiction/nonfiction ([84536aa](https://github.com/djdembeck/audnexus/commit/84536aa20ce4f6159e477a3c9eeac97c4edf2eea))

## [1.7.0](https://github.com/djdembeck/audnexus/compare/v1.6.0...v1.7.0) (2023-08-19)

### Features

- **helper:** :sparkles: remove links, emails, and handles from descriptions ([e80819d](https://github.com/djdembeck/audnexus/commit/e80819dbfd069c5ac6581d669a1979a4b3695935))
- **schema:** :sparkles: add `copyright` and `isbn` fields ([d9bf840](https://github.com/djdembeck/audnexus/commit/d9bf840ffe58a89ce2e931234f2c88bdd885600e))
- **schema:** :sparkles: use `adult` data from audible in form of `isAdult` ([feec8d8](https://github.com/djdembeck/audnexus/commit/feec8d80916eeee48cf65598f8d3838ed7d6f414))

## [1.6.0](https://github.com/djdembeck/audnexus/compare/v1.5.0...v1.6.0) (2023-07-30)

### Features

- **helper:** :recycle: add `UPDATE_THRESHOLD` env variable ([9ec251b](https://github.com/djdembeck/audnexus/commit/9ec251b4c1137e551693800536bd52421b8e0768))

### Bug Fixes

- **helper:** :bug: audible requires auth for chapters again ([e42f1b1](https://github.com/djdembeck/audnexus/commit/e42f1b18fe002ba212ef7467821877e2b7d3e8a1)), closes [#658](https://github.com/djdembeck/audnexus/issues/658)

## [1.5.0](https://github.com/djdembeck/audnexus/compare/v1.4.0...v1.5.0) (2023-07-24)

### Features

- update scheduler ([#635](https://github.com/djdembeck/audnexus/issues/635)) ([9e5dd54](https://github.com/djdembeck/audnexus/commit/9e5dd5492c8a00e29791c3f53389ebf2d1739c68))

## [1.4.0](https://github.com/djdembeck/audnexus/compare/v1.3.2...v1.4.0) (2023-06-22)

### Features

- similar authors ([#567](https://github.com/djdembeck/audnexus/issues/567)) ([87d6114](https://github.com/djdembeck/audnexus/commit/87d6114e2f554011de0a881c9e89b19c33a3524f))

### [1.3.2](https://github.com/djdembeck/audnexus/compare/v1.3.1...v1.3.2) (2023-06-21)

### Bug Fixes

- **types:** :bug: don't assume `SinglePartBook` won't have a series; combine redundant ApiBook types ([90a2a06](https://github.com/djdembeck/audnexus/commit/90a2a06bfade3ab96028258970c1ffaecaa1eb0b)), closes [#589](https://github.com/djdembeck/audnexus/issues/589)

### [1.3.1](https://github.com/djdembeck/audnexus/compare/v1.3.0...v1.3.1) (2023-03-06)

### Bug Fixes

- **helper:** :bug: some region author pages could get redirected ([ddf2d22](https://github.com/djdembeck/audnexus/commit/ddf2d22f46cd3bfa2f9cbce7e8725d445db74b6e))
- **types:** :bug: allow genre asin to either be 10 or 11 digits exactly ([ea338fa](https://github.com/djdembeck/audnexus/commit/ea338faf0a1ed0a5fbee9edbfd1641208f65447a)), closes [#571](https://github.com/djdembeck/audnexus/issues/571)

## [1.3.0](https://github.com/djdembeck/audnexus/compare/v1.2.0...v1.3.0) (2023-02-27)

### Bug Fixes

- **helper:** :bug: Audible could possibly redirect invalid author asin to search page ([7997fd8](https://github.com/djdembeck/audnexus/commit/7997fd831a36786bc82f66002679e5944617665b))
- **types:** :bug: fix regexes in zod types ([4161ad6](https://github.com/djdembeck/audnexus/commit/4161ad6c229c94d5c0c4723a3a948ed3d430e1f9))

## [1.2.0](https://github.com/djdembeck/audnexus/compare/v1.1.0...v1.2.0) (2023-01-26)

### Features

- **helper:** :zap: set redis expire time to 5 days ([d65dbeb](https://github.com/djdembeck/audnexus/commit/d65dbeb74eccc4a458b7ebe79037e68f052cced5))
- **helper:** :zap: use destructuring instead of DB projections to get the data returned without DB fields ([17f68e0](https://github.com/djdembeck/audnexus/commit/17f68e0b480a8e3314c45e5f9c8582535405c7b2))

## [1.1.0](https://github.com/djdembeck/audnexus/compare/v1.0.2...v1.1.0) (2023-01-26)

### Features

- :alien: chapters no longer need auth ([6eb12b0](https://github.com/djdembeck/audnexus/commit/6eb12b0503de4e8be8c96b017e85c91c02014573))

### [1.0.2](https://github.com/djdembeck/audnexus/compare/v1.0.1...v1.0.2) (2022-12-05)

### Bug Fixes

- **helper:** :bug: non `us` genres would be filtered out ([c09bba1](https://github.com/djdembeck/audnexus/commit/c09bba13bec9411c35de8f7a7a7f10d454db9289)), closes [#517](https://github.com/djdembeck/audnexus/issues/517)

### [1.0.1](https://github.com/djdembeck/audnexus/compare/v1.0.0...v1.0.1) (2022-10-08)

### Bug Fixes

- **helper:** :bug: redis now uses `region` for setting keys ([53cf6e8](https://github.com/djdembeck/audnexus/commit/53cf6e879e9399db0caf7923945653c580c82c17))

## [1.0.0](https://github.com/djdembeck/audnexus/compare/v0.9.1...v1.0.0) (2022-10-05)

### ⚠ BREAKING CHANGES

- multi region support (#498)

### Features

- multi region support ([#498](https://github.com/djdembeck/audnexus/issues/498)) ([4a38714](https://github.com/djdembeck/audnexus/commit/4a387146522865575df87b072821735d475afc63))

### [0.9.1](https://github.com/djdembeck/audnexus/compare/v0.9.0...v0.9.1) (2022-09-23)

## [0.9.0](https://github.com/djdembeck/audnexus/compare/v0.8.0...v0.9.0) (2022-09-08)

### Features

- enable basic rate limiting ([#480](https://github.com/djdembeck/audnexus/issues/480)) ([c6d277b](https://github.com/djdembeck/audnexus/commit/c6d277b028a49d5d62c8895dbf74d6cb41044dae))

## [0.8.0](https://github.com/djdembeck/audnexus/compare/v0.7.1...v0.8.0) (2022-09-07)

### Features

- **helper:** :sparkles: support podcasts ([9eaa00f](https://github.com/djdembeck/audnexus/commit/9eaa00fa72b2152dbf30dd6b309aeefe5c1242f4))

### [0.7.1](https://github.com/djdembeck/audnexus/compare/v0.7.0...v0.7.1) (2022-09-03)

### Bug Fixes

- **helper:** :ambulance: refactor `StitchHelper` to check required keys BEFORE trying to parse ([351751e](https://github.com/djdembeck/audnexus/commit/351751eacc6c3efbe1bdc45543b0eb26e446b83e))

## [0.7.0](https://github.com/djdembeck/audnexus/compare/v0.6.0...v0.7.0) (2022-09-02)

### Features

- :sparkles: use Dependency Injection for MongoClient ([1430a0f](https://github.com/djdembeck/audnexus/commit/1430a0f0a32023cdf16ee7bfea573d42aacb7811))
- **helper:** :label: add type predicates for `Book` and `BookDocument` ([487315a](https://github.com/djdembeck/audnexus/commit/487315ae3fd254da713c43e281d048347dd5cd39))
- **helper:** :label: type predicates for `AuthorProfile` and `Chapter` ([5386967](https://github.com/djdembeck/audnexus/commit/5386967b63344f19d539d4aacf23412ae59338a8))
- **helper:** :sparkles: add `BookDeleteHelper` for delete route ([bc9daa3](https://github.com/djdembeck/audnexus/commit/bc9daa3aa91e30351a260be3c76faa76fb5fc126))
- **helper:** :sparkles: add `set` functions to paprAudible helpers ([f220383](https://github.com/djdembeck/audnexus/commit/f22038323305d2a265cbc336fc0336ec65b2a00d))
- **helper:** :sparkles: add function `getParamString` to make param construction easier to read and add to ([302de43](https://github.com/djdembeck/audnexus/commit/302de4343aac58514ee4acfdd0f05e0258b0d6c8))
- **helper:** :sparkles: always assign date to book update ([abde31d](https://github.com/djdembeck/audnexus/commit/abde31d20cc8efa2662bf418fcf1783cfbcf1e61))
- **helper:** :sparkles: always sort objects when retruning to user ([7f9674c](https://github.com/djdembeck/audnexus/commit/7f9674ca24e81d9571d48d7e3edc276d90fd9b1d))
- **helper:** :sparkles: use Audible API for genres ([0ef54b0](https://github.com/djdembeck/audnexus/commit/0ef54b044c7b10ff3a6abc206cc45f10b5f4665a))
- **route:** :sparkles: `ChapterShowHelper` ([bc4021e](https://github.com/djdembeck/audnexus/commit/bc4021ec4acb39556ab78db3db30f90529e23343))
- **route:** :sparkles: add `delete` route for chapters ([cb86799](https://github.com/djdembeck/audnexus/commit/cb86799f22f877635c2f98f9dfce43655adcda29))
- **route:** :sparkles: author `ShowHelper` and `DeleteHelper` ([f1b72e9](https://github.com/djdembeck/audnexus/commit/f1b72e93c142abc40551a39b30375476f88d3b3e))
- **route:** :sparkles: create `BookShowHelper` for all `books/show.ts` functionality ([4486643](https://github.com/djdembeck/audnexus/commit/448664353e859a787c8279b66250636e4a177521))

### Bug Fixes

- **helper:** :bug: improve key check so empty objects don't pass ([0bcea5f](https://github.com/djdembeck/audnexus/commit/0bcea5fb048d5f83225621ce3963d7cfbe0582fb))
- **types:** :bug: `product_images` can be missing/undefined from Audible responses, so update the type ([078cbd3](https://github.com/djdembeck/audnexus/commit/078cbd34090f972ab7db70d18e761722cab31f96))

## [0.6.0](https://github.com/djdembeck/audnexus/compare/v0.5.1...v0.6.0) (2022-08-05)

### Features

- **helper:** :recycle: add `redis` helper for more portable and reusable functions ([a4a5682](https://github.com/djdembeck/audnexus/commit/a4a5682f511ad9cc37c46166652c47cb084e4b10))

### Bug Fixes

- **helper:** :bug: always trim author name when scraping ([f598f2e](https://github.com/djdembeck/audnexus/commit/f598f2e3a524ff9c4291a3fcd27ac334004396bb))
- **helper:** :bug: fetchPlus wouldn't retry ([967d340](https://github.com/djdembeck/audnexus/commit/967d34089723220b9a1d23024ef6b50e994d5224))
- **helper:** :bug: fix throwing error in ChapterHelper using asin before it's assigned ([d0bc3d8](https://github.com/djdembeck/audnexus/commit/d0bc3d805cf3160b11659334dfc14c337c3996c7))
- **types:** :label: add `editorial_reviews`, `program_participation`, and make `title` optional ([38c536f](https://github.com/djdembeck/audnexus/commit/38c536f1ca637781709b29b07a69edaa780cce0f))
- **types:** :label: fix response_groups type for chapters ([9d4cfdf](https://github.com/djdembeck/audnexus/commit/9d4cfdf4b9265e16523a0eab44dd22c4b674fe64))
- **types:** :label: series is an optional field on AudibleProduct ([c72f31b](https://github.com/djdembeck/audnexus/commit/c72f31bb9c1f9fc8059c9060dc61aed700ccdf20))
- **types:** :label: thesaurus_subject_keywords had wrong type ([d451736](https://github.com/djdembeck/audnexus/commit/d451736495a16a873b57c3447145f29dfe9b3fa5))

### [0.5.1](https://github.com/djdembeck/audnexus/compare/v0.4.5...v0.5.1) (2022-07-22)

### Features

- **route:** :triangular_flag_on_post: add `update=2` to add timestamps to existing database entries ([294046f](https://github.com/djdembeck/audnexus/commit/294046f50d3ed6a4fe195152ecb226581df31a6a))

### [0.4.5](https://github.com/djdembeck/audnexus/compare/v0.4.4...v0.4.5) (2022-07-20)

### Bug Fixes

- :ambulance: still need await for returns in try/catch ([1181d70](https://github.com/djdembeck/audnexus/commit/1181d700b4d37b3d73046e394252c796f5efa1d7))
- :bug: fix renovate.json EOF ([322c969](https://github.com/djdembeck/audnexus/commit/322c9692bca98da57463db88e11b15bb1a7763e8))
- :bug: use spread operator to resolve signature index problem ([d0b838c](https://github.com/djdembeck/audnexus/commit/d0b838c833fce1d9c0dc6235f5c3d1f95e9eb1fc))
- **author-scraper:** :adhesive_bandage: author helper options doesn't use seed ([9c2b38a](https://github.com/djdembeck/audnexus/commit/9c2b38a5f06e2f1d0e82551316563c21a38e6a9e))
- **book-audible-api:** :pencil2: fix replace typo ([f8e64e2](https://github.com/djdembeck/audnexus/commit/f8e64e2ea94671f4b78600c1fc79b8f4a003a6a1))
- **route:** :pencil2: update helper name on book delete route ([adeea0a](https://github.com/djdembeck/audnexus/commit/adeea0a7f9cf56710201f3a56c12c0768260e270))

### [0.4.4](https://github.com/djdembeck/audnexus/compare/v0.4.3...v0.4.4) (2022-05-20)

### Bug Fixes

- **schema:** :card_file_box: require asin in AuthorInterface; don't require description in model ([0997ad5](https://github.com/djdembeck/audnexus/commit/0997ad5d04963a2bd6073337e34666e667da062f))

### [0.4.3](https://github.com/djdembeck/audnexus/compare/v0.4.2...v0.4.3) (2022-04-12)

### [0.4.2](https://github.com/djdembeck/audnexus/compare/v0.4.1...v0.4.2) (2022-03-29)

### Bug Fixes

- **route:** :bug: register new delete path ([6254083](https://github.com/djdembeck/audnexus/commit/6254083ea31ef0b712f111976ed18b38c84caa29))

### [0.4.1](https://github.com/djdembeck/audnexus/compare/v0.4.0...v0.4.1) (2022-03-29)

### Bug Fixes

- **route:** :bug: reply with proper return codes on errors or exceptions ([e34e182](https://github.com/djdembeck/audnexus/commit/e34e18249225572074403e4234116f7fc65f4521))

## [0.4.0](https://github.com/djdembeck/audnexus/compare/v0.3.8...v0.4.0) (2022-03-01)

### Features

- **route:** :sparkles: add `update` query param option to `/authors` endpoint ([1339f57](https://github.com/djdembeck/audnexus/commit/1339f57d575b03058a00ff73db91d32604e542a9))

### Bug Fixes

- **route:** :bug: nothing could be returned when no genres existed; fixes [#255](https://github.com/djdembeck/audnexus/issues/255) ([093e2d7](https://github.com/djdembeck/audnexus/commit/093e2d70aa0177bd70a0c8164d7f708f6a3d5cf4))

### [0.3.8](https://github.com/djdembeck/audnexus/compare/v0.3.7...v0.3.8) (2022-02-19)

### [0.3.7](https://github.com/djdembeck/audnexus/compare/v0.3.6...v0.3.7) (2022-02-08)

### [0.3.6](https://github.com/djdembeck/audnexus/compare/v0.3.5...v0.3.6) (2022-02-07)

### [0.3.5](https://github.com/djdembeck/audnexus/compare/v0.3.4...v0.3.5) (2022-01-29)

### [0.3.4](https://github.com/djdembeck/audnexus/compare/v0.3.3...v0.3.4) (2021-12-11)

### Features

- **route:** :construction: try to support CORS ([90a1b54](https://github.com/djdembeck/audnexus/commit/90a1b548597688c903147f10b5e31d27e6246b7e))

### [0.3.3](https://github.com/djdembeck/audnexus/compare/v0.3.2...v0.3.3) (2021-12-02)

### Features

- **schema:** :sparkles: add `update` param on `/books` route to update data in DB ([f2f5d41](https://github.com/djdembeck/audnexus/commit/f2f5d41a7a0b4dfdc029a4fd58aebfcd876a4063))

### Bug Fixes

- **book-audible-api:** :adhesive_bandage: throw error if book date is in the future ([ef216dd](https://github.com/djdembeck/audnexus/commit/ef216dd63fe2a7ea3e52d96a8804719db3a0708f))

### [0.3.2](https://github.com/djdembeck/audnexus/compare/v0.3.1...v0.3.2) (2021-11-30)

### Features

- **book-audible-api:** :recycle: use audible API for series data instead of scraping ([0c7c7db](https://github.com/djdembeck/audnexus/commit/0c7c7db2e6972ab5a534412397a1859996f5063f))

### Bug Fixes

- **book-audible-api:** :pencil2: fix key typo ([611113b](https://github.com/djdembeck/audnexus/commit/611113b6d2cd160b2baa587b36d1f2fa17644a68))

### [0.3.1](https://github.com/djdembeck/audnexus/compare/v0.3.0...v0.3.1) (2021-11-09)

### Bug Fixes

- **author-search:** :recycle: remove flexsearch and just use mongodb search ([26435e1](https://github.com/djdembeck/audnexus/commit/26435e15cbf8a1457438519a1640c4ab085eee13))

## [0.3.0](https://github.com/djdembeck/audnexus/compare/v0.3.0-1...v0.3.0) (2021-10-12)

## [0.3.0-1](https://github.com/djdembeck/audnexus/compare/v0.3.0-0...v0.3.0-1) (2021-10-06)

### Features

- **author-search:** :recycle: use FlexSearch to return author results ([92dec92](https://github.com/djdembeck/audnexus/commit/92dec9208cded2776860673de0c15bbdc073c1ce))

## [0.3.0-0](https://github.com/djdembeck/audnexus/compare/v0.2.0...v0.3.0-0) (2021-10-03)

### ⚠ BREAKING CHANGES

- **feat(scraper):** add 'tag' support: types have been reworked to be either 'genre' or 'tag' - removing any parent/child usage since those are no longer relevant

- **refactor(author-search):** set db name properly

### Features

- **route:** :sparkles: automatically seed authors from requested book ([e99a52d](https://github.com/djdembeck/audnexus/commit/e99a52d6a728b83fde25f7584b1ff0dc2188a529))
- **route:** :truck: add search endpoint ([867804a](https://github.com/djdembeck/audnexus/commit/867804a107ec6e040ea88f2c9a3f2a629e2f618b))
- **scraper:** :sparkles: add 'tag' support ([5f0466e](https://github.com/djdembeck/audnexus/commit/5f0466e3e694fd7d6a399399f2c5a6ce140992ff))
- **scraper:** :sparkles: add scraping portion of Author ([2d533bd](https://github.com/djdembeck/audnexus/commit/2d533bd066f12869ed10f7f4b657dcebe2c66da9))

### Bug Fixes

- **author-scraper:** :bug: don't run author on undefined ([c73d8ee](https://github.com/djdembeck/audnexus/commit/c73d8ee712a6c891443a7eb06846c3609bfb2182))
- **author-scraper:** :bug: throw error on catching name error instead of just logging it ([ef6976e](https://github.com/djdembeck/audnexus/commit/ef6976e4e2acc33b803d8056c5ea2318715bff0f))
- **author-search:** :ambulance: use full phrase search until weighted sorting is available ([166c30d](https://github.com/djdembeck/audnexus/commit/166c30d76fcba595ebff25e43653cfeac457b792))

## 0.2.0 (2021-09-27)

### ⚠ BREAKING CHANGES

- **schema:** change series' names

### Features

- :sparkles: add chapter support ([a224af5](https://github.com/djdembeck/audnexus/commit/a224af5d7467fe68a144f7cba3f02d3e3c850ee2))
- Add graceful server shutdown ([900944c](https://github.com/djdembeck/audnexus/commit/900944c9ceca2570b7c998e5743c0f10f87cb1df))
- **audible-api:** :sparkles: add rating field ([5f1b75f](https://github.com/djdembeck/audnexus/commit/5f1b75fb1bcb492d333a511619e325632df7b927))
- **audible-api:** :sparkles: Use higher res art when available ([7ca3448](https://github.com/djdembeck/audnexus/commit/7ca344819dca12911259b9b8a97e8c7c69e850f7))

### Bug Fixes

- :bug: correct redis stringify ([b21bdeb](https://github.com/djdembeck/audnexus/commit/b21bdeb2298736c3abd891eedd60294c96a88f17))
- **audible-api:** :bug: check for sub-key of image ([869bb75](https://github.com/djdembeck/audnexus/commit/869bb75ef4ffc514c9d7f13c9bfbb7d5afc20b05))
- **audible-api:** :bug: if check for sub-key wasn't working ([585ca5e](https://github.com/djdembeck/audnexus/commit/585ca5edc3a8a461da8ac62456139bdfdf460381))
- **audible-api:** :bug: this is a string for now ([131be6f](https://github.com/djdembeck/audnexus/commit/131be6f519b75ab3d6d2d7d0f54a71477d05ba5a))
- **audible-api:** :bug: use trim to cleanup white space and \n from description ([31e93b8](https://github.com/djdembeck/audnexus/commit/31e93b84933a88842cd7f57d8f0a69135157898e))
- **chapters:** :ambulance: fix typo for startOffsetSec ([3e68ef4](https://github.com/djdembeck/audnexus/commit/3e68ef4d7dfc9c7d42c52a0f3a37e9589d7fe428))
- **chapters:** :goal_net: throw error if no env vars ([f4f8085](https://github.com/djdembeck/audnexus/commit/f4f80857b0b97b535ed8260fdb8a2edb0589c8f7))
- **schema:** :pencil2: fix mispelling ([e269bb4](https://github.com/djdembeck/audnexus/commit/e269bb41fff69201e0aa3f814e8ccf5b103740ba))
- **scraper:** :bug: only LOG if not 404, not only return ([ae64436](https://github.com/djdembeck/audnexus/commit/ae64436cf30ef43e6c88b028669bb3195b3d496e))
- **stitcher:** :ambulance: Fix series names ([f68c664](https://github.com/djdembeck/audnexus/commit/f68c66407416970bda0f3b69be8576ce13e39063))

- **schema:** change series' names ([50d4423](https://github.com/djdembeck/audnexus/commit/50d442377d909a05f5208a266fb15a31abfccdfc))
