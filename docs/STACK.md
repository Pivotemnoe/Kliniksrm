# Production Stack

## Frontend

- React
- Vite
- TypeScript
- Ant Design
- TanStack Query
- React Hook Form
- Zod
- TanStack Table for complex tables only

Ant Design is the default UI library because the product is a dense operational CRM: tables, forms, modals, drawers, tabs, uploads and date controls are core UI elements.

TanStack Query is used for server state: owners, animals, appointments, visits, bills, stock, documents and settings.

React Hook Form and Zod are used together for large forms and shared validation rules.

TanStack Table should be used selectively for tables that need advanced behavior: complex filters, custom cells, pinned columns, bulk actions or deep sorting.

## Backend

- NestJS
- TypeScript
- Prisma
- PostgreSQL
- Redis
- BullMQ
- OpenAPI/Swagger

The backend should start as a modular monolith. The first version should not use microservices.

Core modules:

- auth
- users
- employees
- roles
- audit
- owners
- animals
- queue
- appointments
- visits
- billing
- payments
- stock
- supplies
- documents
- files
- settings
- notifications
- backups

## Employee Access Levels

- `director`: full access, including employee creation, role assignment, clinic settings, audit log and backups.
- `administrator`: operational clinic access: queue, appointments, owners, animals, visits, billing, payments and document printing. No clinic schema/settings or role management.
- `doctor`: medical workflow access: appointments, owners/patients read access, patient updates, visits, recommendations and document printing. No employee, role or clinic settings management.
- `assistant`: limited clinical read access.
- `cashier`: billing/payment access.
- `stock`: warehouse access.

## Stage 4 backend baseline

The backend baseline lives in `apps/api` and exposes:

- `GET /api/health`;
- `POST /api/auth/login`;
- `GET /api/auth/me`;
- `POST /api/auth/logout`;
- `GET /api/v1/meta`;
- `GET /api/v1/audit-logs`;
- employee and role management endpoints;
- `GET /api/v1/owners`;
- `POST /api/v1/owners`;
- `GET /api/v1/owners/:ownerId`;
- owner update and trusted people endpoints;
- patient list/card/update endpoints;
- patient weight and vaccination endpoints;
- `GET /api/v1/owners/:ownerId/animals`;
- `POST /api/v1/owners/:ownerId/animals`;
- Swagger UI at `/api/docs`.

The first Prisma schema lives in `prisma/schema.prisma`.

## Files

- MinIO locally
- S3-compatible storage in production

Files must not be served as public static assets by default. Access should go through backend authorization or signed links.

## Infrastructure

- Docker Compose
- Nginx
- PostgreSQL
- Redis
- MinIO
- API container
- Web container
- Worker container for BullMQ jobs

The first deploy can be a single-server Docker Compose setup. This is simpler to support and enough for the first production version.

## Security

- HttpOnly cookies
- Secure and SameSite cookie flags in production
- Server-side sessions
- RBAC
- Audit log
- Backups
- 2FA for owner/admin roles later

The cookie should store only a session identifier or token reference. Session data should stay on the server in Redis or PostgreSQL.

Current implementation uses PostgreSQL-backed server sessions. The browser receives only a random session token in an HttpOnly SameSite cookie.
