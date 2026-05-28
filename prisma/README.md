# Prisma

Prisma schema and migrations will live here.

The first schema should be derived from `docs/MVP.md` and include owners, animals, queue, appointments, visits, billing, stock, documents, users, roles and audit logs.

## Commands

From the repository root:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Inside Docker, migrations are applied automatically before the API starts.
