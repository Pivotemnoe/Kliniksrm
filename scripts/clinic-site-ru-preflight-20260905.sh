set -eu
readlink -f /var/www/temichevvet-clinic/current
find /var/www/temichevvet-clinic/current/ -maxdepth 2 -type f -iname '*privacy*' -o -iname '*policy*'
ls -la /opt/temichevvet-owner-gateway/backups | tail -5
docker inspect temichevvet-owner-gateway --format '{{.Id}} {{.State.StartedAt}}'
docker exec temichevvet-owner-postgres sh -c 'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT tablename FROM pg_tables WHERE schemaname = '\''public'\'' ORDER BY tablename;"'
docker inspect temichevvet-owner-gateway --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(OWNER_GATEWAY_PUBLIC_URL|OWNER_GATEWAY_PUBLIC_SITE_ORIGINS|OWNER_GATEWAY_TRUST_PROXY)='
