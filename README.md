<p align="center">
  <img src="https://raw.githubusercontent.com/laxamentumtech/audnexus/assets/logos/logo-horizontal.png" alt="Audnexus logo" width="480">
</p>

# audnexus

[![CI](https://github.com/laxamentumtech/audnexus/actions/workflows/ci.yml/badge.svg)](https://github.com/laxamentumtech/audnexus/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/laxamentumtech/audnexus.svg)](LICENSE)

> **Looking for audiobook metadata?** [AudiobookDB](https://audiobookdb.org) is our community-maintained successor, with separate books and releases, moderated contributions, and search. New projects should start there. Audnexus remains online and maintained.

Audnexus is an HTTP API that combines audiobook metadata from Audible's API and product pages into consistent records. It is for self-hosters who need a metadata endpoint for a media server, and for developers building metadata-provider plugins. A client can retrieve the data it needs in one or two API calls. MongoDB stores records, and Redis can cache responses. Optional history records metadata and artwork changes as revisions.

_Nexus, noun: a connection or series of connections linking two or more things._

We started audnexus because there was no single open source of audiobook metadata, and some community-curated sources closed their APIs. We built it as an interim provider and a future seeder for a community-driven database.

## Contents

- [Quick start](#quick-start)
- [API](#api)
- [Deployment](#deployment)
  - [Build an image from source](#build-an-image-from-source)
  - [Coolify](#coolify)
  - [Docker Swarm](#docker-swarm)
- [Configuration](#configuration)
  - [Core settings](#core-settings)
  - [Scheduling and performance](#scheduling-and-performance)
  - [Feature flags and administration](#feature-flags-and-administration)
- [Database indexes and startup readiness](#database-indexes-and-startup-readiness)
- [Redis durability and sizing](#redis-durability-and-sizing)
- [Book history](#book-history)
- [Troubleshooting](#troubleshooting)
- [Development and tests](#development-and-tests)
- [Releases](#releases)
- [Built with](#built-with)
- [Contributing](#contributing)
- [Author](#author)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## Quick start

You need Git, Docker with Compose, and `curl`. Create `/mnt/docker/mongo/data` on the Docker host and make it writable by the MongoDB container. Alternatively, change the bind mount in [`docker-compose.develop.yml`](docker-compose.develop.yml). This directory holds the database.

Clone the repository and start the stack:

```sh
git clone https://github.com/laxamentumtech/audnexus.git
cd audnexus
docker compose -f docker-compose.develop.yml up -d
```

The stack starts the API, worker, MongoDB, and separate control and cache Redis services. It publishes the API on port 3000. The bundled MongoDB image is pinned to `mongo:7.0.45`. The Compose file defaults to the mutable `ghcr.io/laxamentumtech/audnexus:develop` image for this quick start. For production, use an immutable release tag or digest instead. See [Docker Swarm](#docker-swarm).

Wait for startup, then check health and request a book:

```sh
curl -f http://localhost:3000/health
curl -f http://localhost:3000/books/B08G9PRS1K
```

The health response has `"status":"healthy"`, with `server`, `database`, and `redis` checks set to `true`. The book response is a JSON record with ASIN `B08G9PRS1K` and title `Project Hail Mary`. The first request needs access to Audible, and availability can vary by region. Once the endpoint responds, point your media server or plugin at `http://<host>:3000`.

Audnexus prepares its database, collection validators, and required indexes at startup. It also creates the update schedules automatically. Index builds can delay readiness on an existing database. See [startup readiness](#database-indexes-and-startup-readiness) if the API is not ready yet.

## API

The [API reference](https://audnex.us/) describes book, author, chapter, search, history, artwork, health, and metrics endpoints. It also lists supported regions and request parameters. The [OpenAPI source](docs/spec/audnexus.yaml) is in this repository.

Typed errors and rate-limit errors use an `error` object with a code, message, and optional details. Some routes return their own error shapes. A rate-limit response, for example, is:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit reached. Please try again later.",
    "details": null
  }
}
```

| Code | HTTP status | Meaning |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | The request is invalid. |
| `CONTENT_TYPE_MISMATCH` | 400 | The item has a different content type from the one requested. |
| `NOT_FOUND` | 404 | The requested resource was not found. |
| `REGION_UNAVAILABLE` | 404 | The item is unavailable in the requested region. |
| `PRODUCT_DELISTED` | 404 | Audible reports that the product is delisted. |
| `CONFLICT` | 409 | A concurrent or contradictory state prevents the operation. |
| `VALIDATION_ERROR` | 422 | Schema validation failed. |
| `RATE_LIMIT_EXCEEDED` | 429 | The request rate limit was reached. |

The `details` field can be omitted or `null`. Other status-bearing errors can use their numeric status as the error code.

## Deployment

MongoDB is required for every deployment. Redis is optional for an API-only deployment, but the worker and scheduled updates require `REDIS_URL`. The API uses an in-process rate limiter without control Redis. Chapter requests require registered Audible device credentials: `ADP_TOKEN` and `PRIVATE_KEY`. See the [Audible registration guide](https://audible.readthedocs.io/en/latest/auth/register.html).

### Build an image from source

From the repository root, build the image with the default [`Dockerfile`](Dockerfile):

```sh
docker build -t audnexus .
```

For a local Compose deployment, set `AUDNEXUS_IMAGE=audnexus` so the stack uses that image. Use a release tag or digest for production.

### Coolify

1. Create an application from the Git repository and select a branch.
2. Configure `MONGODB_URI` and any settings you need from [Configuration](#configuration). Use a reachable MongoDB service with persistent storage.
3. Build with the repository's Dockerfile. Set the application port to `3000` and the health check to `/health`.
4. For scheduled updates, run a separate worker service from the same image with `bun run worker` as its start command. Give it the same MongoDB and Redis settings as the API, including `REDIS_URL`.

Use a separate cache Redis for `REDIS_CACHE_URL` if you enable cache eviction. The API can run without Redis, but the worker cannot.

For optional automatic deployment, add the Coolify webhook URL as the GitHub secret `COOLIFY_WEBHOOK`. Create a Coolify API token with Deploy permission and add it as `COOLIFY_TOKEN`. The [Coolify workflow](.github/workflows/deploy-coolify.yml) calls the webhook after a successful current `main` CI run with a successful image build. Coolify then builds from its connected repository and branch. The workflow does not move image tags.

### Docker Swarm

The production [`docker-compose.yml`](docker-compose.yml) runs the API, worker, MongoDB, two Redis services, and Traefik. It defaults to 15 API replicas. Adjust that count for your deployment. You need an initialized Docker Swarm and a writable `/mnt/docker/mongo/data` on the node running MongoDB. Plan placement and persistent storage for that node-local bind mount.

**Do not enable `BOOK_HISTORY_ENABLED=true` against the bundled MongoDB service.** It is standalone, not a replica set, so the API and worker will fail at boot. Point `MONGODB_URI` to a transaction-capable replica set first.

The durable Redis volume is node-local too. Label exactly one Swarm node before deploying. Replace `NODE` with the name of the node that will hold `redis-data`:

```sh
docker node update --label-add audnexus-redis=true NODE
```

With no labeled node, Redis stays pending. A second labeled node can cause a reschedule onto an empty volume and loss of queue and rate-limit state. Before moving the label, restore or migrate the existing volume to the new node.

Set and export `AUDNEXUS_IMAGE`, `TRAEFIK_DOMAIN`, and `TRAEFIK_EMAIL` in the deployment shell. Use a fully qualified immutable release version tag or SHA-256 digest for `AUDNEXUS_IMAGE`. Never use `:latest`, `:develop`, an untagged repository, or a bare version such as `v1.15.0` for production. The Compose file requires a nonempty image reference but does not prove it is immutable.

From a checkout with Bun installed, check the reference's form before deploying:

```sh
bun scripts/validate-image-reference.ts "$AUDNEXUS_IMAGE"
```

The validator accepts fully qualified version tags and SHA-256 digest pins. It cannot prove that a tag points to the release you intended. Deploy from a Swarm manager:

```sh
docker stack deploy -c docker-compose.yml audnexus
```

After deployment, verify that the running image digest matches the release you selected.

The stack publishes MongoDB and control Redis ports as well as the API and Traefik ports. Restrict access to the database ports for your environment. Swarm starts services in parallel, so its health checks and restart policies handle dependencies that are not ready yet.

## Configuration

These are application defaults unless noted otherwise. Set them on each process that needs them. The bundled Compose files pass only the variables listed under each service, so add other settings to the relevant service if you need them. Both Compose files set `MAX_REQUESTS` to `300` by default, rather than the application default of `100`.

### Core settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Required | MongoDB connection URI, such as `mongodb://localhost:27017/audnexus`. The application always uses the `audnexus` database. |
| `DB_INDEX_MODE` | `auto` | Create missing required indexes at startup, or use `verify` to require them without creating indexes. |
| `DB_INDEX_BUILD_WAIT_MS` | `1800000` | Maximum wait in milliseconds for each required index build. |
| `REDIS_URL` | Unset | Control Redis for BullMQ and shared rate limiting. Required by the worker. Use `noeviction`. |
| `REDIS_CACHE_URL` | Falls back to `REDIS_URL` | Document-cache Redis. Use a separate server before enabling cache eviction. |
| `REDIS_CACHE_TTL_SECONDS` | `432000` | Positive integer cache TTL in seconds, applied on inserts and overwrites. |
| `HOST` | `0.0.0.0` | API listen address. |
| `PORT` | `3000` | API listen port. |
| `LOG_LEVEL` | `info` | Log level: `trace`, `debug`, `info`, `warn`, `error`, or `fatal`. |
| `TRUSTED_PROXIES` | Unset | Comma-separated trusted proxy IP addresses or CIDR ranges. |
| `DEFAULT_REGION` | `us` | Default region for batch processing. |
| `ADP_TOKEN`, `PRIVATE_KEY` | Unset | Registered Audible device credentials for chapters. |
| `MAX_REQUESTS` | `100` | Maximum requests per minute per source. Compose defaults to `300`. |

### Scheduling and performance

| Variable | Default | Purpose |
| --- | --- | --- |
| `UPDATE_INTERVAL` | `30` | Days between book and author update passes. `0` disables those schedules. |
| `UPDATE_INTERVAL_CHAPTERS` | `30` | Days between chapter update passes. `0` disables the chapter schedule. |
| `UPDATE_THRESHOLD` | `7` | Minimum age in days before checking a document for updates again. |
| `RATE_LIMIT_COOLDOWN_BASE_MS` | `120000` | Initial inter-item cooldown after consecutive rate-limit responses. |
| `RATE_LIMIT_COOLDOWN_MAX_MS` | `7200000` | Maximum adaptive cooldown in milliseconds. |
| `HTTP_MAX_SOCKETS` | `50` | Maximum pooled HTTP sockets. Values above `50` are clamped. |
| `HTTP_TIMEOUT_MS` | `30000` | HTTP request timeout in milliseconds. |
| `SCHEDULER_CONCURRENCY` | `5` | Maximum concurrent scheduler operations. |
| `SCHEDULER_MAX_PER_REGION` | `5` | Maximum per-region concurrency in batch processing. |
| `SCHEDULER_BATCH_SIZE` | `1000` | Documents per pagination batch, capped at `10000`. |
| `SCHEDULER_ITEM_TIMEOUT_MS` | `120000` | Per-item wait deadline in milliseconds. `0` disables it. A late handler can continue and its writes can still land. |
| `SCHEDULER_MAX_ITEMS` | `0` | Maximum documents visited per pass. `0` means unlimited. |
| `JITTER_MS` | `0-5000` | Random pacing range in milliseconds, as `min-max` or a bare maximum. |
| `AUDIBLE_BATCH_SIZE` | `1` | Ratings-backfill batch size. Values from `2` to `50` use Audible's undocumented multi-ASIN endpoint for same-region books. Stubs and failed chunks fall back to individual requests. |

The worker creates or refreshes the enabled schedules and enqueues startup passes where needed. You do not need to set up the scheduler manually.

### Feature flags and administration

The general Boolean flags accept `true` in any case or `1` for true. `BOOK_HISTORY_ENABLED` is stricter: use lowercase `true` or `false`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `USE_PARALLEL_SCHEDULER` | `false` | Enable parallel updates. This is high risk and requires testing. |
| `USE_SORTED_KEYS` | `false` | Sort object keys, with `O(n log n)` overhead. |
| `CIRCUIT_BREAKER_ENABLED` | `true` | Enable the circuit breaker for external API calls. |
| `BOOK_HISTORY_ENABLED` | `false` | Record book metadata and artwork history. Requires a transaction-capable MongoDB replica set. |
| `METRICS_ENABLED` | `false` | Enable performance metrics and `/metrics`. |
| `METRICS_AUTH_TOKEN` | Unset | Token accepted in the `x-metrics-token` header. |
| `METRICS_ALLOWED_IPS` | Unset | Comma-separated IP addresses or CIDR ranges allowed to access metrics. |
| `UPDATE_STATS` | `0` | Set to `1` to enable the ratings-backfill admin route. |
| `ADMIN_TOKEN` | Unset | Token for `/books/backfill-ratings`, sent in the `x-admin-token` header. The route also requires `UPDATE_STATS=1` and control Redis. |

If metrics are enabled without a token or IP allowlist, `/metrics` is publicly accessible. Configure at least one access control for a deployment exposed to other users.

Earlier documentation listed `MAX_CONCURRENT_REQUESTS`, `USE_CONNECTION_POOLING`, and `USE_COMPACT_JSON` as tuning controls. The current application reads these values into configuration but has no runtime consumers for them. Use `HTTP_MAX_SOCKETS` to configure pooled sockets.

## Database indexes and startup readiness

The API and worker prepare the shared schema and index catalog before they become ready. With the default `DB_INDEX_MODE=auto`, startup creates missing indexes and waits for required builds. This applies to existing volumes and external databases as well as new installations. Startup adopts equivalent existing indexes even if their names differ. ASIN/region indexes remain non-unique and do not deduplicate old records.

Set `DB_INDEX_MODE=verify` if a deployment job owns index creation. Startup then checks for completed matching indexes without issuing index DDL. It still prepares collection schemas, so it needs `createCollection` and `collMod` privileges.

`DB_INDEX_BUILD_WAIT_MS` limits the wait for each index, not the whole startup. Indexes build sequentially, so total startup can take longer. The bundled Compose health-check grace defaults to `30m`. Increase `STARTUP_GRACE_PERIOD` for the full build time, or optionally pre-apply the catalog for a large database before rolling out the same application version.

After building the project and setting `MONGODB_URI`, the database-only commands are:

```sh
bun dist/indexes.js check
bun dist/indexes.js apply
```

`check` is read-only and works with read-only credentials. It does not create collections, prepare schemas, connect to Redis, or start jobs. `apply` prepares schemas and indexes without starting the API or worker. Both target the `audnexus` database. The commands are optional for normal startup.

Automatic index changes are additive. The application reports unknown, redundant, and legacy indexes but never drops them automatically. Same-name conflicts and changes to uniqueness, partial filters, collation, TTL, or text indexes require an explicit migration. MongoDB permits only one text index per collection, so a changed text index cannot use a blind build-new/drop-old sequence. `/health` checks service connectivity, not ongoing index drift.

## Redis durability and sizing

The bundled stacks separate control Redis from the disposable document cache. Control Redis holds BullMQ jobs, schedules, and shared rate-limit state. It persists `/data`, enables append-only file (AOF) persistence with `appendfsync everysec`, and uses `noeviction`. Cache Redis uses `allkeys-lfu` without AOF or RDB persistence. A cache restart can require repopulation, but must not remove control state. Logical databases on one Redis server do not isolate memory pressure or eviction.

For an existing single-Redis deployment, deploy code that supports the split first. Set `REDIS_CACHE_URL` to a separate private cache. Verify that document callers have moved before you reduce the original Redis budget. Do not enable eviction on the old shared instance or flush its database. Before you roll back to code that ignores `REDIS_CACHE_URL`, restore a compatible shared-Redis budget.

If AOF is disabled on an existing control Redis, it is not safe to add `appendonly yes` and recreate the container as a migration. Quiesce writers and preserve a recoverable snapshot. Enable AOF on the running instance, then wait for a successful rewrite and fsync. Verify the data on the intended volume before you replace the container. AOF every second can still lose recent writes. Keep tested backups.

The Compose files expose these sizing and logging settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `REDIS_CONTROL_MAXMEMORY` | `128mb` | Control-state budget, not an eviction allowance. |
| `REDIS_CACHE_MAXMEMORY` | `512mb` | Disposable cache budget. |
| `MONGO_WIREDTIGER_CACHE_GB` | `1.0` | WiredTiger cache size, not total MongoDB memory. |
| `STARTUP_GRACE_PERIOD` | `30m` | Health-check grace for startup and index builds. |
| `CONTAINER_LOG_MAX_SIZE` | `10m` | Maximum size of each rotated container log. |
| `CONTAINER_LOG_MAX_FILES` | `3` | Number of retained log files per container. |

These values are not container memory limits or capacity guarantees. Allow for clients, allocators, MongoDB memory outside the cache, index builds, and Redis fork and copy-on-write peaks. Do not count swap as sustainable capacity. Monitor disk space for database growth and RDB/AOF rewrites.

`MONGO_IMAGE`, `REDIS_IMAGE`, and `REDIS_CACHE_IMAGE` override the bundled database image pins. Use immutable references and validate database upgrades separately from memory tuning. An application dependency update does not upgrade an external managed database. Do not roll back the application image just to change resource settings.

## Book history

History records accepted metadata and artwork changes as revisions. It is disabled by default. Set `BOOK_HISTORY_ENABLED=true` only after `MONGODB_URI` points to a transaction-capable replica set. Startup prepares the required indexes automatically. Recording does not store image bytes, and it does not track ratings.

To seed legacy artwork, build the project and set `MONGODB_URI`. These commands connect directly to MongoDB without starting the API, Redis, or worker:

```sh
bun dist/history.js audit
bun dist/history.js seed
bun dist/history.js status
```

`audit` reports identity exceptions and a summary of identity and image counts. `seed` requires a transaction-capable replica set and prepared indexes. It commits each row and its checkpoint together and resumes after interruption. It does nothing if you repeat a completed run. `status` reports progress and retained history coverage.

To start a new scan instead of resuming an in-flight run, use:

```sh
bun dist/history.js seed --restart
```

This resets scan progress and its captured bound, not history data. `bun dist/history.js prepare` is an optional way to prepare schemas and the full index catalog ahead of startup. Like `indexes apply`, it creates missing indexes even when `DB_INDEX_MODE=verify`. Inside the deployed image, run the same `bun dist/history.js` commands with the container's configured `MONGODB_URI`.

## Troubleshooting

- If the API is not listening yet, check the container logs and allow time for the required index builds. Confirm that the MongoDB bind mount exists and is writable.
- If `/health` returns `503`, check MongoDB and each configured Redis role. The response reports their connectivity.
- If updates are not running, confirm that the worker is running and has `REDIS_URL`. The API can serve requests without it, but cannot schedule updates without control Redis.
- If history-enabled startup fails, verify that MongoDB is a transaction-capable replica set and that required history indexes are ready. The bundled standalone MongoDB cannot pass this check.
- If startup reports an index conflict, inspect the report before making a migration. Startup does not replace or drop the conflicting index.

## Development and tests

Install [Bun](https://bun.sh/) 1.3.9 or newer. CI uses Bun 1.4.4. Provide a reachable MongoDB instance and set `MONGODB_URI`. Only the worker and scheduled jobs need Redis.

```sh
bun install
bun run build
MONGODB_URI=mongodb://localhost:27017/audnexus bun run serve
```

For a build followed by debug watch mode, use `bun run debug` with `MONGODB_URI` set. Package imports resolve to `dist`, so rebuild after changing other TypeScript source files. To run the worker, build first and start `bun run worker` with both `MONGODB_URI` and `REDIS_URL` set.

```sh
bun run test
bun run test:indexes
RUN_LIVE_TESTS=true bun run test:live
```

The default test command writes coverage to `coverage/`. The index integration tests start a MongoDB replica set in Docker. Live tests contact Audible and are disabled unless `RUN_LIVE_TESTS=true`. Chapter live tests also need `ADP_TOKEN` and `PRIVATE_KEY`. See the [live test guide](tests/live/README.md). For history integration tests, use `bun run test:history`.

To generate HTML from the checked-in OpenAPI source, run `bun run build-docs`. This writes `docs/index.html`. The checked-in HTML and spec carry an older version label, so use the [live API reference](https://audnex.us/) or a release's documentation asset for published docs.

## Releases

A qualifying `main` push, including a normal `develop` to `main` promotion with application changes, starts the Release workflow. Changes limited to root Markdown files or `.github` do not trigger it. To run it deliberately, choose **Actions > Release > Run workflow** on `main`. Leave the version empty and the bump at `auto` for automatic selection, or supply an override. No package version commit, preparation PR, or merge-back is required.

The workflow reserves a source and version, tests the native build, and publishes the matching image and documentation. A release stays a draft until those outputs complete. An existing tag alone does not mean publication finished. Retries reuse the reservation and verify image and documentation identity rather than overwrite conflicting artifacts. The Annalist app fills the release notes.

The image records `VERSION` and `GIT_COMMIT` as OCI metadata. The version in `package.json` is package metadata, not the running release label. Stamped documentation uses the selected release version, `dev-<SHA>` for an untagged source, or `dev` without a source. Running `build-docs` alone renders the version currently in the spec.

Each release includes an immutable `index.html` asset labeled with its source, version, and SHA-256. Use it for the documentation of that release. Develop and stale builds do not replace production Pages. An old-source retry completes its release artifacts without rolling Pages back. See the [Release workflow](.github/workflows/release.yml), [docs workflow](.github/workflows/deploy-docs.yml), and [changelog](CHANGELOG.md).

## Built with

Audnexus uses [Fastify](https://www.fastify.io/) for HTTP, [Bun](https://bun.sh/) as its runtime, [MongoDB](https://www.mongodb.com/) and [Papr](https://github.com/plexinc/papr) for data storage, and [Redis](https://redis.io/) for control state and optional caching. [BullMQ](https://bullmq.io/) runs the update worker.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [CHANGELOG.md](CHANGELOG.md) for changes.

## Author

[@djdembeck](https://github.com/djdembeck) created audnexus and did the initial work.

## Acknowledgements

- Thanks to [mkb79](https://github.com/mkb79) and the [Audible](https://github.com/mkb79/Audible) project for a starting point.
- Thanks to [macr0dev](https://github.com/macr0dev) for introducing us to scraping.
- Thanks to [seanap](https://github.com/seanap) for passionately standardizing audiobook organization.
- Thanks to [Bookcamp](https://www.bookcamp.app/) for giving us a reason to have great audiobook data.

## License

[GNU GPL v3 (GPL-3.0)](LICENSE).
