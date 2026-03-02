# ── Frontend (Nuxt 3 SPA) ─────────────────────────────────────────────────────
# Multi-stage: build the SPA → serve with lightweight nginx

# Stage 1 — build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# API base URL — empty so the SPA uses relative /api/* paths.
# nginx (in this image) reverse-proxies /api/* → middleware at runtime.
# No IP address is ever baked into the image.
ARG NUXT_PUBLIC_API_BASE=
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
