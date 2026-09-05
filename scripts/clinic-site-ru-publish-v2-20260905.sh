set -eu
release=/var/www/temichevvet-clinic/releases/20260905-24-7-live-v2
test "$(readlink -f /var/www/temichevvet-clinic/current)" = /var/www/temichevvet-clinic/releases/20260905-24-7-live
test "$(sha256sum /tmp/clinic-site-final-v2-20260905.tar.gz | cut -d ' ' -f1)" = 8c7b7a89e0c7487aa7ecb6c9bb8627f68f5b08e26c28e18a42c529b954b3c577
test ! -e "$release"
mkdir "$release"
tar -xzf /tmp/clinic-site-final-v2-20260905.tar.gz -C "$release" --no-same-owner
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
test ! -e "$release/photo-plan"
for page in team services/consultation services/diagnostics services/surgery services/pharmacy; do grep -q 'РАЗДЕЛ В РАЗРАБОТКЕ' "$release/$page/index.html"; done
ln -s "$release" /var/www/temichevvet-clinic/current-next-v2-20260905
mv -Tf /var/www/temichevvet-clinic/current-next-v2-20260905 /var/www/temichevvet-clinic/current
curl -fsS --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/team | grep -o 'РАЗДЕЛ В РАЗРАБОТКЕ'
test "$(curl -s -o /dev/null -w '%{http_code}' --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/release-unknown-check)" = 404
test "$(curl -s -o /dev/null -w '%{http_code}' --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/photo-plan)" = 404
docker ps --format '{{.ID}} {{.Names}} {{.Image}}' > /opt/temichevvet-owner-gateway/backups/clinic-site-20260905-38801ea/containers-after.txt
echo "Published: $release"
