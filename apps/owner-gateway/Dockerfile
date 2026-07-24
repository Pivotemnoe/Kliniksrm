FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/owner-gateway/package.json apps/owner-gateway/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --workspace @clinic-crm/owner-gateway --include-workspace-root=false

COPY apps/owner-gateway apps/owner-gateway
RUN npm --workspace @clinic-crm/owner-gateway run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV OWNER_GATEWAY_PORT=4100

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/owner-gateway/package.json apps/owner-gateway/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev --ignore-scripts --workspace @clinic-crm/owner-gateway --include-workspace-root=false

COPY --from=build /app/apps/owner-gateway/dist apps/owner-gateway/dist
COPY apps/owner-gateway/prisma apps/owner-gateway/prisma
COPY certs/russian_trusted_root_ca.pem certs/russian_trusted_root_ca.pem

ENV NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_root_ca.pem

EXPOSE 4100

CMD ["node", "apps/owner-gateway/dist/main.js"]
