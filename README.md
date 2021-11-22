<p align="center">
  <a href="" rel="noopener">
 <img width=200px height=200px src="../assets/logos/logo.png?raw=true" alt="Project logo"></a>
</p>

<h3 align="center">audnexus</h3>

<div align="center">

[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![GitHub Issues](https://img.shields.io/github/issues/djdembeck/audnexus.svg)](https://github.com/djdembeck/audnexus/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/djdembeck/audnexus.svg)](https://github.com/djdembeck/audnexus/pulls)
[![License](https://img.shields.io/badge/license-GNUGPL-blue.svg)](/LICENSE)
[![CodeFactor Grade](https://img.shields.io/codefactor/grade/github/djdembeck/audnexus)](https://www.codefactor.io/repository/github/djdembeck/audnexus)

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

*Nexus - noun: a connection or series of connections linking two or more things.*

Looking around for audiobook metadata, we realized there's no solid (or open) single source of truth. Further, some solutions had community curated data, only to close their API. As such, this project has been created to enable development to include multiple sources of audiobook content in one response.

This project also makes integration into existing media servers very streamlined. Since all data can be returned with 1-2 API calls, there's little to no overhead processing on the client side. This enables rapid development of stable client plugins. Audnexus serves as a provider during the interim of waiting for a community driven audiobook database, at which time audnexus will be a seeder for such a database.

## 🏁 Getting Started <a name = "getting_started"></a>

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See [deployment](#deployment) for notes on how to deploy the project on a live system.

### Prerequisites

- There are 2 ways to deploy this project - for the purposes of this project, this guide will only cover Docker deployment:
  - [Docker Swarm](https://docs.docker.com/engine/swarm/swarm-tutorial/)
  - Directly, via `npm run` or `pm2`
    - Mongo 4 or greater
    - Node/NPM 16 or greater
    - Redis
- Registered Audible device keys, `ADP_TOKEN` and `PRIVATE_KEY`, for chapters. You will need Python and `audible` for this. [More on that here](https://audible.readthedocs.io/en/latest/auth/register.html)

### Installing locally

- Install Mongo, Node and Redis on your system
- `npm install` from project directory to get dependencies
- Set `ADP_TOKEN` and `PRIVATE_KEY` environment variables as mentioned above if you are using the chapters endpoint.
- `npm run watch-debug` to start the server

Test an API call with

```
http://localhost:3000/books/${ASIN}
```

## 🔧 Running the tests <a name = "tests"></a>

Tests for this project use the Jest framework. Tests can be done locally in a dev environment:
- `npm test`

After the tests have run, you may also browse the test coverage. This is generated in `coverage/lcov-report/index.html` under the project directory.

## 🎈 Usage <a name="usage"></a>

API usage documentation can be read here: https://audnex.us/

## 🚀 Deployment <a name = "deployment"></a>

Once you have Docker Swarm setup, grab the `docker-compose.yml` from this repo, and use it to start the stack. Using something like Portainer for a Swarm GUI will make this much easier.

The stack defaults to 15 replicas for the node-server container. Customize this as needed.

Environment variables to add:
- `NODE_ADP_TOKEN`: Aforementioned `ADP_TOKEN` value
- `NODE_MONGODB_URI`: MongoDB connection URL, such as `mongodb://mongo/audnexus`
- `NODE_PRIVATE_KEY`: Aforementioned `PRIVATE_KEY` value
- `NODE_REDIS_URL`: Redis connection URL, such as `redis://redis:6379`
- `TRAEFIK_DOMAIN`: FQDN for the API server
- `TRAEFIK_EMAIL`: Email to register SSL cert with

Once the stack is up, test an API call with

```
https://${TRAEFIK_DOMAIN}/books/${ASIN}
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