# ── Middleware (Nitro.js API) ──────────────────────────────────────────────────
# Multi-stage build: install + build → slim production image

# Stage 1 — build
FROM node:22-alpine AS builder
WORKDIR /app

# Build tools required to compile better-sqlite3 from source on Alpine/musl.
RUN apk add --no-cache python3 make g++ sqlite-dev

COPY package.json package-lock.json ./
RUN npm_config_build_from_source=true npm ci

COPY . .
RUN npm run build

# Stage 2 — production
FROM node:22-alpine
WORKDIR /app

# better-sqlite3 and libstdc++ runtime deps
# gcompat: glibc compatibility layer for Alpine/musl — provides fcntl64 and
# other glibc symbols required by better-sqlite3's native addon.
RUN apk add --no-cache libstdc++ sqlite-libs gcompat

# Copy built output and the external native modules
COPY --from=builder /app/.output .output
COPY --from=builder /app/node_modules/better-sqlite3 node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings node_modules/bindings
COPY --from=builder /app/node_modules/prebuild-install node_modules/prebuild-install
COPY --from=builder /app/node_modules/file-uri-to-path node_modules/file-uri-to-path
COPY --from=builder /app/node_modules/amule-ec-client node_modules/amule-ec-client

# Data volume for SQLite database
RUN mkdir -p /app/data
VOLUME /app/data

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
