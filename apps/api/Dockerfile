FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY prisma prisma
RUN npm --workspace @clinic-crm/api run db:generate

COPY apps/api apps/api
RUN npm --workspace @clinic-crm/api run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev

COPY prisma prisma
RUN npm --workspace @clinic-crm/api run db:generate

COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh

EXPOSE 4000

CMD ["sh", "apps/api/docker-entrypoint.sh"]
