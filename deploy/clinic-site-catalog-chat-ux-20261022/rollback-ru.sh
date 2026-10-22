#!/usr/bin/env bash
set -euo pipefail
test "$(hostname)" = msk-1-vm-d817
test "$(readlink -f /var/www/temichevvet-clinic/current)" = /var/www/temichevvet-clinic/releases/20261022-catalog-chat-ux-v1
test "$(sha256sum /var/www/temichevvet-clinic/releases/20261020-checkup-assistant-v1/index.html | cut -d ' ' -f1)" = af14fbe161f84f3a0911495e398ff5884e6a80f0e5ccd482babce146b2d8b0c6
test ! -e /var/www/temichevvet-clinic/current-manual-rollback-20261022
ln -s /var/www/temichevvet-clinic/releases/20261020-checkup-assistant-v1 /var/www/temichevvet-clinic/current-manual-rollback-20261022
mv -Tf /var/www/temichevvet-clinic/current-manual-rollback-20261022 /var/www/temichevvet-clinic/current
test "$(curl --max-time 15 -fsS --resolve clinic.temichevvet.ru:443:127.0.0.1 https://clinic.temichevvet.ru/ | sha256sum | cut -d ' ' -f1)" = af14fbe161f84f3a0911495e398ff5884e6a80f0e5ccd482babce146b2d8b0c6
printf 'ROLLED_BACK clinic static only; additive hashed chunks retained, no API/nginx/container/data changes\n'
