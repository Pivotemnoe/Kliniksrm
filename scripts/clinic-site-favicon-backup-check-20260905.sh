set -eu
tar -tzf /opt/temichevvet-owner-gateway/backups/clinic-site-20260905-38801ea/previous-site.tar.gz | grep -Ei 'favicon|icon\.(png|svg|ico)|index.html$' | head -30
