set -eu
umask 077
backup=/opt/temichevvet-owner-gateway/backups/clinic-site-20260905-38801ea
test -s "$backup/gateway.dump"
version=b0e182fe3e2a1fe0461e920a27d5f2d50311bdc0
image=ghcr.io/pivotemnoe/kliniksrm-owner-gateway:$version
docker pull "$image"
test "$(docker image inspect "$image" --format '{{.Architecture}}')" = amd64
test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$version"
docker exec -i temichevvet-owner-postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < /tmp/clinic-site-catalog-migrate-20260905.sql
cd /opt/temichevvet-owner-gateway
sed -i "s|^OWNER_GATEWAY_IMAGE=.*|OWNER_GATEWAY_IMAGE=$image|" .env
grep -q "^OWNER_GATEWAY_IMAGE=$image$" .env
rollback() { cp -p "$backup/gateway.env" .env; docker-compose up -d --no-deps gateway; }
if ! docker-compose up -d --no-deps gateway; then rollback; exit 1; fi
healthy=false
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4100/health >/dev/null && curl -fsS http://127.0.0.1:4100/v1/public/clinic/catalog >/dev/null; then healthy=true; break; fi
  sleep 2
done
if [ "$healthy" != true ]; then rollback; exit 1; fi
docker inspect temichevvet-owner-postgres temichevvet-owner-backup --format '{{.Name}} {{.Id}} {{.State.StartedAt}}' > "$backup/stateful-after.txt"
diff -u "$backup/stateful-before.txt" "$backup/stateful-after.txt"
docker inspect temichevvet-owner-gateway --format '{{.Config.Image}} {{.State.Status}}'
curl -fsS http://127.0.0.1:4100/v1/public/clinic/catalog
