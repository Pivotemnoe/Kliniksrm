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

Stage 6 adds queue and appointment API:

- scheduling resources for offices, rooms and employees;
- queue creation without mandatory doctor assignment;
- queue status flow: waiting, in progress, completed, cancelled;
- appointment creation for existing owner and patient without mandatory doctor assignment;
- appointment status flow: planned, arrived, in progress, completed, cancelled;
- audit events for queue and appointment mutations.

Stage 7 adds clinical visit API:

- visit creation from appointment, queue entry or direct owner/patient pair;
- visit status flow: draft, in progress, completed, cancelled;
- examination sheet with weight and temperature fields;
- diagnosis and recommendation endpoints;
- service lines on the visit bill with automatic visit total recalculation.

Stage 8 adds billing and payment API:

- bill list and bill card;
- manual bills and visit-linked bills;
- bill item create, update and delete with automatic total recalculation;
- payment acceptance with overpayment protection;
- refund recording as negative payment rows;
- bill status recalculation across unpaid, partial and paid states.
