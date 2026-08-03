FROM node:22-alpine AS dependencies

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=2000 --fetch-retry-maxtimeout=30000

FROM dependencies AS build

WORKDIR /workspace

COPY . .

# Prisma resolves datasource configuration while generating the client. These are
# build-only placeholders; runtime credentials come only from Compose secrets.
ENV POSTGRES_DB=build_db
ENV POSTGRES_USER=build_user
ENV POSTGRES_PASSWORD=build_password
ENV POSTGRES_HOST=localhost
ENV POSTGRES_PORT=5432

RUN npm run build

FROM node:22-alpine AS api

WORKDIR /workspace
ENV NODE_ENV=production

COPY --from=build /workspace /workspace

EXPOSE 3000

FROM caddy:2.8-alpine AS web

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/web/dist /srv

EXPOSE 80
