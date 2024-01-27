# Base with pnpm installed
FROM node:lts-alpine@sha256:a2bb114e1f87c3411ca78de61c2100685eba176481355e32899210c7f51f98d4 AS base
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
COPY . .

EXPOSE 3000
CMD ["node", "./dist/server.js"]