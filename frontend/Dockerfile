# syntax=docker/dockerfile:1
FROM node:22.23.1-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend ./frontend
RUN npm run build

FROM caddy:2-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/frontend/dist /srv
