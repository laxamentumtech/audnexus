# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.3.0-0](https://github.com/djdembeck/audnexus/compare/v0.2.0...v0.3.0-0) (2021-10-03)

### ⚠ BREAKING CHANGES

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


### ⚠ BREAKING CHANGES

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
