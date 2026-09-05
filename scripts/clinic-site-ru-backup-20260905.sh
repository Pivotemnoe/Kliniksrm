set -eu
umask 077
backup=/opt/temichevvet-owner-gateway/backups/clinic-site-20260905-38801ea
test ! -e "$backup"
mkdir "$backup"
cp -p /opt/temichevvet-owner-gateway/.env "$backup/gateway.env"
cp -p /opt/temichevvet-owner-gateway/docker-compose.yml "$backup/gateway-compose.yml"
cp -p /etc/nginx/sites-available/clinic.temichevvet.ru "$backup/clinic-nginx.conf"
readlink -f /var/www/temichevvet-clinic/current > "$backup/previous-site-path.txt"
tar -czf "$backup/previous-site.tar.gz" -C /var/www/temichevvet-clinic/current .
docker ps --format '{{.ID}} {{.Names}} {{.Image}}' > "$backup/containers-before.txt"
docker inspect temichevvet-owner-gateway --format '{{.Config.Image}}' > "$backup/previous-gateway-image.txt"
docker inspect temichevvet-owner-postgres temichevvet-owner-backup --format '{{.Name}} {{.Id}} {{.State.StartedAt}}' > "$backup/stateful-before.txt"
docker exec temichevvet-owner-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/gateway.dump"
test -s "$backup/gateway.dump"
docker exec -i temichevvet-owner-postgres pg_restore -l < "$backup/gateway.dump" > "$backup/gateway-toc.txt"
sha256sum "$backup/gateway.dump" "$backup/previous-site.tar.gz"
wc -c "$backup/gateway.dump"
echo "Backup verified: $backup"
