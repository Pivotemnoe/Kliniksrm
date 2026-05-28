#!/bin/sh
set -e

npm --workspace @clinic-crm/api run db:deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  npm --workspace @clinic-crm/api run db:seed
fi

node apps/api/dist/main.js
