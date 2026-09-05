set -eu
test "$(hostname)" = msk-1-vm-d817
test "$(readlink -f /var/www/temichevvet-clinic/current)" = /var/www/temichevvet-clinic/releases/20260905-24-7-live-v3
archive=/tmp/clinic-site-ui-v4-20260905.tar.gz
test "$(sha256sum "$archive" | cut -d ' ' -f 1)" = 016b6b75d438fb8274c9baf68d28ee2e9744f86e2045cc931ff68eb4701e6210
release=/var/www/temichevvet-clinic/releases/20260905-24-7-live-v4
test ! -e "$release"
mkdir "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
test ! -e "$release/photo-plan"
test -s "$release/brand/temichevvet-logo.jpg"
test -s "$release/brand/temichevvet-wordmark.png"
grep -q 'maps-reviews-widget/1809394242' "$release/index.html"
grep -q 'loading="eager"' "$release/reviews/index.html"
! grep -q 'Загрузить отзывы' "$release/reviews/index.html"
ln -s "$release" /var/www/temichevvet-clinic/current-next-ui-v4
mv -Tf /var/www/temichevvet-clinic/current-next-ui-v4 /var/www/temichevvet-clinic/current
curl -fsS --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/reviews | grep -q 'brand/temichevvet-wordmark.png'
readlink -f /var/www/temichevvet-clinic/current
printf 'Static site v4 published; previous v3 release retained. No services restarted.\n'
