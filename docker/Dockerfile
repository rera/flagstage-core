# Flagstage Core image. One image runs the web process or the worker.
# Build: docker build -f docker/Dockerfile -t flagstage-core .
# Nothing in this file pushes the image.

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY docs ./docs
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @flagstage/web build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini wget \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 flagstage
# /app is the workspace the worker and CLI run from (pnpm links stay intact).
# /srv is the Next standalone server. Its node_modules is the traced set,
# not the workspace install.
COPY --from=build /app /app
COPY --from=build /app/apps/web/.next/standalone /srv
COPY --from=build /app/apps/web/.next/static /srv/apps/web/.next/static
COPY --from=build /app/apps/web/public /srv/apps/web/public
COPY --from=build /app/packages/db/drizzle /srv/packages/db/drizzle
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R flagstage:flagstage /app /srv
WORKDIR /app
USER flagstage
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
EXPOSE 3000
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
LABEL org.opencontainers.image.source="https://github.com/rera/flagstage-core" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.title="flagstage-core"
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["web"]
