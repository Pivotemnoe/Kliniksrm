# API App

Backend application will live here.

Planned stack:

- NestJS
- TypeScript
- Prisma
- PostgreSQL
- Redis
- BullMQ
- OpenAPI/Swagger

The first production backend should be a modular monolith.

Stage 4 adds:

- PostgreSQL-backed employee sessions;
- HttpOnly SameSite session cookie;
- `director`, `administrator`, `doctor`, `assistant`, `cashier`, `stock` roles;
- permission guards for protected endpoints;
- employee management endpoints;
- audit log for login and important mutations.

Stage 5 adds owner and patient core API:

- owner search, card and update;
- trusted people;
- patient search, card and update;
- patient weight history;
- vaccination history.
