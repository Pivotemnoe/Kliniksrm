# Repository Setup

## Current status

This repository is the working production repository for the clinic CRM.

The current application in `public/` is a functional prototype based on the audited Vet.AF workflows. The production implementation should be migrated into the selected stack:

- `apps/web` for React/Vite/TypeScript frontend;
- `apps/api` for NestJS backend;
- `packages/shared` for shared schemas and types;
- `prisma` for database schema and migrations;
- `infra` for Docker Compose, Nginx and deployment files;
- `docs` for product, architecture and operational documentation.

## Repository principles

- Keep MVP scope in `docs/MVP.md`.
- Keep stack decisions in `docs/STACK.md`.
- Keep production code separated from prototype code.
- Do not connect live CRM credentials or real patient data to the repository.
- Do not commit `.env` files.
- Do not store uploaded medical documents directly in git.
- Every important data change in the application should create an audit event.

## Production tree

```text
clinic-crm/
  apps/
    web/
    api/
  packages/
    shared/
  infra/
    docker/
    nginx/
  prisma/
  docs/
  docker-compose.yml
  README.md
```

The production directories are created now. Each empty implementation area has a small README until real code is added.

The root `docker-compose.yml` starts local infrastructure services:

- PostgreSQL;
- Redis;
- MinIO.

API, web and worker containers should be added after their production apps are scaffolded.
