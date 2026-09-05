set -eu
hostname
readlink -f /var/www/temichevvet-clinic/current
curl -fsSI --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/
