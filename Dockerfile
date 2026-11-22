# syntax=docker/dockerfile:1
# Jobsmith self-host image: four stages on Next's standalone output.
# The base is node:24-slim pinned by digest (index digest, amd64 and arm64).

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS base
ENV PNPM_HOME=/pnpm \
    npm_config_store_dir=/pnpm/store
RUN corepack enable
WORKDIR /app

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS deps
ENV PNPM_HOME=/pnpm \
    npm_config_store_dir=/pnpm/store
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=jobsmith-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS build
ENV PNPM_HOME=/pnpm
RUN corepack enable
WORKDIR /app
# Placeholders so `next build` can load the env module. They exist in this
# stage only; the runtime stage starts from a clean base and never sees them.
ENV JOBSMITH_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgres://build:build@build.invalid:5432/build \
    BETTER_AUTH_SECRET=build-only-placeholder-secret-0000 \
    APP_URL=http://build.invalid
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build \
 && pnpm scripts:build \
 && pnpm licenses:collect \
 && cp -r public .next/standalone/public \
 && mkdir -p .next/standalone/.next \
 && cp -r .next/static .next/standalone/.next/static

FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS runtime
ARG JOBSMITH_VERSION=dev
ARG JOBSMITH_COMMIT=unknown
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    STORAGE_LOCAL_DIR=/data/storage \
    JOBSMITH_VERSION=${JOBSMITH_VERSION} \
    JOBSMITH_COMMIT=${JOBSMITH_COMMIT}
LABEL org.opencontainers.image.source="https://github.com/weeeha/Jobsmith" \
      org.opencontainers.image.version="${JOBSMITH_VERSION}" \
      org.opencontainers.image.revision="${JOBSMITH_COMMIT}" \
      org.opencontainers.image.licenses=AGPL-3.0-only
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone /app
COPY --from=build --chown=node:node /app/commands /app/commands
COPY --from=build --chown=node:node /app/lib/db/migrations /app/commands/migrations
COPY --from=build --chown=node:node --chmod=755 /app/docker-entrypoint.sh /app/docker-entrypoint.sh
COPY --from=build --chown=node:node /app/THIRD_PARTY_LICENSES.txt /app/THIRD_PARTY_LICENSES.txt
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||3000)+"/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
ENTRYPOINT ["./docker-entrypoint.sh"]
