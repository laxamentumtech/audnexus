# Base with bun installed
FROM oven/bun:alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0 AS base
WORKDIR /app
RUN apk add --no-cache curl

# Builder with all deps
FROM base AS build
# copy everything to the container
COPY . .

RUN bun install --frozen-lockfile --ignore-scripts && bun run build-ts

# Production deps only
FROM base AS prod-deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# prod
FROM base AS prod

# copy built app to /app
COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json .

USER bun

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:3000/health || exit 1
CMD ["bun", "run", "serve"]