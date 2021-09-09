FROM node:14 as build-env
ADD . /app
WORKDIR /app
RUN npm ci --only=production && \
    npm run build

FROM gcr.io/distroless/nodejs:14
COPY --from=build-env /app /app
WORKDIR /app
USER worker

CMD ["server.js"]