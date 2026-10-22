#!/usr/bin/env bash
set -euo pipefail
base=/opt/temichevvet-owner-gateway
previous=temichevvet-owner-gateway:grooming-owner-contact-986ba0421242
next=temichevvet-owner-gateway:clinic-catalog-context-20261022-v1
test "$(hostname)" = msk-1-vm-d817
test "$(docker inspect temichevvet-owner-gateway --format '{{.Config.Image}}')" = "$next"
test "$(grep '^OWNER_GATEWAY_IMAGE=' "$base/.env")" = "OWNER_GATEWAY_IMAGE=$next"
test "$(sha256sum "$base/docker-compose.yml" | cut -d ' ' -f1)" = ff81e83e06092612392f4c3085bfb6d13144f6f3d76dccffe696f7ef51957d1c
test "$(docker image inspect "$previous" --format '{{.Id}}')" = sha256:8bcb7da10a8069a2a5ad8811bed5f665adea263ca22e03b6a903e82bd23a0380
sed -i "s#^OWNER_GATEWAY_IMAGE=.*#OWNER_GATEWAY_IMAGE=$previous#" "$base/.env"
(cd "$base" && docker-compose config -q && docker-compose stop gateway && docker-compose rm -f gateway && docker-compose up -d --no-deps gateway)
healthy=0
for attempt in {1..20}; do
  if test "$(docker inspect temichevvet-owner-gateway --format '{{.State.Health.Status}}')" = healthy; then healthy=1; break; fi
  sleep 3
done
test "$healthy" -eq 1
test "$(docker inspect temichevvet-owner-gateway --format '{{.Image}}')" = sha256:8bcb7da10a8069a2a5ad8811bed5f665adea263ca22e03b6a903e82bd23a0380
test "$(docker exec temichevvet-owner-gateway sha256sum /app/apps/owner-gateway/dist/clinic-chat.service.js | cut -d ' ' -f1)" = 5eed0b74408da6ced386d4b052a34d9f3718e1ce5ecdba2f6f81ecadc15d83b5
test "$(curl --max-time 15 -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:4100/health)" = 200
printf 'ROLLED_BACK and healthy; PG/backups/PWA/static sites and all received records retained. No DB restore.\n'
