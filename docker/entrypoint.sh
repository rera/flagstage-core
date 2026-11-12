#!/bin/sh
set -eu

if [ "${1:-web}" = "worker" ]; then
  exec node --import tsx apps/worker/src/main.ts
fi

if [ "${1:-web}" = "flagstage" ]; then
  shift
  exec node --import tsx apps/cli/src/main.ts "$@"
fi

exec node apps/web/server.js
