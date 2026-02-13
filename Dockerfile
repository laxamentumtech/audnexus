# Base with pnpm installed
FROM node:lts-alpine@sha256:cd6fb7efa6490f039f3471a189214d5f548c11df1ff9e5b181aa49e22c14383e AS base
WORKDIR /app

RUN apk add --no-cache curl \
    && curl -sL https://unpkg.com/@pnpm/self-installer | node

# Builder with all deps
FROM base AS build
# copy everything to the container
COPY . .

RUN \
    # clean install all dependencies
    pnpm install --frozen-lockfile && \
    # build SvelteKit app
    pnpm run build && \
    # Keep prod deps to copy to final layer
    pnpm install -P --ignore-scripts --frozen-lockfile

# prod 
FROM base AS prod

# copy built SvelteKit app to /app
COPY --from=build /app ./
COPY --from=build /app/node_modules /app/node_modules

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "./dist/server.js"]