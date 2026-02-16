# Base with bun installed
FROM oven/bun:alpine AS base
WORKDIR /app

# Builder with all deps
FROM base AS build
# copy everything to the container
COPY . .

RUN bun install --frozen-lockfile --ignore-scripts
RUN bun run build-ts

# prod
FROM base AS prod

# copy built app to /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json .

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:3000/health || exit 1
CMD ["bun", "run", "serve"]