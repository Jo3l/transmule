# ── TransMule — Combined app image ────────────────────────────────────────────
# Builds the frontend SPA and the Nitro middleware, then packages both into a
# single image:
#   • nginx  (port 3001) — serves the Nuxt SPA + proxies /api/* → Nitro
#   • Nitro  (port 3000) — listens on 127.0.0.1 only (not exposed externally)
#   • supervisord — keeps both processes running
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build frontend ────────────────────────────────────────────────
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm AS fe-builder
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN set -eux; \
  npm ci --no-audit --no-fund || npm ci --no-audit --no-fund

COPY frontend/ .

# Empty = relative /api/* paths; nginx proxies them to 127.0.0.1:3000
ARG NUXT_PUBLIC_API_BASE=
ENV NUXT_PUBLIC_API_BASE=${NUXT_PUBLIC_API_BASE}

RUN npm run generate

# ── Stage 2: build middleware ──────────────────────────────────────────────
# node:sqlite is built into Node 22 — no native compilation needed.
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm AS mw-builder
WORKDIR /app

COPY middleware/package.json middleware/package-lock.json ./
RUN set -eux; \
  npm ci --no-audit --no-fund || npm ci --no-audit --no-fund

COPY middleware/ .
RUN npm run build

# ── Stage 3: final image ───────────────────────────────────────────────────
# Use Debian (glibc) so better-sqlite3's native addon can resolve
# glibc symbols like fcntl64 that musl/Alpine doesn't provide.
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm
WORKDIR /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends nginx supervisor unar zip tar ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /var/log/supervisor /var/log/nginx /run/nginx /app/data && \
    chmod 777 /app/data

# ── Middleware artefacts ───────────────────────────────────────────────────
COPY --from=mw-builder /app/.output                           .output
COPY --from=mw-builder /app/node_modules                      node_modules

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
