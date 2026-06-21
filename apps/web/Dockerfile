FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=/api
ARG VITE_AUTH_MODE=protected
ARG VITE_IDLE_LOGOUT_MINUTES=15

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_AUTH_MODE=$VITE_AUTH_MODE
ENV VITE_IDLE_LOGOUT_MINUTES=$VITE_IDLE_LOGOUT_MINUTES

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY apps/web apps/web

RUN npm --workspace @clinic-crm/web run build

FROM nginx:1.27-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
