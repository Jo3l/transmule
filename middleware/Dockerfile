# ── Middleware (Nitro.js API) ──────────────────────────────────────────────────
# Multi-stage build: install + build → slim production image

# Stage 1 — build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2 — production
FROM node:22-alpine
WORKDIR /app

# better-sqlite3 needs these at runtime
RUN apk add --no-cache libstdc++

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
