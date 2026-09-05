set -eu
backup=/opt/temichevvet-owner-gateway/backups/clinic-site-20260905-38801ea
old=e9bcf08e218a_temichevvet-owner-gateway
test "$(docker inspect "$old" --format '{{.Id}}')" = e9bcf08e218a2b8c655e33e46a74a6555a3c9ace0f33abf3db3bc8d89a9f60cc
test "$(docker inspect "$old" --format '{{json .Mounts}}')" = '[]'
test -s "$backup/gateway.dump"
cd /opt/temichevvet-owner-gateway
sed -i 's|^OWNER_GATEWAY_IMAGE=.*|OWNER_GATEWAY_IMAGE=ghcr.io/pivotemnoe/kliniksrm-owner-gateway:b0e182fe3e2a1fe0461e920a27d5f2d50311bdc0|' .env
# This application container has no mounts. The image and previous env are retained.
# Removing the stopped application shell avoids Compose 1's obsolete ContainerConfig merge.
docker stop "$old"
docker rm "$old"
if ! docker-compose up -d --no-deps gateway; then
  cp -p "$backup/gateway.env" .env
  docker-compose up -d --no-deps gateway
  exit 1
fi
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:4100/v1/public/clinic/catalog; then break; fi
  sleep 2
done
curl -fsS http://127.0.0.1:4100/health
docker inspect temichevvet-owner-postgres temichevvet-owner-backup --format '{{.Name}} {{.Id}} {{.State.StartedAt}}' > "$backup/stateful-after.txt"
diff -u "$backup/stateful-before.txt" "$backup/stateful-after.txt"
docker inspect temichevvet-owner-gateway --format '{{.Config.Image}} {{.State.Status}}'
