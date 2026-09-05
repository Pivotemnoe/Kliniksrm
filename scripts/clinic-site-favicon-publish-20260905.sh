set -eu
test "$(hostname)" = msk-1-vm-d817
test "$(readlink -f /var/www/temichevvet-clinic/current)" = /var/www/temichevvet-clinic/releases/20260905-24-7-live-v4
archive=/tmp/clinic-site-favicon-v5-20260905.tar.gz
test "$(sha256sum "$archive" | cut -d ' ' -f 1)" = 979b262eba099344d5f916995b9a7463ce4ec48dad3171127041f36b0dc5a7db
release=/var/www/temichevvet-clinic/releases/20260905-24-7-live-v5
test ! -e "$release"
mkdir "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
test ! -e "$release/photo-plan"
test -s "$release/favicon.ico"
grep -q 'temichevvet-favicon-32.png?v=20260905' "$release/visit/index.html"
ln -s "$release" /var/www/temichevvet-clinic/current-next-favicon-v5
mv -Tf /var/www/temichevvet-clinic/current-next-favicon-v5 /var/www/temichevvet-clinic/current
for file in / /visit /favicon.ico /brand/temichevvet-favicon-32.png /brand/temichevvet-favicon-192.png /brand/temichevvet-apple-touch-icon.png; do
  curl -fsS -o /dev/null -w "%{http_code} %{content_type} $file\n" --resolve clinic.temichevvet.ru:443:127.0.0.1 "https://clinic.temichevvet.ru$file"
done
readlink -f /var/www/temichevvet-clinic/current
