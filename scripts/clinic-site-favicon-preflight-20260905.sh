set -eu
hostname
readlink -f /var/www/temichevvet-clinic/current
find /var/www/temichevvet-clinic/releases -maxdepth 3 -type f \( -iname '*favicon*' -o -iname '*icon*.svg' -o -iname '*icon*.png' -o -iname '*icon*.ico' \) -print
find /opt/temichevvet-owner-gateway/backups/clinic-site-20260905-38801ea -maxdepth 2 -type f -name '*site*' -print
curl -sS -o /dev/null -w 'Current favicon HTTP %{http_code}\n' --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/favicon.ico
