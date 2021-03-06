# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.5.1](https://github.com/djdembeck/audnexus/compare/v0.4.5...v0.5.1) (2022-07-22)


### Features

* **route:** :triangular_flag_on_post: add `update=2` to add timestamps to existing database entries ([294046f](https://github.com/djdembeck/audnexus/commit/294046f50d3ed6a4fe195152ecb226581df31a6a))

### [0.4.5](https://github.com/djdembeck/audnexus/compare/v0.4.4...v0.4.5) (2022-07-20)


### Bug Fixes

* :ambulance: still need await for returns in try/catch ([1181d70](https://github.com/djdembeck/audnexus/commit/1181d700b4d37b3d73046e394252c796f5efa1d7))
* :bug: fix renovate.json EOF ([322c969](https://github.com/djdembeck/audnexus/commit/322c9692bca98da57463db88e11b15bb1a7763e8))
* :bug: use spread operator to resolve signature index problem ([d0b838c](https://github.com/djdembeck/audnexus/commit/d0b838c833fce1d9c0dc6235f5c3d1f95e9eb1fc))
* **author-scraper:** :adhesive_bandage: author helper options doesn't use seed ([9c2b38a](https://github.com/djdembeck/audnexus/commit/9c2b38a5f06e2f1d0e82551316563c21a38e6a9e))
* **book-audible-api:** :pencil2: fix replace typo ([f8e64e2](https://github.com/djdembeck/audnexus/commit/f8e64e2ea94671f4b78600c1fc79b8f4a003a6a1))
* **route:** :pencil2: update helper name on book delete route ([adeea0a](https://github.com/djdembeck/audnexus/commit/adeea0a7f9cf56710201f3a56c12c0768260e270))

### [0.4.4](https://github.com/djdembeck/audnexus/compare/v0.4.3...v0.4.4) (2022-05-20)


### Bug Fixes

* **schema:** :card_file_box: require asin in AuthorInterface; don't require description in model ([0997ad5](https://github.com/djdembeck/audnexus/commit/0997ad5d04963a2bd6073337e34666e667da062f))

### [0.4.3](https://github.com/djdembeck/audnexus/compare/v0.4.2...v0.4.3) (2022-04-12)

### [0.4.2](https://github.com/djdembeck/audnexus/compare/v0.4.1...v0.4.2) (2022-03-29)


### Bug Fixes

* **route:** :bug: register new delete path ([6254083](https://github.com/djdembeck/audnexus/commit/6254083ea31ef0b712f111976ed18b38c84caa29))

### [0.4.1](https://github.com/djdembeck/audnexus/compare/v0.4.0...v0.4.1) (2022-03-29)


### Bug Fixes

* **route:** :bug: reply with proper return codes on errors or exceptions ([e34e182](https://github.com/djdembeck/audnexus/commit/e34e18249225572074403e4234116f7fc65f4521))

## [0.4.0](https://github.com/djdembeck/audnexus/compare/v0.3.8...v0.4.0) (2022-03-01)


### Features

* **route:** :sparkles: add `update` query param option to `/authors` endpoint ([1339f57](https://github.com/djdembeck/audnexus/commit/1339f57d575b03058a00ff73db91d32604e542a9))


### Bug Fixes

* **route:** :bug: nothing could be returned when no genres existed; fixes [#255](https://github.com/djdembeck/audnexus/issues/255) ([093e2d7](https://github.com/djdembeck/audnexus/commit/093e2d70aa0177bd70a0c8164d7f708f6a3d5cf4))

### [0.3.8](https://github.com/djdembeck/audnexus/compare/v0.3.7...v0.3.8) (2022-02-19)

### [0.3.7](https://github.com/djdembeck/audnexus/compare/v0.3.6...v0.3.7) (2022-02-08)

### [0.3.6](https://github.com/djdembeck/audnexus/compare/v0.3.5...v0.3.6) (2022-02-07)

### [0.3.5](https://github.com/djdembeck/audnexus/compare/v0.3.4...v0.3.5) (2022-01-29)

### [0.3.4](https://github.com/djdembeck/audnexus/compare/v0.3.3...v0.3.4) (2021-12-11)


### Features

* **route:** :construction: try to support CORS ([90a1b54](https://github.com/djdembeck/audnexus/commit/90a1b548597688c903147f10b5e31d27e6246b7e))

### [0.3.3](https://github.com/djdembeck/audnexus/compare/v0.3.2...v0.3.3) (2021-12-02)


### Features

* **schema:** :sparkles: add `update` param on `/books` route to update data in DB ([f2f5d41](https://github.com/djdembeck/audnexus/commit/f2f5d41a7a0b4dfdc029a4fd58aebfcd876a4063))


### Bug Fixes

* **book-audible-api:** :adhesive_bandage: throw error if book date is in the future ([ef216dd](https://github.com/djdembeck/audnexus/commit/ef216dd63fe2a7ea3e52d96a8804719db3a0708f))

### [0.3.2](https://github.com/djdembeck/audnexus/compare/v0.3.1...v0.3.2) (2021-11-30)


### Features

* **book-audible-api:** :recycle: use audible API for series data instead of scraping ([0c7c7db](https://github.com/djdembeck/audnexus/commit/0c7c7db2e6972ab5a534412397a1859996f5063f))


### Bug Fixes

* **book-audible-api:** :pencil2: fix key typo ([611113b](https://github.com/djdembeck/audnexus/commit/611113b6d2cd160b2baa587b36d1f2fa17644a68))

### [0.3.1](https://github.com/djdembeck/audnexus/compare/v0.3.0...v0.3.1) (2021-11-09)


### Bug Fixes

* **author-search:** :recycle: remove flexsearch and just use mongodb search ([26435e1](https://github.com/djdembeck/audnexus/commit/26435e15cbf8a1457438519a1640c4ab085eee13))

## [0.3.0](https://github.com/djdembeck/audnexus/compare/v0.3.0-1...v0.3.0) (2021-10-12)

## [0.3.0-1](https://github.com/djdembeck/audnexus/compare/v0.3.0-0...v0.3.0-1) (2021-10-06)


### Features

* **author-search:** :recycle: use FlexSearch to return author results ([92dec92](https://github.com/djdembeck/audnexus/commit/92dec9208cded2776860673de0c15bbdc073c1ce))

## [0.3.0-0](https://github.com/djdembeck/audnexus/compare/v0.2.0...v0.3.0-0) (2021-10-03)

### ??? BREAKING CHANGES

* **feat(scraper):** add 'tag' support: types have been reworked to be either 'genre' or 'tag' - removing any parent/child usage since those are no longer relevant

* **refactor(author-search):** set db name properly

### Features

* **route:** :sparkles: automatically seed authors from requested book ([e99a52d](https://github.com/djdembeck/audnexus/commit/e99a52d6a728b83fde25f7584b1ff0dc2188a529))
* **route:** :truck: add search endpoint ([867804a](https://github.com/djdembeck/audnexus/commit/867804a107ec6e040ea88f2c9a3f2a629e2f618b))
* **scraper:** :sparkles: add 'tag' support ([5f0466e](https://github.com/djdembeck/audnexus/commit/5f0466e3e694fd7d6a399399f2c5a6ce140992ff))
* **scraper:** :sparkles: add scraping portion of Author ([2d533bd](https://github.com/djdembeck/audnexus/commit/2d533bd066f12869ed10f7f4b657dcebe2c66da9))


### Bug Fixes

* **author-scraper:** :bug: don't run author on undefined ([c73d8ee](https://github.com/djdembeck/audnexus/commit/c73d8ee712a6c891443a7eb06846c3609bfb2182))
* **author-scraper:** :bug: throw error on catching name error instead of just logging it ([ef6976e](https://github.com/djdembeck/audnexus/commit/ef6976e4e2acc33b803d8056c5ea2318715bff0f))
* **author-search:** :ambulance: use full phrase search until weighted sorting is available ([166c30d](https://github.com/djdembeck/audnexus/commit/166c30d76fcba595ebff25e43653cfeac457b792))

## 0.2.0 (2021-09-27)


### ??? BREAKING CHANGES

* **schema:** change series' names

### Features

* :sparkles: add chapter support ([a224af5](https://github.com/djdembeck/audnexus/commit/a224af5d7467fe68a144f7cba3f02d3e3c850ee2))
* Add graceful server shutdown ([900944c](https://github.com/djdembeck/audnexus/commit/900944c9ceca2570b7c998e5743c0f10f87cb1df))
* **audible-api:** :sparkles: add rating field ([5f1b75f](https://github.com/djdembeck/audnexus/commit/5f1b75fb1bcb492d333a511619e325632df7b927))
* **audible-api:** :sparkles: Use higher res art when available ([7ca3448](https://github.com/djdembeck/audnexus/commit/7ca344819dca12911259b9b8a97e8c7c69e850f7))


### Bug Fixes

* :bug: correct redis stringify ([b21bdeb](https://github.com/djdembeck/audnexus/commit/b21bdeb2298736c3abd891eedd60294c96a88f17))
* **audible-api:** :bug: check for sub-key of image ([869bb75](https://github.com/djdembeck/audnexus/commit/869bb75ef4ffc514c9d7f13c9bfbb7d5afc20b05))
* **audible-api:** :bug: if check for sub-key wasn't working ([585ca5e](https://github.com/djdembeck/audnexus/commit/585ca5edc3a8a461da8ac62456139bdfdf460381))
* **audible-api:** :bug: this is a string for now ([131be6f](https://github.com/djdembeck/audnexus/commit/131be6f519b75ab3d6d2d7d0f54a71477d05ba5a))
* **audible-api:** :bug: use trim to cleanup white space and \n from description ([31e93b8](https://github.com/djdembeck/audnexus/commit/31e93b84933a88842cd7f57d8f0a69135157898e))
* **chapters:** :ambulance: fix typo for startOffsetSec ([3e68ef4](https://github.com/djdembeck/audnexus/commit/3e68ef4d7dfc9c7d42c52a0f3a37e9589d7fe428))
* **chapters:** :goal_net: throw error if no env vars ([f4f8085](https://github.com/djdembeck/audnexus/commit/f4f80857b0b97b535ed8260fdb8a2edb0589c8f7))
* **schema:** :pencil2: fix mispelling ([e269bb4](https://github.com/djdembeck/audnexus/commit/e269bb41fff69201e0aa3f814e8ccf5b103740ba))
* **scraper:** :bug: only LOG if not 404, not only return ([ae64436](https://github.com/djdembeck/audnexus/commit/ae64436cf30ef43e6c88b028669bb3195b3d496e))
* **stitcher:** :ambulance: Fix series names ([f68c664](https://github.com/djdembeck/audnexus/commit/f68c66407416970bda0f3b69be8576ce13e39063))


* **schema:** change series' names ([50d4423](https://github.com/djdembeck/audnexus/commit/50d442377d909a05f5208a266fb15a31abfccdfc))
