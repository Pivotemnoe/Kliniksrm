#!/usr/bin/env bash
set -euo pipefail
base=/var/www/temichevvet-clinic
previous=/var/www/temichevvet-clinic/releases/20261020-checkup-assistant-v1
release=/var/www/temichevvet-clinic/releases/20261022-catalog-chat-ux-v1
backup=/var/www/temichevvet-clinic/backups/20261022-catalog-chat-ux-v1
incoming=/var/www/temichevvet-clinic/releases/.incoming-20261022-catalog-chat-ux-v1.tar.gz
tree_hash() { (cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum) | sha256sum | cut -d ' ' -f1; }
guards() {
  test "$(hostname)" = msk-1-vm-d817
  test "$(readlink -f "$base/current")" = "$previous"
  test "$(sha256sum "$previous/index.html" | cut -d ' ' -f1)" = af14fbe161f84f3a0911495e398ff5884e6a80f0e5ccd482babce146b2d8b0c6
  test "$(sha256sum "$previous/SHA256SUMS" | cut -d ' ' -f1)" = 0e35fb93d7b07d4636249dcdd515459d836b8f145b756feb57220daa152cb4cb
  test "$(sha256sum /etc/nginx/sites-available/clinic.temichevvet.ru | cut -d ' ' -f1)" = 405738a786c2169711eac9277dfd8ded81cd85acf1da7aab72e38d9731f1ea53
  test "$(sha256sum /opt/temichevvet-owner-gateway/.env | cut -d ' ' -f1)" = c9d08f3cdb5bad2ff19086e4e3878d4b3414e34b0c51527117f345076bd33772
  test "$(sha256sum /opt/temichevvet-owner-gateway/docker-compose.yml | cut -d ' ' -f1)" = ff81e83e06092612392f4c3085bfb6d13144f6f3d76dccffe696f7ef51957d1c
  test "$(docker inspect temichevvet-owner-gateway --format '{{.Image}}')" = sha256:8bcb7da10a8069a2a5ad8811bed5f665adea263ca22e03b6a903e82bd23a0380
  test "$(docker inspect temichevvet-owner-gateway --format '{{.State.Health.Status}}')" = healthy
  test "$(readlink -f /var/www/temichevvet-grooming/current)" = /var/www/temichevvet-grooming/releases/grooming-jtbd-20261021-r4
  test "$(readlink -f /var/www/temichevvet-pet-hotel/current)" = /var/www/temichevvet-pet-hotel/releases/pet-hotel-site-20261022-rates-r2
  test "$(tree_hash /var/www/temichevvet-grooming/releases/grooming-jtbd-20261021-r4)" = 80be848eace11cba85b93f352ed5d382200560b71d5b6a7ef74f0b2c4047ce4e
  test "$(tree_hash /var/www/temichevvet-pet-hotel/releases/pet-hotel-site-20261022-rates-r2)" = 8a617ab9415f365217cb7961a39cbbfe147ba22f18093210c34905378458c2bc
}
protected_state() {
  for neighbor in /var/www/temichevvet-grooming/current /var/www/temichevvet-pet-hotel/current; do
    target=$(readlink -f "$neighbor")
    printf '%s %s %s\n' "$neighbor" "$target" "$(tree_hash "$target")"
  done
  sha256sum /etc/nginx/nginx.conf /etc/nginx/sites-available/clinic.temichevvet.ru /opt/temichevvet-owner-gateway/.env /opt/temichevvet-owner-gateway/docker-compose.yml
  for service in temichevvet-owner-gateway temichevvet-owner-postgres temichevvet-owner-backup; do
    docker inspect "$service" --format '{{.Name}} {{.Id}} {{.Image}} {{.State.StartedAt}}'
  done
  systemctl show temichevvet_pwa.service -p ActiveState -p ActiveEnterTimestamp
}
http_hash() {
  path=$1 expected=$2
  request_path=/$path
  if test "$path" = index.html; then request_path=/; fi
  actual=$(curl --max-time 15 --retry 2 --retry-delay 1 --retry-max-time 40 -fsS --resolve clinic.temichevvet.ru:443:127.0.0.1 "https://clinic.temichevvet.ru$request_path" | sha256sum | cut -d ' ' -f1)
  test "$actual" = "$expected"
  printf 'HTTP200 SHA256_OK %s %s\n' "$path" "$actual"
}
guards
test "$(sha256sum "$incoming" | cut -d ' ' -f1)" = e6082c2d5d7f2954969b6642f9d3aa9729cc3592c9d62f98dd74fd8cf30d7a96
test ! -e "$release"
test ! -e "$backup"
test "$(df -Pk "$base" | awk 'NR==2 {print $4}')" -gt 200000
nginx -t
(cd "$previous" && sha256sum -c SHA256SUMS >/dev/null)
install -d -m 700 "$backup"
protected_state > "$backup/protected.before"
tar -czf "$backup/previous-site.tar.gz" -C "$previous" .
tar -tzf "$backup/previous-site.tar.gz" >/dev/null
sha256sum "$backup/previous-site.tar.gz" > "$backup/backup.SHA256"
cp -p /etc/nginx/sites-available/clinic.temichevvet.ru "$backup/clinic.nginx.conf"
printf '%s\n' "$previous" > "$backup/previous-site-path.txt"
install -d -m 755 "$release"
tar -xzf "$incoming" -C "$release" --no-same-owner --no-same-permissions
test "$(sha256sum "$release/SHA256SUMS" | cut -d ' ' -f1)" = 24da4ba2b2f6fb7e4c9c1f8846bcb0b513857b5364f32f4db2a601dc4f4a67bb
(cd "$release" && sha256sum -c SHA256SUMS >/dev/null)
test "$(find "$release" -type f | wc -l)" -eq 95
test "$(find "$release" -name index.html | wc -l)" -eq 33
test -z "$(find "$release" -type l -print -quit)"
runuser -u www-data -- test -r "$release/visit/index.html"

# Keep all previous hashed JavaScript/CSS in the next root for open tabs.
find "$previous/assets" -type f \( -name '*.js' -o -name '*.css' \) | sort > "$backup/old-chunks.paths"
: > "$backup/retained-chunks.SHA256SUMS"
while IFS= read -r source; do
  relative=${source#"$previous/"}
  expected=$(sha256sum "$source" | cut -d ' ' -f1)
  if test -e "$release/$relative"; then
    test "$(sha256sum "$release/$relative" | cut -d ' ' -f1)" = "$expected"
  else
    install -D -m 644 "$source" "$release/$relative"
  fi
  printf '%s  %s\n' "$expected" "$relative" >> "$backup/retained-chunks.SHA256SUMS"
done < "$backup/old-chunks.paths"
test "$(wc -l < "$backup/retained-chunks.SHA256SUMS")" -ge 2

# Add new hash-addressed chunks to the old active root before changing HTML.
# Never overwrite a colliding name; no old page or asset is removed.
while read -r expected relative; do
  case "$relative" in assets/*.js|assets/*.css)
    if test -e "$previous/$relative"; then
      test "$(sha256sum "$previous/$relative" | cut -d ' ' -f1)" = "$expected"
    else
      install -D -m 644 "$release/$relative" "$previous/$relative"
    fi
    ;;
  esac
done < "$release/SHA256SUMS"
while read -r expected relative; do
  case "$relative" in assets/*.js|assets/*.css|assets/*.woff2) http_hash "$relative" "$expected";; esac
done < "$release/SHA256SUMS" | tee "$backup/dependencies-pre-switch.txt"
for asset in assets/index-C15GGEdT.js assets/index-BU9LiIB9.css; do
  curl --max-time 15 -fsSI --resolve clinic.temichevvet.ru:443:127.0.0.1 "https://clinic.temichevvet.ru/$asset" > "$backup/$(basename "$asset").headers"
done
grep -qi '^Content-Type: .*javascript' "$backup/index-C15GGEdT.js.headers"
grep -qi '^Content-Type: text/css' "$backup/index-BU9LiIB9.css.headers"
guards
protected_state > "$backup/protected.pre-switch"
cmp "$backup/protected.before" "$backup/protected.pre-switch"
switched=0
rollback_on_failure() {
  code=$?
  if test "$code" -ne 0 && test "$switched" -eq 1; then
    ln -s "$previous" "$base/current-rollback-catalog-chat-ux-20261022"
    mv -Tf "$base/current-rollback-catalog-chat-ux-20261022" "$base/current"
    printf 'ROLLBACK %s\n' "$previous" >&2
  fi
  trap - EXIT
  exit "$code"
}
trap rollback_on_failure EXIT
test ! -e "$base/current-next-catalog-chat-ux-20261022"
ln -s "$release" "$base/current-next-catalog-chat-ux-20261022"
mv -Tf "$base/current-next-catalog-chat-ux-20261022" "$base/current"
switched=1
http_hash index.html 21409bb5857b798643d876e856c6a985f2aef17b934504f722eca7da98a1d947
while read -r expected relative; do
  case "$relative" in assets/*.js|assets/*.css|assets/*.woff2) http_hash "$relative" "$expected";; esac
done < "$release/SHA256SUMS" | tee "$backup/dependencies-post-switch.txt"
while read -r expected relative; do http_hash "$relative" "$expected"; done < "$backup/retained-chunks.SHA256SUMS" | tee "$backup/retained-chunks-https.txt"
for route in / /visit /prices /services/diagnostics /services/laboratory /offers /journal/articles/heart /privacy /contact-consent /api/prices; do
  status=$(curl --max-time 20 -sS -o /dev/null -w '%{http_code}' --resolve clinic.temichevvet.ru:443:127.0.0.1 "https://clinic.temichevvet.ru$route")
  test "$status" = 200
  printf 'ROUTE %s %s\n' "$status" "$route"
done
test "$(docker inspect temichevvet-owner-gateway --format '{{.State.Health.Status}}')" = healthy
protected_state > "$backup/protected.after"
cmp "$backup/protected.before" "$backup/protected.after"
(cd "$release" && sha256sum -c SHA256SUMS >/dev/null && sha256sum -c "$backup/retained-chunks.SHA256SUMS" >/dev/null)
cmp /etc/nginx/sites-available/clinic.temichevvet.ru "$backup/clinic.nginx.conf"
printf 'PUBLISHED %s\nBACKUP %s\nPAYLOAD_MANIFEST 24da4ba2b2f6fb7e4c9c1f8846bcb0b513857b5364f32f4db2a601dc4f4a67bb\nRETAINED_CHUNKS %s\nPROTECTED_STATE_UNCHANGED true\n' "$release" "$backup" "$(wc -l < "$backup/retained-chunks.SHA256SUMS")" | tee "$backup/receipt.txt"
