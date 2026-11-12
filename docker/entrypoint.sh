#!/bin/sh
set -eu

if [ "${1:-web}" = "worker" ]; then
  cd /app
  exec node --import tsx apps/worker/src/main.ts
fi

if [ "${1:-web}" = "flagstage" ]; then
  shift
  cd /app
  exec node --import tsx apps/cli/src/main.ts "$@"
fi

cd /srv
# Docker sets HOSTNAME to the container id. Next standalone binds to that
# name, which is not 127.0.0.1, so the image health check never connects.
export HOSTNAME=0.0.0.0
exec node apps/web/server.js
