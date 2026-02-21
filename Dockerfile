# Base with bun installed
FROM oven/bun:alpine@sha256:9028ee7a60a04777190f0c3129ce49c73384d3fc918f3e5c75f5af188e431981 AS base
WORKDIR /app
RUN apk add --no-cache curl

# Builder with all deps
FROM base AS build
# copy everything to the container
COPY . .

RUN bun install --frozen-lockfile --ignore-scripts && bun run build-ts

# prod
FROM base AS prod

# copy built app to /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json .

USER bun

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:3000/health || exit 1
CMD ["bun", "run", "serve"]