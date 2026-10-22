#!/bin/sh
set -e
if [ "${SEED_ON_START:-false}" != "false" ]; then
  echo "This scoped API release requires SEED_ON_START=false" >&2
  exit 78
fi
exec node apps/api/dist/main.js
