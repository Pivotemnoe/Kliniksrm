# Docker Infrastructure

Docker-related infrastructure currently includes:

- API Dockerfile: `apps/api/Dockerfile`
- web Dockerfile: `apps/web/Dockerfile`
- web Nginx config: `apps/web/nginx.conf`
- root compose file: `docker-compose.yml`
- local backup scripts: `scripts/backup-postgres.sh`, `scripts/backup-local.sh`

Future infrastructure files:

- worker Dockerfile
- production compose overrides

The root `docker-compose.yml` defines local services for the clinic server: PostgreSQL, Redis, MinIO, API and web.
