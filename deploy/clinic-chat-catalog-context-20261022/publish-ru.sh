#!/usr/bin/env bash
set -euo pipefail
base=/opt/temichevvet-owner-gateway
previous=temichevvet-owner-gateway:grooming-owner-contact-986ba0421242
previous_id=sha256:8bcb7da10a8069a2a5ad8811bed5f665adea263ca22e03b6a903e82bd23a0380
next=temichevvet-owner-gateway:clinic-catalog-context-20261022-v1
build=/opt/temichevvet-owner-gateway/releases/clinic-catalog-context-20261022-v1
backup=/opt/temichevvet-owner-gateway/backups/clinic-catalog-context-20261022-v1
incoming=/opt/temichevvet-owner-gateway/clinic-catalog-context-20261022-v1.tar.gz
tree_hash() { (cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum) | sha256sum | cut -d ' ' -f1; }
dist_manifest() { docker exec temichevvet-owner-gateway sh -c 'cd /app/apps/owner-gateway/dist; find . -type f -print0 | sort -z | xargs -0 sha256sum'; }
runtime_env_hash() { docker exec temichevvet-owner-gateway env | grep -v '^HOSTNAME=' | sort | sha256sum | cut -d ' ' -f1; }
guards() {
  test "$(hostname)" = msk-1-vm-d817
  test "$(docker inspect temichevvet-owner-gateway --format '{{.Image}}')" = "$previous_id"
  test "$(docker image inspect "$previous" --format '{{.Id}}')" = "$previous_id"
  test "$(docker inspect temichevvet-owner-gateway --format '{{.State.Health.Status}}')" = healthy
  test "$(sha256sum "$base/.env" | cut -d ' ' -f1)" = c9d08f3cdb5bad2ff19086e4e3878d4b3414e34b0c51527117f345076bd33772
  test "$(sha256sum "$base/docker-compose.yml" | cut -d ' ' -f1)" = ff81e83e06092612392f4c3085bfb6d13144f6f3d76dccffe696f7ef51957d1c
  test "$(docker exec temichevvet-owner-gateway sha256sum /app/apps/owner-gateway/dist/clinic-chat.service.js | cut -d ' ' -f1)" = 5eed0b74408da6ced386d4b052a34d9f3718e1ce5ecdba2f6f81ecadc15d83b5
  test "$(dist_manifest | wc -l)" -eq 277
  test "$(dist_manifest | grep -v '  ./clinic-chat.service.js$' | sha256sum | cut -d ' ' -f1)" = cff1e818fbdd40645ccd3b2053d9328748423880200593a055230fc70c199a70
  test "$(readlink -f /var/www/temichevvet-clinic/current)" = /var/www/temichevvet-clinic/releases/20261022-catalog-chat-ux-v2
  test "$(readlink -f /var/www/temichevvet-grooming/current)" = /var/www/temichevvet-grooming/releases/grooming-jtbd-20261021-r4
  test "$(readlink -f /var/www/temichevvet-pet-hotel/current)" = /var/www/temichevvet-pet-hotel/releases/pet-hotel-site-20261022-rates-r2
  test "$(tree_hash /var/www/temichevvet-clinic/releases/20261022-catalog-chat-ux-v2)" = 5e355bc6841b2b7ca44efcff9ccf22af08ef16e74877ad4f55d03eaa14d133b3
  test "$(tree_hash /var/www/temichevvet-grooming/releases/grooming-jtbd-20261021-r4)" = 80be848eace11cba85b93f352ed5d382200560b71d5b6a7ef74f0b2c4047ce4e
  test "$(tree_hash /var/www/temichevvet-pet-hotel/releases/pet-hotel-site-20261022-rates-r2)" = 8a617ab9415f365217cb7961a39cbbfe147ba22f18093210c34905378458c2bc
}
protected_state() {
  for site in /var/www/temichevvet-clinic/current /var/www/temichevvet-grooming/current /var/www/temichevvet-pet-hotel/current; do target=$(readlink -f "$site"); printf '%s %s %s\n' "$site" "$target" "$(tree_hash "$target")"; done
  sha256sum /etc/nginx/nginx.conf /etc/nginx/sites-available/clinic.temichevvet.ru "$base/docker-compose.yml"
  sed '/^OWNER_GATEWAY_IMAGE=/d' "$base/.env" | sha256sum
  runtime_env_hash
  for service in temichevvet-owner-postgres temichevvet-owner-backup; do docker inspect "$service" --format '{{.Name}} {{.Id}} {{.State.StartedAt}}'; done
  systemctl show temichevvet_pwa.service -p ActiveState -p ActiveEnterTimestamp
}
restart_gateway() {
  (cd "$base" && docker-compose config -q && docker-compose stop gateway && docker-compose rm -f gateway && docker-compose up -d --no-deps gateway)
  for attempt in {1..20}; do
    if test "$(docker inspect temichevvet-owner-gateway --format '{{.State.Health.Status}}')" = healthy; then return 0; fi
    sleep 3
  done
  return 1
}
guards
test "$(grep -c '^OWNER_GATEWAY_IMAGE=' "$base/.env")" -eq 1
test "$(grep '^OWNER_GATEWAY_IMAGE=' "$base/.env")" = "OWNER_GATEWAY_IMAGE=$previous"
test "$(sha256sum "$incoming" | cut -d ' ' -f1)" = 72771a0c8f879e8381edac8782bc2b10c035391d1aaa1def6303b61c90b9fc5c
test ! -e "$build"
test ! -e "$backup"
if docker image inspect "$next" >/dev/null 2>&1; then exit 8; fi
test "$(df -Pk "$base" | awk 'NR==2 {print $4}')" -gt 1000000
umask 077
install -d -m 700 "$build" "$backup"
protected_state > "$backup/protected.before"
dist_manifest > "$backup/dist.before.SHA256SUMS"
test "$(grep -v '  ./clinic-chat.service.js$' "$backup/dist.before.SHA256SUMS" | wc -l)" -eq 276
cp -p "$base/.env" "$backup/.env"
cp -p "$base/docker-compose.yml" "$backup/docker-compose.yml"
docker exec temichevvet-owner-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/database.dump"
test -s "$backup/database.dump"
sha256sum "$backup/database.dump" > "$backup/database.SHA256"
# The dump is private recovery evidence only. Never restore it during image
# rollback: that would overwrite legitimate requests received in the meantime.
tar -xzf "$incoming" -C "$build" --no-same-owner --no-same-permissions
test -z "$(find "$build" -type l -print -quit)"
test "$(find "$build" -type f | wc -l)" -eq 2
test "$(sha256sum "$build/payload/clinic-chat.service.js" | cut -d ' ' -f1)" = 22ab1c61e24d6fb0cc51b15d2002e6b03418a7a7af131d110339fc371d21f80e
chmod 644 "$build/payload/clinic-chat.service.js"
docker build --network none -t "$next" "$build"
new_id=$(docker image inspect "$next" --format '{{.Id}}')
docker run --rm --network none --entrypoint sh "$next" -c 'cd /app/apps/owner-gateway/dist; find . -type f -print0 | sort -z | xargs -0 sha256sum' > "$backup/dist.candidate.SHA256SUMS"
test "$(wc -l < "$backup/dist.candidate.SHA256SUMS")" -eq 277
test "$(grep '  ./clinic-chat.service.js$' "$backup/dist.candidate.SHA256SUMS" | cut -d ' ' -f1)" = 22ab1c61e24d6fb0cc51b15d2002e6b03418a7a7af131d110339fc371d21f80e
grep -v '  ./clinic-chat.service.js$' "$backup/dist.before.SHA256SUMS" > "$backup/rest.before"
grep -v '  ./clinic-chat.service.js$' "$backup/dist.candidate.SHA256SUMS" > "$backup/rest.candidate"
cmp "$backup/rest.before" "$backup/rest.candidate"
for image in "$previous" "$next"; do docker image inspect "$image" --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}} {{json .Config.Env}} {{.Config.WorkingDir}} {{.Config.User}}' | sha256sum; done > "$backup/image-config-hashes.txt"
test "$(sort -u "$backup/image-config-hashes.txt" | wc -l)" -eq 1
docker run --rm --network none --entrypoint node "$next" -e 'require("reflect-metadata");const x=require("/app/apps/owner-gateway/dist/clinic-chat.service.js");const p=require("/app/apps/owner-gateway/dist/generated/client").Prisma;const c=require("/app/apps/owner-gateway/dist/clinic-checkup");if(typeof x.ClinicChatService!=="function"||!p.DbNull||typeof c.checkupState!=="function")process.exit(3);console.log("Compiled service and existing Prisma/checkup dependency load OK")'
guards
protected_state > "$backup/protected.pre-switch"
cmp "$backup/protected.before" "$backup/protected.pre-switch"
changed=0
rollback_on_failure() {
  code=$?
  if test "$code" -ne 0 && test "$changed" -eq 1; then
    if test "$(grep '^OWNER_GATEWAY_IMAGE=' "$base/.env")" = "OWNER_GATEWAY_IMAGE=$next"; then
      sed -i "s#^OWNER_GATEWAY_IMAGE=.*#OWNER_GATEWAY_IMAGE=$previous#" "$base/.env"
      restart_gateway >&2 || true
      printf 'ROLLED_BACK image only; no database restore\n' >&2
    else
      printf 'External image pin changed; refusing to overwrite it during rollback\n' >&2
    fi
  fi
  trap - EXIT
  exit "$code"
}
trap rollback_on_failure EXIT
changed=1
sed -i "s#^OWNER_GATEWAY_IMAGE=.*#OWNER_GATEWAY_IMAGE=$next#" "$base/.env"
restart_gateway
test "$(docker inspect temichevvet-owner-gateway --format '{{.Image}}')" = "$new_id"
test "$(docker inspect temichevvet-owner-gateway --format '{{.Config.Image}}')" = "$next"
test "$(curl --max-time 15 -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:4100/health)" = 200
dist_manifest > "$backup/dist.after.SHA256SUMS"
cmp "$backup/dist.candidate.SHA256SUMS" "$backup/dist.after.SHA256SUMS"
protected_state > "$backup/protected.after"
cmp "$backup/protected.before" "$backup/protected.after"
for url in https://clinic.temichevvet.ru/ https://clinic.temichevvet.ru/prices https://clinic.temichevvet.ru/api/prices https://cabinet.temichevvet.ru/portal https://temichevvet.ru/api/health; do
  code=$(curl --max-time 20 -sS -o /dev/null -w '%{http_code}' "$url")
  case "$code" in 200|302) printf 'HTTP %s %s\n' "$code" "$url";; *) exit 9;; esac
done
printf 'PUBLISHED %s\nIMAGE_ID %s\nBASE_IMAGE %s\nCHANGED_DIST_FILES 1\nUNCHANGED_DIST_FILES 276\nPROTECTED_STATE_UNCHANGED true\nBACKUP %s\n' "$next" "$new_id" "$previous_id" "$backup" | tee "$backup/receipt.txt"
