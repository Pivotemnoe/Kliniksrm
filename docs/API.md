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

## Implemented endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/v1/meta`
- `GET /api/v1/audit-logs`
- `GET /api/v1/employees`
- `POST /api/v1/employees`
- `GET /api/v1/employees/:employeeId`
- `PATCH /api/v1/employees/:employeeId`
- `GET /api/v1/roles`
- `GET /api/v1/owners`
- `POST /api/v1/owners`
- `GET /api/v1/owners/:ownerId`
- `PATCH /api/v1/owners/:ownerId`
- `GET /api/v1/owners/:ownerId/animals`
- `POST /api/v1/owners/:ownerId/animals`
- `GET /api/v1/owners/:ownerId/trusted-people`
- `POST /api/v1/owners/:ownerId/trusted-people`
- `PATCH /api/v1/owners/:ownerId/trusted-people/:trustedPersonId`
- `GET /api/v1/animals`
- `GET /api/v1/animals/:animalId`
- `PATCH /api/v1/animals/:animalId`
- `GET /api/v1/animals/:animalId/weights`
- `POST /api/v1/animals/:animalId/weights`
- `GET /api/v1/animals/:animalId/vaccinations`
- `POST /api/v1/animals/:animalId/vaccinations`
- `PATCH /api/v1/animals/:animalId/vaccinations/:vaccinationId`
- `GET /api/v1/scheduling/resources`
- `GET /api/v1/queue`
- `POST /api/v1/queue`
- `GET /api/v1/queue/:queueEntryId`
- `PATCH /api/v1/queue/:queueEntryId`
- `POST /api/v1/queue/:queueEntryId/start`
- `POST /api/v1/queue/:queueEntryId/complete`
- `POST /api/v1/queue/:queueEntryId/cancel`
- `GET /api/v1/appointments`
- `POST /api/v1/appointments`
- `GET /api/v1/appointments/:appointmentId`
- `PATCH /api/v1/appointments/:appointmentId`
- `POST /api/v1/appointments/:appointmentId/arrive`
- `POST /api/v1/appointments/:appointmentId/start`
- `POST /api/v1/appointments/:appointmentId/complete`
- `POST /api/v1/appointments/:appointmentId/cancel`

All endpoints except `GET /api/health` and `POST /api/auth/login` require an authenticated active employee session.

Owners, animals, queue and appointments support search and pagination through `search`, `limit` and `offset` query parameters. Animal lists can also be filtered by `ownerId`.

Queue entries can be created without a doctor and without an existing owner card by passing a primary owner name or phone. Appointments require an existing owner and animal, but employee and room are optional so the clinic can accept записи "в клинику" before assigning a specific doctor.

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
- MVP roles and permissions;
- bootstrap director employee in local development.

The API container runs `prisma migrate deploy` before startup. In local Docker Compose, seed runs on start while `SEED_ON_START=true`.

## Local bootstrap director

In local development, seed creates a director-level employee:

- login: `+70000000001`
- password: `ChangeMe123!`

For production, set `BOOTSTRAP_DIRECTOR_PASSWORD` explicitly and replace the default password immediately. The director is the only role intended to assign employee roles and access levels.
