# ── TransMule — Combined app image ────────────────────────────────────────────
# Builds the frontend SPA and the Nitro middleware, then packages both into a
# single image:
#   • nginx  (port 3001) — serves the Nuxt SPA + proxies /api/* → Nitro
#   • Nitro  (port 3000) — listens on 127.0.0.1 only (not exposed externally)
#   • supervisord — keeps both processes running
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build frontend ────────────────────────────────────────────────
FROM node:22-alpine AS fe-builder
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .

# Empty = relative /api/* paths; nginx proxies them to 127.0.0.1:3000
ARG NUXT_PUBLIC_API_BASE=
ENV NUXT_PUBLIC_API_BASE=${NUXT_PUBLIC_API_BASE}

RUN npm run generate

# ── Stage 2: build middleware ──────────────────────────────────────────────
FROM node:22-alpine AS mw-builder
WORKDIR /app

# Build tools required to compile better-sqlite3 from source on Alpine/musl.
# Prebuilt binaries are glibc-only; building from source is required here.
RUN apk add --no-cache python3 make g++ sqlite-dev

COPY middleware/package.json middleware/package-lock.json ./
# Force native modules to build from source (avoids glibc prebuilt on musl)
RUN npm_config_build_from_source=true npm ci

COPY middleware/ .
RUN npm run build

# ── Stage 3: final image ───────────────────────────────────────────────────
# Use Debian slim (glibc) so better-sqlite3's native addon can resolve
# glibc symbols like fcntl64 that musl/Alpine doesn't provide.
FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends nginx supervisor libsqlite3-0 && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /var/log/supervisor /var/log/nginx /run/nginx /app/data

# ── Middleware artefacts ───────────────────────────────────────────────────
COPY --from=mw-builder /app/.output                           .output
COPY --from=mw-builder /app/node_modules/better-sqlite3       node_modules/better-sqlite3
COPY --from=mw-builder /app/node_modules/bindings             node_modules/bindings
COPY --from=mw-builder /app/node_modules/prebuild-install     node_modules/prebuild-install
COPY --from=mw-builder /app/node_modules/file-uri-to-path     node_modules/file-uri-to-path
COPY --from=mw-builder /app/node_modules/amule-ec-client      node_modules/amule-ec-client
COPY --from=mw-builder /app/node_modules/node-7z               node_modules/node-7z
COPY --from=mw-builder /app/node_modules/7zip-bin              node_modules/7zip-bin
COPY --from=mw-builder /app/node_modules/node-unrar-js         node_modules/node-unrar-js
COPY --from=mw-builder /app/node_modules/lodash.defaultto      node_modules/lodash.defaultto
COPY --from=mw-builder /app/node_modules/lodash.defaultsdeep   node_modules/lodash.defaultsdeep
COPY --from=mw-builder /app/node_modules/lodash.flattendeep    node_modules/lodash.flattendeep
COPY --from=mw-builder /app/node_modules/lodash.isempty        node_modules/lodash.isempty
COPY --from=mw-builder /app/node_modules/lodash.negate         node_modules/lodash.negate
COPY --from=mw-builder /app/node_modules/normalize-path        node_modules/normalize-path
COPY --from=mw-builder /app/node_modules/split2                node_modules/split2
COPY --from=mw-builder /app/node_modules/debug                 node_modules/debug
COPY --from=mw-builder /app/node_modules/ms                    node_modules/ms

# ── Frontend artefacts ─────────────────────────────────────────────────────
RUN rm -rf /usr/share/nginx/html/*
COPY --from=fe-builder /app/.output/public  /usr/share/nginx/html

# nginx site config (SPA + /api/* proxy to loopback Nitro)
# Debian nginx uses conf.d/ (not Alpine's http.d/)
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Process supervisor config
COPY supervisord.conf /etc/supervisord.conf

# Entrypoint: auto-generates secrets if not provided, then starts supervisord
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME /app/data

ENV NODE_ENV=production
# Nitro binds to loopback — not reachable from outside the container
ENV NITRO_HOST=127.0.0.1
ENV NITRO_PORT=3000

# Only the nginx port is exposed; Nitro is internal
EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
