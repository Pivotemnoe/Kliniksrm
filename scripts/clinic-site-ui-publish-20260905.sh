set -eu
test "$(hostname)" = msk-1-vm-d817
test "$(readlink -f /var/www/temichevvet-clinic/current)" = /var/www/temichevvet-clinic/releases/20260905-24-7-live-v2
archive=/tmp/clinic-site-ui-v3-20260905.tar.gz
test "$(sha256sum "$archive" | cut -d ' ' -f 1)" = e8fa50d2fffeb0261c3f2799fad9703a37b7fe14979ef4a64d81711c4cd25f3d
release=/var/www/temichevvet-clinic/releases/20260905-24-7-live-v3
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
ln -s "$release" /var/www/temichevvet-clinic/current-next-ui-v3
mv -Tf /var/www/temichevvet-clinic/current-next-ui-v3 /var/www/temichevvet-clinic/current
curl -fsS --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/reviews | grep -q 'brand/temichevvet-wordmark.png'
readlink -f /var/www/temichevvet-clinic/current
printf 'Static site v3 published; previous v2 release retained. No services restarted.\n'
