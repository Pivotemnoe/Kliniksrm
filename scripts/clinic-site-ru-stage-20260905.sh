set -eu
test "$(sha256sum /tmp/clinic-site-24-7-20260905.tar.gz | cut -d ' ' -f1)" = e7f319f5b1d59fe1a6228b7a59eae2910d1ff77e94e403392491e6ce756f75e8
release=/var/www/temichevvet-clinic/releases/20260905-24-7-b0e182f
test ! -e "$release"
mkdir "$release"
tar -xzf /tmp/clinic-site-24-7-20260905.tar.gz -C "$release" --no-same-owner
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
test -f "$release/prices/index.html"
test ! -e "$release/photo-plan"
grep -q 'index,follow' "$release/index.html"
echo "Staged: $release"
docker exec temichevvet-owner-postgres sh -c 'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT migration_name FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL ORDER BY migration_name;"'
