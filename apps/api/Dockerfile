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
ARG TEMICHEVVET_GIT_COMMIT=local
ARG TEMICHEVVET_BUILD_DATE=unknown
ARG TEMICHEVVET_IMAGE_SOURCE=local
ENV NODE_ENV=production
ENV TEMICHEVVET_GIT_COMMIT=$TEMICHEVVET_GIT_COMMIT
ENV TEMICHEVVET_BUILD_DATE=$TEMICHEVVET_BUILD_DATE
ENV TEMICHEVVET_IMAGE_SOURCE=$TEMICHEVVET_IMAGE_SOURCE

LABEL org.opencontainers.image.title="TemichevVet CRM API"
LABEL org.opencontainers.image.revision=$TEMICHEVVET_GIT_COMMIT
LABEL org.opencontainers.image.created=$TEMICHEVVET_BUILD_DATE
LABEL org.opencontainers.image.source=$TEMICHEVVET_IMAGE_SOURCE

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
