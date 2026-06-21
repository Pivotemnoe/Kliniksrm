# Web App

React/Vite frontend for Clinic CRM.

## Stack

- React
- Vite
- TypeScript
- Ant Design
- TanStack Query
- React Hook Form
- Zod

## Local Run

```bash
npm install
npm --workspace @clinic-crm/web run dev
```

Default local URL:

- `http://127.0.0.1:3000`

Default backend URL:

- `VITE_API_BASE_URL=http://127.0.0.1:4000/api`

Auth uses backend HttpOnly cookie sessions. The frontend does not store auth tokens in `localStorage`.

The current audited UI prototype still lives in the root `public/` folder until it is migrated into this app.

## Docker

Production-like container:

```bash
docker compose build web
docker compose up -d web
```

The web container uses Nginx, serves the built React app and proxies `/api` to the API container. Build-time defaults:

- `VITE_API_BASE_URL=/api`
- `VITE_AUTH_MODE=protected`
- `VITE_IDLE_LOGOUT_MINUTES=15`
