#!/bin/sh
set -eu

# Keep hashed bundles used by CRM tabs opened before a web release. The named
# volume is seeded from the previous image during deployment; do not remove old
# bundles here because an employee may still have that version open.
mkdir -p /usr/share/nginx/html/assets
cp -a /opt/temichevvet-web-assets/. /usr/share/nginx/html/assets/
