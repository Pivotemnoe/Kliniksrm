# Backend API

## Local URLs

- API health: `http://127.0.0.1:4000/api/health`
- Swagger UI: `http://127.0.0.1:4000/api/docs`
- PostgreSQL from host: `127.0.0.1:5433`
- PostgreSQL inside Docker: `postgres:5432`
- Redis from host: `127.0.0.1:6379`
- MinIO API: `http://127.0.0.1:9000`
- MinIO console: `http://127.0.0.1:9001`

PostgreSQL uses host port `5433` by default to avoid conflicts with other local Postgres containers.

## Commands

```bash
docker compose up -d postgres redis minio
docker compose build api
docker compose up -d api
docker compose logs -f api
```

## Stage 3 endpoints

- `GET /api/health`
- `GET /api/v1/meta`
- `GET /api/v1/owners`
- `POST /api/v1/owners`
- `GET /api/v1/owners/:ownerId`
- `GET /api/v1/owners/:ownerId/animals`
- `POST /api/v1/owners/:ownerId/animals`

## Database

Prisma schema:

- `prisma/schema.prisma`

Initial migration:

- `prisma/migrations/20260528000100_init/migration.sql`

Seed:

- `prisma/seed.cjs`

Seed creates:

- one organization;
- one clinic office;
- default rooms;
- one warehouse;
- hospital boxes;
- MVP roles and permissions.

The API container runs `prisma migrate deploy` before startup. In local Docker Compose, seed runs on start while `SEED_ON_START=true`.
