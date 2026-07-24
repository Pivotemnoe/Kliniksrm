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
- `PATCH /api/auth/password`
- `GET /api/v1/meta`
- `GET /api/v1/audit-logs`
- `GET /api/v1/employees`
- `POST /api/v1/employees`
- `GET /api/v1/employees/:employeeId`
- `PATCH /api/v1/employees/:employeeId`
- `GET /api/v1/roles`
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/:taskId`
- `PATCH /api/v1/tasks/:taskId`
- `POST /api/v1/tasks/:taskId/done`
- `POST /api/v1/tasks/:taskId/cancel`
- `POST /api/v1/tasks/:taskId/reopen`
- `POST /api/v1/tasks/:taskId/archive`
- `GET /api/v1/notifications/outbox`
- `POST /api/v1/notifications/outbox`
- `POST /api/v1/notifications/outbox/:notificationId/retry`
- `POST /api/v1/notifications/outbox/:notificationId/cancel`
- `GET /api/v1/notifications/templates`
- `POST /api/v1/notifications/templates`
- `GET /api/v1/notifications/owners/:ownerId/portal-access`
- `PATCH /api/v1/notifications/owners/:ownerId/portal-access`
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

Vaccination payload supports Vetaf-like fields:

- `title`, `status`, `vaccinatedAt`, `expiresAt`, `vaccineBatch`, `vaccineSeries`, `vaccineExpiresAt`, `smsReminder`, `notes`.
- `expiresAt` is used as the revaccination date.
- When `expiresAt` is set and `createRevaccinationTask` is not `false`, backend creates or updates one linked `Task` with `taskType=revaccination`.
- The revaccination task can be assigned by `revaccinationAssigneeId` or `revaccinationAssigneeRoleCode`; both cannot be used together.
- If revaccination date is cleared or `createRevaccinationTask=false`, an open linked revaccination task is cancelled, not deleted.

## Notifications and client portal foundation

Notifications are local-first. CRM writes outgoing messages to `NotificationOutbox` in PostgreSQL. The dispatcher processes only the `MESSENGER` channel, asks the isolated owner gateway to choose a linked MAX or Telegram account, and records the actual channel, attempts, delivery time and error. If internet is unavailable, the message remains local and is retried with a bounded delay. SMS, email and push remain placeholders and are not dispatched.

Current channels: `INTERNAL`, `MESSENGER`, `TELEGRAM`, `MAX`, `SMS`, `EMAIL`, `PUSH`.

Vaccination reminders use `MESSENGER` and create deduplicated queue entries 7 days and 1 day before the revaccination date. Existing vaccinations stay opted out until an employee enables owner reminders.

Current outbox statuses: `QUEUED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED`.

Owner cards can store communication preferences:

- `preferredNotificationChannel`
- `telegramChatId`
- `maxUserId`
- `allowSms`, `allowTelegram`, `allowMax`, `allowEmail`

Client portal access is stored separately in `ClientPortalAccess`. Staff can disable, enable, invite or block access. Invite tokens are returned only once from the API and stored in the database as SHA-256 hash.

Portal invitations are channel-aware:

- `POST /api/v1/notifications/owners/:ownerId/portal-invites` with `channel=MAX`, `TELEGRAM` or `WEB` creates a new 24-hour invitation and invalidates the previous invitation link.
- MAX or Telegram is recorded as the owner's preferred notification channel only after the owner has chosen it.
- `CLIENT_PORTAL_ONLINE_REQUESTS_ENABLED` defaults to `false`; owner-cabinet online booking stays unavailable until explicitly enabled in a later release.

Public owner-gateway flow:

- The separate `apps/owner-gateway` service has its own PostgreSQL schema and never connects to the clinic database.
- The local CRM only makes outbound requests when both `OWNER_GATEWAY_URL` and `OWNER_GATEWAY_SYNC_SECRET` are configured. If the gateway is unavailable, clinic workflows continue locally.
- The synchronized snapshot contains only owner-visible fields: patients, appointments without internal comments, completed visits, signed documents, bills and sent external messages.
- `POST /api/v1/notifications/owners/:ownerId/portal-sync` lets a permitted employee refresh this snapshot without creating a new invitation.
- A previously linked MAX or Telegram owner receives a new invitation through the gateway automatically. A first-time owner opens the bot link, and the corresponding protected webhook records the binding.
- Disabling or blocking portal access revokes active gateway invitations and sessions when the gateway is reachable.
- The local CRM API and clinic database port must never be exposed to the internet for MAX webhooks.
- `GET /api/v1/scheduling/resources`
- `GET /api/v1/queue`
- `GET /api/v1/queue/screen`
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
- `GET /api/v1/visits`
- `POST /api/v1/visits`
- `GET /api/v1/visits/:visitId`
- `PATCH /api/v1/visits/:visitId`
- `POST /api/v1/visits/:visitId/start`
- `POST /api/v1/visits/:visitId/complete`
- `POST /api/v1/visits/:visitId/cancel`
- `PUT /api/v1/visits/:visitId/exam`
- `PUT /api/v1/visits/:visitId/recommendation`
- `POST /api/v1/visits/:visitId/diagnoses`
- `PATCH /api/v1/visits/:visitId/diagnoses/:diagnosisId`
- `DELETE /api/v1/visits/:visitId/diagnoses/:diagnosisId`
- `POST /api/v1/visits/:visitId/services`
- `PATCH /api/v1/visits/:visitId/services/:billItemId`
- `DELETE /api/v1/visits/:visitId/services/:billItemId`
- `GET /api/v1/bills`
- `POST /api/v1/bills`
- `GET /api/v1/bills/:billId`
- `POST /api/v1/bills/:billId/cancel`
- `POST /api/v1/bills/:billId/reopen`
- `POST /api/v1/bills/:billId/items`
- `PATCH /api/v1/bills/:billId/items/:billItemId`
- `DELETE /api/v1/bills/:billId/items/:billItemId`
- `GET /api/v1/bills/:billId/payments`
- `POST /api/v1/bills/:billId/payments`
- `POST /api/v1/bills/:billId/payments/:paymentId/refund`
- `GET /api/v1/sales`
- `POST /api/v1/sales`
- `GET /api/v1/sales/:saleId`

All endpoints except `GET /api/health`, `POST /api/auth/login` and `GET /api/v1/queue/screen` require an authenticated active employee session.

Сотрудников создаёт директорский доступ через `POST /api/v1/employees`: у сотрудника обязательно должен быть телефон или email для входа, временный пароль и хотя бы одна роль. Назначение и изменение ролей выполняется через `PATCH /api/v1/employees/:employeeId`; endpoint требует одновременно `employees.manage` и `roles.manage`. Backend запрещает директору заблокировать самого себя и снять с себя права управления сотрудниками и ролями.

Сотрудник меняет собственный пароль через `PATCH /api/auth/password`, передавая текущий пароль и новый пароль. После успешной смены текущая сессия остаётся активной, остальные сессии этого сотрудника закрываются, событие пишется в audit log как `auth.password_change`. Сессии хранятся на сервере через HttpOnly cookie и закрываются при бездействии, по умолчанию через 15 минут (`SESSION_IDLE_TIMEOUT_MINUTES`).

Задачи доступны через `GET /api/v1/tasks` с фильтрами `search`, `status`, `dueFrom`, `dueTo`, `ownerId`, `animalId`, `assigneeId`, `assigneeRoleCode`, `limit`, `offset`. Задачу можно назначить конкретному сотруднику через `assigneeId` или роли через `assigneeRoleCode`, но не обоим одновременно. Статусы: `OPEN`, `DONE`, `CANCELLED`, `ARCHIVED`; действия пишутся в audit log как `task.create`, `task.update`, `task.done`, `task.cancel`, `task.reopen`, `task.archive`.

Владельцы, пациенты, очередь и записи поддерживают поиск и пагинацию через `search`, `limit` и `offset`. Список пациентов также можно фильтровать по `ownerId`.

Очередь можно создать без врача и без существующей карточки владельца, передав первичные данные клиента и пациента. Запись на приём требует существующего владельца и пациента, но сотрудник и кабинет необязательны, поэтому клиника может принять запись "в клинику" до назначения конкретного врача. Интерфейс создания записи может сначала создать владельца и пациента, а затем создать запись с полученными `ownerId` и `animalId`; API записи при этом остаётся строгим.

Из карточки записи frontend может поставить клиента в электронную очередь: если запись ещё `PLANNED`, она сначала переводится в `ARRIVED`, затем создаётся `QueueEntry` с тем же владельцем, пациентом, сотрудником, кабинетом и филиалом.

Публичный экран очереди возвращает только безопасные для второго монитора поля: фамилию клиента, кличку пациента, вид животного для иконки, кабинет, публичное имя сотрудника, срочность, статус очереди, время последнего вызова и количество вызовов. Он не отдаёт телефон, комментарии, карточку владельца, карточку пациента или медицинские данные. Повторный `POST /api/v1/queue/:queueEntryId/start` для уже вызванного клиента обновляет время последнего вызова, увеличивает счётчик и создаёт audit-событие `queue.call`. Очередь можно завершить только через 10 секунд после последнего вызова клиента, чтобы клиент достаточно долго оставался видимым на втором мониторе.

Visits can be opened from an appointment, from a queue entry linked to an existing owner and animal, or directly by owner and animal. A visit stores the examination sheet, diagnoses, recommendations and service lines. Service lines create or update the visit bill and keep `Visit.totalAmount` synchronized with the bill total.

Bills support manual creation, visit-linked billing and sale-linked billing. Bill items can reference services/products or use a manual title and price. Payment acceptance is separated from bill editing through `payments.manage`; bill status is recalculated as `UNPAID`, `PARTIAL` or `PAID`, overpayment is rejected, and refunds are recorded as negative payment rows.

Sales are separate retail transactions outside a clinical visit. `POST /api/v1/sales` creates a sale and its linked bill with `source=SALE`; payment is then accepted through the bill payment endpoints. Stock write-off from sales is intentionally not automatic yet because batch selection rules must be defined first.

Use `npm run api:e2e` for repeatable local verification of RBAC, status flows, E2E workflows and audit log coverage.

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
