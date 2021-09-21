FROM node:16 as build-env
ADD . /app
WORKDIR /app
RUN npm ci --only=production && \
    npm run build

FROM gcr.io/distroless/nodejs:16
COPY --from=build-env /app /app
WORKDIR /app

CMD ["dist/server.js"]
