set -eu
test "$(readlink -f /var/www/temichevvet-clinic/current)" = /var/www/temichevvet-clinic/releases/20260905-24-7-live-v4
for page in / /about /services /team /team/temichev /prices /reviews /contacts /visit /night /services/consultation /services/diagnostics /services/laboratory /services/surgery /services/inpatient /services/pharmacy /brand/temichevvet-wordmark.png /brand/temichevvet-logo.jpg /assets/index-DSu3_Jls.css /assets/index-DaW73nlY.js; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --resolve clinic.temichevvet.ru:443:127.0.0.1 "https://clinic.temichevvet.ru$page")
  printf '%s %s\n' "$code" "$page"
  test "$code" = 200
done
for page in /photo-plan /missing-page /assets/missing.png; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --resolve clinic.temichevvet.ru:443:127.0.0.1 "https://clinic.temichevvet.ru$page")
  printf '%s %s\n' "$code" "$page"
  test "$code" = 404
done
printf 'All static release checks passed.\n'
