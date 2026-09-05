set -eu
test "$(hostname)" = msk-1-vm-d817
test "$(readlink -f /var/www/temichevvet-clinic/current)" = /var/www/temichevvet-clinic/releases/20260905-24-7-live-v5
archive=/tmp/clinic-site-square-logo-v6-20260905.tar.gz
test "$(sha256sum "$archive" | cut -d ' ' -f 1)" = 67b9c37476772dae31e1e5fcce86d940b7bff0588466b68df4d0e68b9c6d3ea6
release=/var/www/temichevvet-clinic/releases/20260905-24-7-live-v6
test ! -e "$release"
mkdir "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
test ! -e "$release/photo-plan"
test ! -e "$release/brand/temichevvet-wordmark.png"
test -s "$release/favicon.ico"
grep -q 'class="brand".*src="/brand/temichevvet-logo.jpg"' "$release/visit/index.html"
! grep -q 'temichevvet-wordmark' "$release/visit/index.html"
ln -s "$release" /var/www/temichevvet-clinic/current-next-square-logo-v6
mv -Tf /var/www/temichevvet-clinic/current-next-square-logo-v6 /var/www/temichevvet-clinic/current
for file in / /visit /reviews /prices /favicon.ico /brand/temichevvet-logo.jpg /assets/index-3ZKu1vK9.css /assets/index-CM9nKDCI.js; do
  curl -fsS -o /dev/null -w "%{http_code} %{content_type} $file\n" --resolve clinic.temichevvet.ru:443:127.0.0.1 "https://clinic.temichevvet.ru$file"
done
readlink -f /var/www/temichevvet-clinic/current
