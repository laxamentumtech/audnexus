<h3 align="center">audnexus</h3>

<div align="center">

[![Status](https://status.audnex.us/api/badge/4/status)](https://status.audnex.us)
[![GitHub Issues](https://img.shields.io/github/issues/djdembeck/audnexus.svg)](https://github.com/djdembeck/audnexus/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/djdembeck/audnexus.svg)](https://github.com/djdembeck/audnexus/pulls)
[![License](https://img.shields.io/badge/license-GNUGPL-blue.svg)](/LICENSE)
[![CodeFactor Grade](https://img.shields.io/codefactor/grade/github/djdembeck/audnexus)](https://www.codefactor.io/repository/github/djdembeck/audnexus)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=laxamentumtech_audnexus&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=laxamentumtech_audnexus)

</div>

> **Looking for audiobook metadata?** Check out [AudiobookDB](https://audiobookdb.org) — our community-maintained audiobook metadata database and the successor to this API: proper book/release separation, moderated community contributions, and fast search. New projects should start there; audnexus remains online and maintained.

---

<p align="center"> An audiobook data aggregation API, combining multiple sources of data into one, consistent source.
    <br> 
</p>

## 📝 Table of Contents

- [About](#about)
- [Getting Started](#getting_started)
- [Running the tests](#tests)
- [Error Handling](#error_handling)
- [Usage](#usage)
- [Deployment](#deployment)
- [Built Using](#built_using)
- [Contributing](../CONTRIBUTING.md)
- [Authors](#authors)
- [Acknowledgments](#acknowledgement)

## 🧐 About <a name = "about"></a>

_Nexus - noun: a connection or series of connections linking two or more things._

Looking around for audiobook metadata, we realized there's no solid (or open) single source of truth. Further, some solutions had community curated data, only to close their API. As such, this project has been created to enable development to include multiple sources of audiobook content in one response.

This project also makes integration into existing media servers very streamlined. Since all data can be returned with 1-2 API calls, there's little to no overhead processing on the client side. This enables rapid development of stable client plugins. Audnexus serves as a provider during the interim of waiting for a community driven audiobook database, at which time audnexus will be a seeder for such a database.

## 🏁 Getting Started <a name = "getting_started"></a>

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See [deployment](#deployment) for notes on how to deploy the project on a live system.

### Prerequisites

- There are 3 ways to deploy this project:
  - [Coolify](https://coolify.io) - Self-hosted PaaS platform with automatic deployments from Git
  - [Docker Swarm](https://docs.docker.com/engine/swarm/swarm-tutorial/) - Docker Compose stack with Traefik reverse proxy
  - Directly, via `bun run`
    - MongoDB 6.0+ recommended (driver v7); replica set required for book history
    - [Bun](https://bun.sh/) 1.3.9 or greater
    - Redis
  - Registered Audible device keys, `ADP_TOKEN` and `PRIVATE_KEY`, for chapters. You will need Python and `audible` for this. [More on that here](https://audible.readthedocs.io/en/latest/auth/register.html)

### Installing locally

- Install Mongo and Redis on your system
- Install [Bun](https://bun.sh/)
- `bun install` from project directory to get dependencies

**Required environment variables:**

- `MONGODB_URI`: MongoDB connection URL (e.g., `mongodb://localhost:27017/audnexus`)

**Optional environment variables:**

- Set `ADP_TOKEN` and `PRIVATE_KEY` for the chapters endpoint
- Configure other optional variables as described in the [Deployment](#deployment) section

Then start the server:

```bash
bun run watch-debug
```

Test an API call with

```
http://localhost:3000/books/${ASIN}
```

## 🔧 Running the tests <a name = "tests"></a>

Tests for this project use Bun's built-in test runner. Tests can be done locally in a dev environment:

- `bun run test`

To generate a coverage report, run `bun run test`; it is written to the `coverage/` directory under the project directory.

## ⚠️ Error Handling <a name = "error_handling"></a>

The API returns structured error responses with error codes, HTTP status codes, and detailed messages.

### Error Response Format

All errors follow this structure. The `details` field is optional and may be omitted or set to `null`:

```json
{
	"error": {
		"code": "ERROR_CODE",
		"message": "Human-readable error message",
		"details": null
	}
}
```

### Error Codes

| Code                    | HTTP Status | Description                                                                               |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `CONTENT_TYPE_MISMATCH` | 400         | Content type doesn't match the requested endpoint (e.g., podcast ASIN on /books endpoint) |
| `VALIDATION_ERROR`      | 422         | Schema validation failed                                                                  |
| `REGION_UNAVAILABLE`    | 404         | Content not available in the requested region                                             |
| `NOT_FOUND`             | 404         | Generic not found error                                                                   |
| `BAD_REQUEST`           | 400         | Bad request                                                                               |
| `RATE_LIMIT_EXCEEDED`   | 429         | Too many requests — client has exceeded allowed request rate                              |

### Example Error Responses

**Content Type Mismatch (Podcast on Book endpoint):**

```json
{
	"error": {
		"code": "CONTENT_TYPE_MISMATCH",
		"message": "Item is a podcast, not a book. ASIN: B017V4U2VQ",
		"details": {
			"asin": "B017V4U2VQ",
			"requestedType": "book",
			"actualType": "PodcastParent"
		}
	}
}
```

**Region Unavailable:**

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

**Validation Error:**

```json
{
	"error": {
		"code": "VALIDATION_ERROR",
		"message": "Schema validation failed for request",
		"details": {
			"field": "asin",
			"issue": "Invalid ASIN format"
		}
	}
}
```

**Not Found:**

```json
{
	"error": {
		"code": "NOT_FOUND",
		"message": "Book with ASIN B12345 not found",
		"details": {
			"asin": "B12345",
			"endpoint": "/books"
		}
	}
}
```

**Bad Request:**

```json
{
	"error": {
		"code": "BAD_REQUEST",
		"message": "Invalid request parameters",
		"details": {
			"parameter": "region",
			"issue": "Unsupported region 'xx'"
		}
	}
}
```

**Rate Limit Exceeded:**

```json
{
	"error": {
		"code": "RATE_LIMIT_EXCEEDED",
		"message": "Too many requests — client has exceeded allowed request rate",
		"details": {
			"retryAfterSeconds": 60
		}
	}
}
```

## 🎈 Usage <a name="usage"></a>

API usage documentation can be read here: https://audnex.us/

Pre-rendered HTML documentation is also included in docs/index.html.

HTML can be re-generated from the spec, using:

```bash
bun run build-docs
```

### History operations

The book history feature (stored metadata/artwork change tracking) is gated
off by default. When enabled, the database needs one preparation step and a
one-time legacy artwork seed. The DB-only operational CLI runs directly
against `MONGODB_URI` — it starts no server, Redis, or queue:

```bash
# Create the named history indexes (idempotent; a same-name conflicting
# definition fails and is never replaced)
bun src/history.ts prepare

# Report current-book readiness issues: one NDJSON row per book with an
# identity exception (non-ObjectId _id, invalid ASIN, missing/invalid
# region), closed by a summary row with the identity outcome counts
# (trusted / duplicate / ambiguous), the image counts (recognized,
# unparsed, none), and the truncated-walk count when a bounded `_id` walk
# stopped early
bun src/history.ts audit

# One-time per-row legacy artwork seed. Each row commits in its own
# majority-write transaction (row work and checkpoint advance together), so
# an interrupted run resumes from the last committed row. Re-running a
# completed seed is a no-op.
bun src/history.ts seed

# Supersede an in-flight seed run: atomically starts a new run (new run
# id) and restarts the scan from the top. History data is never touched;
# only scan progress and the captured row bound reset.
bun src/history.ts seed --restart

# Report the seed state, in-flight run position, and current retained
# history coverage (baselined states, gallery assets, identity exceptions)
bun src/history.ts status
```

In the deployed container image (which ships `dist/`, not the source tree)
run the same commands as `node dist/history.js <command>`.

Index creation is CLI-only. With `BOOK_HISTORY_ENABLED=true`, the server and
worker fail closed at startup if the required history indexes (and a
transaction-capable replica set) are not present — `prepare` is therefore a
prerequisite of enabling history in any deployment.

### Release identity

One normal `develop` → `main` merge-commit promotion runs **Release** automatically. For a deliberate run, use **Actions → Release → Run workflow** on main; leave version/bump empty for automatic selection, or choose a version/bump override. The same body freezes the event source, creates one immutable version reservation, tests the native build, publishes a source/version-checked image, and explicitly dispatches the docs build for that exact release (dispatched from `main`, because the Pages environment only admits the `main` branch; the release identity travels in the dispatch inputs). No package.json version commit, preparation PR, or merge-back is needed.

The release image consumes VERSION and GIT_COMMIT as OCI metadata. The package.json version remains package metadata, not the running application's release label. Published OpenAPI docs retain this project's release-label semantics: explicit/tagged builds use the selected release version; untagged builds use `dev-<SHA>` and an unconfigured local build uses `dev`. The docs workflow never copies package.json's frozen version. Release dispatches verify the matching source, wait for the identified docs run, and verify the immutable release HTML asset before publishing; develop/stale runs build artifacts without replacing production Pages. A release-dispatched docs build also stores the actual generated `docs/index.html` as an immutable `index.html` release asset labeled with its source, version, and SHA-256. That named-version HTML remains the authoritative documentation for the release even after production Pages moves on to a newer main source. Standalone tag/dev docs builds still derive their own tag or `dev-<SHA>` identity and never write release assets.

Retries reuse the exact source's reservation and validate immutable image identity/digest instead of overwriting existing bytes. An existing `index.html` asset is accepted only when its recorded source/version and actual byte digest match the build being retried; an unlabeled asset is accepted only when its bytes exactly equal that build and is then labeled; a conflicting asset fails closed and nothing is overwritten. An existing tag is not completion. The source-bound release stays a draft until image/docs outputs finish, and the existing Annalist App fills notes; deploy its shared previous-published-ancestor fix before cutover. Because production Pages admits only the current main source, an old-source retry completes its immutable named docs and image outputs without claiming or performing a Pages rollback; Pages may intentionally remain on the newer source. CI retains branch/PR/SHA previews only; production consumers use the release tag/digest rather than a mutable latest alias. The example production compose does not pin an image itself: for the immutable `AUDNEXUS_IMAGE` tag/digest requirement, see the Docker Swarm Deployment section below.

Main branch protection is unchanged; develop retains required checks/conflict detection without requiring an update after every unrelated merge. Native GitHub `queue: max` retains waiting manual runs across later automatic events. Current actionlint v1.7.12 rejects that documented key ([upstream parser gap](https://github.com/rhysd/actionlint/issues/657)); do not remove queue retention or hide unrelated findings to accommodate it.

## 🚀 Deployment <a name = "deployment"></a>

### Coolify Deployment

Audnexus can be deployed to Coolify, a self-hosted open-source alternative to Vercel.

**Setup Steps:**

1. **Connect repository to Coolify:**
   - In Coolify, create a new application
   - Select "Git" and connect your GitHub repository
   - Select the branch (e.g., `main` or `develop`)

2. **Configure environment variables:**
   - Set up the following environment variables in Coolify. This list is the canonical reference for the app's environment variables and applies to every deployment method:

   **Core Configuration:**
   - `MONGODB_URI`: MongoDB connection URL (e.g., `mongodb://mongo:27017/audnexus`) [required]
   - `REDIS_URL`: Durable control Redis for BullMQ and shared rate limiting (e.g., `redis://redis:6379`). Required for workers; optional for an API-only deployment. Keep this instance on `noeviction`.
   - `REDIS_CACHE_URL`: Disposable document-cache Redis. Defaults to `REDIS_URL` for existing external deployments; set a separate instance before enabling cache eviction. Different logical database numbers on one Redis server do not isolate eviction or memory pressure.
   - `REDIS_CACHE_TTL_SECONDS`: Positive integer document-cache TTL (default: `432000`, five days), applied atomically on inserts and overwrites.
   - `HOST`: Server host address (default: `0.0.0.0`)
   - `PORT`: Server port (default: `3000`)
   - `LOG_LEVEL`: Log level - `trace`, `debug`, `info`, `warn`, `error`, `fatal` (default: `info`)
   - `TRUSTED_PROXIES`: Comma-separated list of trusted proxy IPs/CIDR ranges (optional)
   - `DEFAULT_REGION`: Default region for batch processing (default: `us`)

   **Audible API Configuration:**
   - `ADP_TOKEN`: Audible ADP_TOKEN value (optional, for chapters endpoint)
   - `PRIVATE_KEY`: Audible PRIVATE_KEY value (optional, for chapters endpoint)

   **Rate Limiting:**
   - `MAX_REQUESTS`: Max requests per minute per source (default: 100)
   - `RATE_LIMIT_COOLDOWN_BASE_MS`: Base inter-item cooldown (in ms) applied after the first consecutive rate-limit response (default: 120000)
   - `RATE_LIMIT_COOLDOWN_MAX_MS`: Ceiling (in ms) for the adaptive inter-item cooldown while rate-limited (default: 7200000)

   **Update Scheduling:**
   - `UPDATE_INTERVAL`: Update interval in days (default: 30). A startup pass is enqueued by the worker.
   - `UPDATE_INTERVAL_CHAPTERS`: Chapter update interval in days (default: 30; `0` disables chapter scheduling).
   - `UPDATE_THRESHOLD`: Minimum days before checking updates again (default: 7)

   **Performance Tuning:**
   - `MAX_CONCURRENT_REQUESTS`: HTTP connection pool size for concurrent API calls (default: 50)
   - `SCHEDULER_CONCURRENCY`: Max concurrent scheduler operations (default: 5)
   - `SCHEDULER_MAX_PER_REGION`: Hard cap for max per-region concurrency in batch processing (default: 5)
   - `HTTP_MAX_SOCKETS`: Maximum HTTP sockets (hard limit: 50, default: 50) - values above 50 will be clamped to 50
   - `HTTP_TIMEOUT_MS`: HTTP request timeout in milliseconds (default: 30000)
   - `SCHEDULER_BATCH_SIZE`: Documents per batch when paginating over books/authors/chapters (default: 1000, hard cap: 10000)
   - `SCHEDULER_ITEM_TIMEOUT_MS`: Hard deadline for a single scheduler item in milliseconds (default: 120000; `0` disables the guard). Bounds the wait for the handler, not the work itself — a late handler can keep running after the deadline elapses, and its writes can still land.
   - `SCHEDULER_MAX_ITEMS`: Hard cap on documents one pass visits (default: 0 = unlimited)
   - `JITTER_MS`: Randomized pacing wait range in milliseconds for batch workers, as `min-max` or bare `max` (default: `0-5000`)

   **Feature Flags (Boolean - supports `true`, `True`, `TRUE`, `1`):**
   - `USE_PARALLEL_SCHEDULER`: Enable parallel UpdateScheduler (default: `false`) - HIGH RISK, requires testing
   - `USE_CONNECTION_POOLING`: Enable HTTP connection pooling for API calls (default: `true`)
   - `BOOK_HISTORY_ENABLED`: Enable book history tracking (default: `false`). Strict flag: accepts only `true` or `false` — the general boolean-flag guidance above (`1`/`True`/`TRUE`) does NOT apply to it.
   - `USE_COMPACT_JSON`: Use compact JSON format in Redis (default: `true`)
   - `USE_SORTED_KEYS`: Sort object keys in responses (adds O(n log n) overhead, default: `false`)
   - `CIRCUIT_BREAKER_ENABLED`: Enable circuit breaker pattern for external API calls (default: `true`)
   - `METRICS_ENABLED`: Enable performance metrics collection and /metrics endpoint (default: `false`)

   **Metrics Endpoint Security:**
   - `METRICS_AUTH_TOKEN`: Authentication token for /metrics endpoint (optional)
   - `METRICS_ALLOWED_IPS`: Comma-separated list of allowed IPs/CIDR ranges for /metrics (supports CIDR notation, optional)

   **Stats Admin:**
   - `UPDATE_STATS`: Enable stats-updating admin routes (default: `0`)
   - `ADMIN_TOKEN`: Admin token for /books/backfill-ratings endpoint, sent via the `x-admin-token` header (optional; only effective when `UPDATE_STATS=1`)

3. **Configure build and deployment:**
   - Build command: Coolify will automatically use the Dockerfile
   - Port: 3000
   - Health check: Coolify can use the `/health` endpoint

4. **Enable GitHub webhook (optional):**
   - In Coolify, get your webhook URL from the application's "Webhook" section
   - Add `COOLIFY_WEBHOOK` to your GitHub repository secrets with this URL
   - In Coolify, create an API token from "Keys & Tokens" > "API Tokens" (enable "Deploy" permission)
   - Add `COOLIFY_TOKEN` to your GitHub repository secrets with the API token
   - The workflow `.github/workflows/deploy-coolify.yml` runs on `workflow_run` when a `main`-branch CI run in the same repository completes successfully; if that run shipped a fresh image (successful `docker-build` job), it calls the Coolify webhook over HTTP with the API token

**Note:** The webhook simply notifies Coolify, which then performs its own documented build from the connected Git repository/branch (Dockerfile). The workflow never moves image tags. Versioned images are published to GitHub Container Registry (ghcr.io) by the Release workflow; CI's `docker-build` job additionally pushes branch/PR/SHA tags.

5. **Optional: Configure persistent volumes for MongoDB/Redis:**
   - For production, consider using external MongoDB and Redis services
   - Or configure Coolify to use managed databases

**Important:** The audnexus application requires MongoDB and Redis services to run. For production, use Coolify's managed database services or external databases, or deploy the full stack (including MongoDB and Redis containers) using the Docker Compose method in the Docker Swarm section below. Do not proceed with Coolify deployment until you have the `MONGODB_URI` and `REDIS_URL` values ready.

### Docker Swarm Deployment

Once you have Docker Swarm setup, grab the `docker-compose.yml` from this repo, and use it to start the stack. Using something like Portainer for a Swarm GUI will make this much easier.

**Note:** The bundled standalone `mongo:7.0.45` service is single-node and can never satisfy the book history replica-set gate, so enabling `BOOK_HISTORY_ENABLED` against the bundled stack is a guaranteed boot crash by design — point `MONGODB_URI` at a replica set first.

The stack defaults to 15 replicas for the node-server container. Customize this as needed.

#### Redis durability and machine-specific sizing

Both bundled Compose files separate durable queue/rate-limit state (`redis`) from disposable document data (`redis-cache`). Control Redis persists `/data`, enables AOF with `appendfsync everysec`, and uses `noeviction`. Cache Redis uses `allkeys-lfu` with neither AOF nor RDB persistence. API and worker use the same role URLs. A cache restart may require repopulation; it must not remove queue jobs, schedulers, or rate-limit counters.

Compose sizing knobs are independent of application behavior:

| Variable | Default | Purpose |
|---|---|---|
| `REDIS_CONTROL_MAXMEMORY` | `128mb` | Logical control-state budget; never an eviction allowance |
| `REDIS_CACHE_MAXMEMORY` | `512mb` | Disposable cache budget |
| `MONGO_WIREDTIGER_CACHE_GB` | `1.0` | WiredTiger cache, not total MongoDB RSS |
| `CONTAINER_LOG_MAX_SIZE` | `10m` | Maximum size of each rotated container log |
| `CONTAINER_LOG_MAX_FILES` | `3` | Retained log files per container |

`MONGO_IMAGE`, `REDIS_IMAGE`, and `REDIS_CACHE_IMAGE` override the bundled database image pins; use immutable references and validate the selected versions separately from memory tuning.

These are portable defaults, not capacity guarantees or container memory limits. Size each machine for allocator/client overhead, MongoDB non-cache memory, index builds, and Redis fork/copy-on-write persistence peaks without counting swap as sustainable capacity. Keep logs bounded and monitor filesystem space for RDB/AOF rewrite generations as well as database growth.

**Existing single-Redis deployments need an ordered migration.** Deploy routing-compatible code, set `REDIS_CACHE_URL` to a separate private cache, and verify document callers have moved before reducing the original Redis budget. Preserve queue/rate-limit state; never enable eviction on the old shared instance or flush its database. Before rolling back to code that ignores `REDIS_CACHE_URL`, restore a compatible shared-Redis budget first.

For an existing Redis with AOF disabled, merely adding `appendonly yes` and recreating its container is not a safe persistence migration. Quiesce writers, preserve a recoverable snapshot, enable AOF on the running instance, wait for successful rewrite/fsync, and verify the complete persisted data on the intended volume before replacing the container. AOF every second still permits a recent-write loss window; it is not a substitute for tested backups.

Compose database pins and external managed-database versions have separate deployment owners. A repository dependency update does not update an independently managed database. Keep deployment image references immutable, verify the running digest, and separate database upgrades from memory tuning; do not replace a newer application image with an older one to obtain different resource settings.

The app image is supplied by the required `AUDNEXUS_IMAGE` variable — set it to an immutable release version tag (e.g., `ghcr.io/laxamentumtech/audnexus:v1.15.0`) or a digest (e.g., `ghcr.io/laxamentumtech/audnexus@sha256:...`); never use `:latest`. Bare versions like `v1.15.0` are rejected: Docker would resolve them as mutable Docker Hub library names. Compose enforces this with `${AUDNEXUS_IMAGE:?...}`, which refuses to render the file when the variable is unset; before deploying, prove the value is immutable with the preflight validator (it rejects unset/empty values, `:latest`, and untagged repos, and accepts version tags and digest pins):

```sh
bun scripts/validate-image-reference.ts "$AUDNEXUS_IMAGE"
```

**Application Environment Variables:**

Set the full set of application environment variables listed in the [Coolify Deployment](#coolify-deployment) section above — that list is the canonical reference for all deployments. For Swarm, in addition, the compose file requires the following platform-specific variables:

**Traefik Configuration:**

- `TRAEFIK_DOMAIN`: FQDN for the API server
- `TRAEFIK_EMAIL`: Email to register SSL cert with

Once the stack is up, test an API call with

```
https://${TRAEFIK_DOMAIN}/books/${ASIN}
```

### Set up DB indexes to keep item lookups fast and to support searches.

1. Connect to the DB either from inside the mongodb container terminal or a MongoDB Compass/MongoSH session.

2. Switch to the correct DB:

   ```
   use audnexus
   ```

3. Create the recommended indexes:
   ```
   db.authors.createIndex( { asin: 1, region: 1 } )
   ```
   ```
   db.books.createIndex( { asin: 1, region: 1 } )
   ```
   ```
   db.chapters.createIndex( { asin: 1, region: 1 } )
   ```
   ```
   db.authors.createIndex( { name: "text" } )
   ```

## ⛏️ Built Using <a name = "built_using"></a>

- [Fastify](https://www.fastify.io/) - Server Framework
- [MongoDB](https://www.mongodb.com/) - Database
- [Bun](https://bun.sh/) - Server Runtime
- [Papr](https://github.com/plexinc/papr) - Database connection
- [Redis](https://redis.io/) - Cached responses

## ✍️ Authors <a name = "authors"></a>

- [@djdembeck](https://github.com/djdembeck) - Idea & Initial work

## 🎉 Acknowledgements <a name = "acknowledgement"></a>

- Huge thanks to [mkb79](https://github.com/mkb79) and their [audible](https://github.com/mkb79/Audible) project for a great starting point.
- [macr0dev](https://github.com/macr0dev) for introducing us to scraping.
- [seanap](https://github.com/seanap) for passionately standardizing audiobook organization.
- [Bookcamp](https://www.bookcamp.app/) for giving us a reason to have awesome audiobook data.
