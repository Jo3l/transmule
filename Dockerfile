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
# node:sqlite is built into Node 22 — no native compilation needed.
FROM node:22-alpine AS mw-builder
WORKDIR /app

COPY middleware/package.json middleware/package-lock.json ./
RUN npm ci

COPY middleware/ .
RUN npm run build

# ── Stage 3: final image ───────────────────────────────────────────────────
# Use Debian slim (glibc) so better-sqlite3's native addon can resolve
# glibc symbols like fcntl64 that musl/Alpine doesn't provide.
FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends nginx supervisor wget xz-utils ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /var/log/supervisor /var/log/nginx /run/nginx /app/data && \
    chmod 777 /app/data

# ── Middleware artefacts ───────────────────────────────────────────────────
COPY --from=mw-builder /app/.output                           .output
COPY --from=mw-builder /app/node_modules                      node_modules

# ── Full 7-Zip 26.00 binary (replaces bundled p7zip 16.02 stub) ────────────
# The bundled 7za from 7zip-bin is p7zip 16.02 standalone, which does NOT
# support RAR extraction. The official 7-Zip binary (7zz) supports RAR3/RAR5,
# ZIP, 7z, tar and all other formats. We download the upstream binary and
# overwrite the stub so the rest of the code can use sevenBin.path7za as-is.
ARG SEVENZ_VERSION=2600
RUN set -eux; \
    ARCH="$(uname -m)"; \
    case "$ARCH" in \
      x86_64)  PKG="7z${SEVENZ_VERSION}-linux-x64.tar.xz";  BIN_DIR="linux/x64" ;; \
      aarch64) PKG="7z${SEVENZ_VERSION}-linux-arm64.tar.xz"; BIN_DIR="linux/arm64" ;; \
      armv7l)  PKG="7z${SEVENZ_VERSION}-linux-arm.tar.xz";   BIN_DIR="linux/arm" ;; \
      *) echo "Unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    wget -qO /tmp/7z.tar.xz "https://github.com/ip7z/7zip/releases/download/26.00/${PKG}"; \
    tar -xJf /tmp/7z.tar.xz -C /tmp 7zz; \
    mv /tmp/7zz "/app/node_modules/7zip-bin/${BIN_DIR}/7za"; \
    chmod +x "/app/node_modules/7zip-bin/${BIN_DIR}/7za"; \
    rm /tmp/7z.tar.xz

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
