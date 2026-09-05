set -eu
backup=/opt/temichevvet-owner-gateway/backups/clinic-site-20260905-38801ea
release=/var/www/temichevvet-clinic/releases/20260905-24-7-live
test -s "$backup/previous-site.tar.gz"
test "$(sha256sum /tmp/clinic-site-final-20260905.tar.gz | cut -d ' ' -f1)" = aeaf685df05c8d2578e8ae163e718aca844be4997630735a3558c7856d0604eb
curl -fsS http://127.0.0.1:4100/v1/public/clinic/catalog | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["status"]=="ready" and len(d["items"])==272; assert not any(i["priceType"]=="FIXED" and i["price"]==0 for i in d["items"]); print("Gateway ready: 272 public services")'
test ! -e "$release"
mkdir "$release"
tar -xzf /tmp/clinic-site-final-20260905.tar.gz -C "$release" --no-same-owner
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
test ! -e "$release/photo-plan"
grep -q 'index,follow' "$release/index.html"
! grep -q 'Локальный макет\|Проверить форму' "$release/visit/index.html"
install -m 644 /tmp/clinic-site-24-7.nginx.conf /etc/nginx/sites-available/clinic.temichevvet.ru
if ! nginx -t; then cp -p "$backup/clinic-nginx.conf" /etc/nginx/sites-available/clinic.temichevvet.ru; exit 1; fi
ln -s "$release" /var/www/temichevvet-clinic/current-next-20260905
mv -Tf /var/www/temichevvet-clinic/current-next-20260905 /var/www/temichevvet-clinic/current
if ! systemctl reload nginx; then
  previous=$(cat "$backup/previous-site-path.txt")
  ln -s "$previous" /var/www/temichevvet-clinic/current-rollback-20260905
  mv -Tf /var/www/temichevvet-clinic/current-rollback-20260905 /var/www/temichevvet-clinic/current
  cp -p "$backup/clinic-nginx.conf" /etc/nginx/sites-available/clinic.temichevvet.ru
  nginx -t && systemctl reload nginx
  exit 1
fi
curl -fsS --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/ | grep -o '<title>[^<]*'
test "$(curl -s -o /dev/null -w '%{http_code}' --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/release-unknown-check)" = 404
test "$(curl -s -o /dev/null -w '%{http_code}' --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/photo-plan)" = 404
docker ps --format '{{.ID}} {{.Names}} {{.Image}}' > "$backup/containers-after.txt"
echo "Published: $release"
