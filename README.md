<p align="center">
  <a href="" rel="noopener">
 <img width=200px height=200px src="../assets/logos/logo.png?raw=true" alt="Project logo"></a>
</p>

<h3 align="center">audnexus</h3>

<div align="center">

[![Status](https://status.audnex.us/api/badge/4/status)](https://status.audnex.us)
[![GitHub Issues](https://img.shields.io/github/issues/djdembeck/audnexus.svg)](https://github.com/djdembeck/audnexus/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/djdembeck/audnexus.svg)](https://github.com/djdembeck/audnexus/pulls)
[![License](https://img.shields.io/badge/license-GNUGPL-blue.svg)](/LICENSE)
[![CodeFactor Grade](https://img.shields.io/codefactor/grade/github/djdembeck/audnexus)](https://www.codefactor.io/repository/github/djdembeck/audnexus)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=laxamentumtech_audnexus&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=laxamentumtech_audnexus)

</div>

---

<p align="center"> An audiobook data aggregation API, combining multiple sources of data into one, consistent source.
    <br> 
</p>

## 📝 Table of Contents

- [About](#about)
- [Getting Started](#getting_started)
- [Deployment](#deployment)
- [Usage](#usage)
- [Built Using](#built_using)
- [TODO](../TODO.md)
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
  - Directly, via `pnpm run` or `pm2`
    - Mongo 4 or greater
    - Node/NPM 16 or greater
    - Redis
  - Registered Audible device keys, `ADP_TOKEN` and `PRIVATE_KEY`, for chapters. You will need Python and `audible` for this. [More on that here](https://audible.readthedocs.io/en/latest/auth/register.html)

### Installing locally

- Install Mongo, Node and Redis on your system
- `pnpm install` from project directory to get dependencies
- Set `ADP_TOKEN` and `PRIVATE_KEY` environment variables as mentioned above if you are using the chapters endpoint.
- `pnpm run watch-debug` to start the server

Test an API call with

```
http://localhost:3000/books/${ASIN}
```

## 🔧 Running the tests <a name = "tests"></a>

Tests for this project use the Jest framework. Tests can be done locally in a dev environment:

- `pnpm test`

After the tests have run, you may also browse the test coverage. This is generated in `coverage/lcov-report/index.html` under the project directory.

## 🎈 Usage <a name="usage"></a>

API usage documentation can be read here: https://audnex.us/

Pre-rendered HTML documentation is also included in docs/index.html.

HTML can be re-generated from the spec, using:

```
pnpm run build-docs
```

## 🚀 Deployment <a name = "deployment"></a>

### Coolify Deployment

Audnexus can be deployed to Coolify, a self-hosted open-source alternative to Vercel.

**Setup Steps:**

1. **Connect repository to Coolify:**
   - In Coolify, create a new application
   - Select "Git" and connect your GitHub repository
   - Select the branch (e.g., `main` or `develop`)

2. **Configure environment variables:**
   - Set up the following environment variables in Coolify:
   - `NODE_ADP_TOKEN`: Audible ADP_TOKEN value (optional, for chapters endpoint)
   - `NODE_MAX_REQUESTS`: Max requests per minute per source (default: 100)
   - `NODE_MONGODB_URI`: MongoDB connection URL (e.g., `mongodb://mongo:27017/audnexus`)
   - `NODE_PRIVATE_KEY`: Audible PRIVATE_KEY value (optional, for chapters endpoint)
   - `NODE_REDIS_URL`: Redis connection URL (e.g., `redis://redis:6379`)
   - `NODE_UPDATE_INTERVAL`: Update interval in days (default: 30)
   - `NODE_UPDATE_THRESHOLD`: Minimum days before checking updates again (default: 7)

3. **Configure build and deployment:**
   - Build command: Coolify will automatically use the Dockerfile
   - Port: 3000
   - Health check: Coolify can use the `/health` endpoint

4. **Enable GitHub webhook (optional):**
   - In Coolify, get your webhook URL from the application's "Webhook" section
   - Add `COOLIFY_WEBHOOK` to your GitHub repository secrets with this URL
   - In Coolify, create an API token from "Keys & Tokens" > "API Tokens" (enable "Deploy" permission)
   - Add `COOLIFY_TOKEN` to your GitHub repository secrets with the API token
   - The workflow `.github/workflows/deploy-coolify.yml` will trigger deployments automatically on pushes to `main` or `develop`

**Note:** The `.github/workflows/docker-publish.yml` workflow builds and pushes Docker images to GitHub Container Registry (ghcr.io) but does not deploy them. The Coolify workflow builds, pushes, and deploys the Docker image using the Coolify API.

5. **Optional: Configure persistent volumes for MongoDB/Redis:**
   - For production, consider using external MongoDB and Redis services
   - Or configure Coolify to use managed databases

**Important:** The audnexus application requires MongoDB and Redis services to run. You must either:

- Use Coolify's managed database services or external databases
- Deploy the full stack (including MongoDB and Redis containers) using the Docker Compose method in the Docker Swarm section below

Do not proceed with Coolify deployment until you have the `NODE_MONGODB_URI` and `NODE_REDIS_URL` values ready.

**Note:** For production deployments, consider using Coolify's managed database services for MongoDB and Redis, or deploy the full stack using the Docker Compose method below.

### Docker Swarm Deployment

Once you have Docker Swarm setup, grab the `docker-compose.yml` from this repo, and use it to start the stack. Using something like Portainer for a Swarm GUI will make this much easier.

The stack defaults to 15 replicas for the node-server container. Customize this as needed.

Environment variables to add:

- `NODE_ADP_TOKEN`: Aforementioned `ADP_TOKEN` value
- `NODE_MAX_REQUESTS`: Maximum amount of requests per 1 minute period from a single source (default 100)
- `NODE_MONGODB_URI`: MongoDB connection URL, such as `mongodb://mongo/audnexus`
- `NODE_PRIVATE_KEY`: Aforementioned `PRIVATE_KEY` value
- `NODE_REDIS_URL`: Redis connection URL, such as `redis://redis:6379`
- `NODE_UPDATE_INTERVAL`: Frequency (in days) to run scheduled update tasks (default 30). Update task is also run at startup.
- `NODE_UPDATE_THRESHOLD`: Minimum number of days after an item is updated, to allow it to check for updates again (either scheduled or param).
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
- [NodeJs](https://nodejs.org/en/) - Server Environment
- [Papr](https://github.com/plexinc/papr) - Databse connection
- [Redis](https://redis.io/) - Cached responses

## ✍️ Authors <a name = "authors"></a>

- [@djdembeck](https://github.com/djdembeck) - Idea & Initial work

## 🎉 Acknowledgements <a name = "acknowledgement"></a>

- Huge thanks to [mkb79](https://github.com/mkb79) and their [audible](https://github.com/mkb79/Audible) project for a great starting point.
- [macr0dev](https://github.com/macr0dev) for introducing us to scraping.
- [seanap](https://github.com/seanap) for passionately standardizing audiobook organization.
- [Bookcamp](https://www.bookcamp.app/) for giving us a reason to have awesome audiobook data.
