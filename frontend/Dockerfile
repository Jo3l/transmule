# ── Frontend (Nuxt 3 SPA) ─────────────────────────────────────────────────────
# Multi-stage: build the SPA → serve with lightweight nginx

# Stage 1 — build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The API base URL is baked into the SPA at build time.
# In Docker the browser still talks to the middleware via the host-mapped port,
# but we use a relative path so it works behind any reverse proxy.
ARG NUXT_PUBLIC_API_BASE=http://localhost:3000
ENV NUXT_PUBLIC_API_BASE=${NUXT_PUBLIC_API_BASE}

RUN npm run generate

# Stage 2 — serve static files
FROM nginx:alpine

# Remove default site
RUN rm -rf /usr/share/nginx/html/*

# Copy generated SPA
COPY --from=builder /app/.output/public /usr/share/nginx/html

# SPA fallback: all routes → index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3001

CMD ["nginx", "-g", "daemon off;"]
