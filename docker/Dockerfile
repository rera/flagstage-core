# Flagstage Core image. The default target is the web container.
# docker build --target lambda builds the chat Lambda image.
# Build: docker build -f docker/Dockerfile -t flagstage-core .
# Nothing in this file pushes the image.

FROM node:25-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY docs ./docs
COPY docker/bundle.mjs ./docker/bundle.mjs
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @flagstage/web build
RUN node docker/bundle.mjs

FROM node:25-bookworm-slim AS runtime
ARG OPENCODE_VERSION=2.2.7
ARG OPENCODE_SHA256=89a6cee227b54bc011179c528a5e63176032462b1a5e21723b616801cddc2ca7
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini wget \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 flagstage \
  && wget -q -O /tmp/opencode.tar.gz "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz" \
  && echo "${OPENCODE_SHA256}  /tmp/opencode.tar.gz" | sha256sum -c - \
  && mkdir -p /home/flagstage/.local/bin \
  && tar -xzf /tmp/opencode.tar.gz -C /home/flagstage/.local/bin \
  && chmod 755 /home/flagstage/.local/bin/opencode \
  && chown -R flagstage:flagstage /home/flagstage \
  && rm /tmp/opencode.tar.gz
# The worker and CLI are bundled JavaScript. Next standalone keeps its own
# traced dependencies under /srv. Migrations and agent skills stay as files.
COPY --from=build --chown=flagstage:flagstage /app/dist/import.mjs /app/dist/import.mjs
COPY --from=build --chown=flagstage:flagstage /app/dist/lambda.js /app/lambda.js
COPY --from=build --chown=flagstage:flagstage /app/dist/cli.mjs /app/dist/cli.mjs
COPY --from=build --chown=flagstage:flagstage /app/packages/db/drizzle /app/drizzle
COPY --from=build --chown=flagstage:flagstage /app/packages/agent/skills /app/skills
COPY --from=build --chown=flagstage:flagstage /app/apps/web/.next/standalone /srv
COPY --from=build --chown=flagstage:flagstage /app/apps/web/.next/static /srv/apps/web/.next/static
COPY --from=build --chown=flagstage:flagstage /app/apps/web/public /srv/apps/web/public
COPY --from=build --chown=flagstage:flagstage /app/packages/db/drizzle /srv/packages/db/drizzle
COPY docker/entrypoint.sh /entrypoint.sh
COPY flagstage.config.json /app/flagstage.config.json
COPY flagstage.config.json /srv/flagstage.config.json
COPY brand /app/brand
COPY brand /srv/brand
RUN chmod +x /entrypoint.sh
WORKDIR /app
USER flagstage
ENV HOME=/home/flagstage
ENV PATH="/home/flagstage/.local/bin:${PATH}"
ENV OPENCODE_VERSION=2.2.7
ENV OPENCODE_DISABLE_AUTOUPDATE=1
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

FROM runtime AS lambda
USER root
RUN npm install -g aws-lambda-ric
USER flagstage
WORKDIR /app
ENTRYPOINT ["/usr/local/bin/aws-lambda-ric"]
CMD ["lambda.handler"]

FROM runtime
