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
- idle session timeout, default 15 minutes via `SESSION_IDLE_TIMEOUT_MINUTES`;
- `director`, `administrator`, `doctor`, `assistant`, `cashier`, `stock` roles;
- permission guards for protected endpoints;
- employee management endpoints;
- audit log for login and important mutations.

Stage 5 adds owner and patient core API:

- owner search, card and update;
- trusted people;
- patient search, card and update;
- patient weight history;
- vaccination history;
- Vetaf-like vaccination fields: vaccination date, revaccination date, batch/series, vaccine expiry and SMS flag;
- automatic revaccination task creation/update from vaccination revaccination date.

Stage 6 adds queue and appointment API:

- scheduling resources for offices, rooms and employees;
- queue creation without mandatory doctor assignment;
- queue status flow: waiting, in progress, completed, cancelled;
- appointment creation for existing owner and patient without mandatory doctor assignment;
- appointment status flow: planned, arrived, in progress, completed, cancelled;
- audit events for queue and appointment mutations.

Tasks API adds:

- task list with filters by status, due date, owner, animal, employee and role;
- task creation linked to owner and animal;
- assignment to an active employee or to a role;
- task status flow: open, done, cancelled and archived;
- audit events for task mutations.

Notifications foundation adds:

- local outgoing notification outbox for offline-first clinic work;
- notification templates by channel and event code;
- owner communication preferences for Telegram, MAX, SMS and email;
- client portal access state per owner;
- audit events for queueing, retrying, cancelling notifications and changing portal access.

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
- sale creation for retail transactions outside a visit; a sale automatically creates a linked bill with `source=SALE`.

Verification tooling adds:

- deterministic development seed users for all MVP roles;
- API E2E verification for RBAC, status flows, audit log and clinical billing scenarios;
- local PostgreSQL backup script.

Stock and hospital modules add:

- products, services, categories, warehouses, stock batches and supply invoices;
- supply receiving with stock batch and stock movement creation;
- hospital boxes, active stays and discharge/cancel actions.
