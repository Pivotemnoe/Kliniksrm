# Developer Runbook

## Local URLs

- Frontend prototype: `http://127.0.0.1:3000`
- API health: `http://127.0.0.1:4000/api/health`
- Swagger UI: `http://127.0.0.1:4000/api/docs`
- MinIO console: `http://127.0.0.1:9001`

## Start Local CRM

Production-like local server:

```bash
docker compose build api web
docker compose up -d postgres redis minio api web
```

Open CRM at `http://127.0.0.1:3000`. The web container serves the built React app through Nginx and proxies `/api` to the API container.

For access from other workstations inside the clinic LAN, set:

```bash
WEB_BIND_ADDR=0.0.0.0
WEB_PORT=3000
APP_URL=http://SERVER_LAN_IP:3000
```

Development mode:

```bash
docker compose build api
docker compose up -d postgres redis minio api
npm run web:dev
```

The API container runs Prisma migrations and seed on start while `SEED_ON_START=true`.

## Локальная установка в клинике

Целевой production-режим для небольшой клиники: один локальный компьютер или мини-сервер внутри клиники запускает PostgreSQL, Redis, MinIO, backend и frontend. Рабочие места врачей и администраторов открывают CRM по локальному адресу сервера, поэтому очередь, приёмы, счета, склад и стационар продолжают работать при пропадании интернета.

Интернет считается внешней интеграцией, а не обязательным условием работы CRM. Его используют только:

- Telegram, MAX, SMS, email и другие API-каналы уведомлений;
- онлайн-запись и личный кабинет клиента, если они доступны извне;
- обновления, backup во внешнее хранилище и удалённая поддержка.

Исходящие уведомления должны идти через внутреннюю очередь: событие создаётся локально, затем worker отправляет его во внешний канал. При отсутствии интернета запись остаётся в очереди со статусом ошибки или ожидания и повторяется позже.

Для удалённого доступа директора или клиентов предпочтительнее отдельный домен через VPN/reverse proxy, а не прямое открытие всех внутренних сервисов наружу.

Текущая backend-основа:

- `NotificationOutbox` хранит исходящие сообщения локально.
- `NotificationTemplate` хранит шаблоны по каналу и событию.
- `Owner` хранит предпочтения связи и внешние идентификаторы Telegram/MAX.
- `ClientPortalAccess` хранит состояние доступа владельца к личному кабинету.
- Реальная отправка в Telegram/MAX/SMS пока не включена; для неё нужен отдельный worker и токены провайдеров.

## Test Logins

Local development seed creates these employees when `SEED_TEST_DATA=true`. This is enabled by default outside `NODE_ENV=production`.

| Role | Login | Password |
| --- | --- | --- |
| Director | `+70000000001` | `ChangeMe123!` |
| Administrator | `+70000000002` | `TestPass123!` |
| Doctor | `+70000000003` | `TestPass123!` |
| Assistant | `+70000000004` | `TestPass123!` |
| Cashier | `+70000000005` | `TestPass123!` |
| Stock | `+70000000006` | `TestPass123!` |

Production must set `BOOTSTRAP_DIRECTOR_PASSWORD` explicitly and must not enable test seed data.

## Сотрудники и доступы

Директор добавляет сотрудников в разделе `Сотрудники`: указывает ФИО, телефон или email для входа, должность, временный пароль и роли доступа. Роли можно менять только пользователю с правами `employees.manage` и `roles.manage`. Backend дополнительно не даёт директору заблокировать самого себя или снять с себя права управления сотрудниками и ролями.

Сотрудник меняет свой пароль в разделе `Профиль`. Для смены нужен текущий пароль; после успешной смены текущая сессия остаётся активной, остальные сессии этого сотрудника закрываются.

Сессия сотрудника хранится на сервере через HttpOnly cookie. При бездействии frontend вызывает logout, а backend также ограничивает idle-сессию; локальное значение по умолчанию 15 минут.

## Verification

Run the API verification suite after the API is up:

```bash
npm run api:e2e
```

The script checks:

- RBAC for every protected endpoint;
- status flows for queue, appointments, visits and bills;
- E2E scenarios from owner/patient to payment;
- document template and visit document create/update flow;
- queue cancellation;
- appointment cancellation;
- refund;
- manual bill without a visit;
- audit log coverage for login, owner/patient, queue, appointment, visit, visit documents, bill, payment and refund.

The script creates temporary data marked with `e2e-smoke` and cleans it from the local database.

## Backup

Create a full local backup for the clinic server:

```bash
npm run backup:local
```

The archive is written to `backups/temichevvet-local-YYYYMMDD-HHMMSS.tar.gz` and contains:

- `postgres.dump` — PostgreSQL custom-format dump;
- `redis-dump.rdb` — Redis snapshot for queues and short-lived runtime state;
- `minio-data/` — local MinIO file storage data.

Create only a PostgreSQL custom-format dump:

```bash
npm run backup:postgres
```

The backup is written to `backups/clinic-crm-YYYYMMDD-HHMMSS.dump`.

Restore example:

```bash
docker exec -i clinic-crm-postgres pg_restore -U clinic_crm -d clinic_crm --clean --if-exists < backups/clinic-crm-YYYYMMDD-HHMMSS.dump
```

Run restore only against a database that may be overwritten.

Validate a full local restore archive without overwriting data:

```bash
npm run restore:local -- backups/temichevvet-local-YYYYMMDD-HHMMSS.tar.gz
```

Restore PostgreSQL and MinIO from the full local archive:

```bash
CONFIRM_RESTORE=YES npm run restore:local -- backups/temichevvet-local-YYYYMMDD-HHMMSS.tar.gz
```

Restore Redis queue state too only when it is necessary:

```bash
CONFIRM_RESTORE=YES RESTORE_REDIS=true npm run restore:local -- backups/temichevvet-local-YYYYMMDD-HHMMSS.tar.gz
```

`restore:local` stops `api` and `web` before restoring data, then starts the local services again. Run it only against a local server whose current data may be overwritten.
