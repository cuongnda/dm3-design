# Stage 1: Build React SPA with Turborepo
FROM node:22-alpine AS builder

WORKDIR /workspace

# ── Manifests first ─────────────────────────────────────────────────────────
# Copy ONLY the package manifests so the `npm install` layer below is cached
# when source files change. The lockfile is still copied in so Docker's layer
# hash tracks it — we delete it inside the RUN so the fresh linux/musl install
# doesn't trip over a lockfile generated on macOS dev machines.
COPY package.json package-lock.json turbo.json ./
COPY packages/ui/package.json          ./packages/ui/package.json
COPY packages/api-client/package.json  ./packages/api-client/package.json
COPY apps/console/package.json         ./apps/console/package.json

# ── Install deps ────────────────────────────────────────────────────────────
# This layer only invalidates when a manifest above changes — unchanged source
# edits now reuse the cache and skip the multi-minute npm install.
RUN rm -f package-lock.json && npm install --include=dev --force --no-optional

# Explicitly install musl-compatible native binaries
RUN npm install @rollup/rollup-linux-x64-musl lightningcss-linux-x64-musl --force 2>/dev/null || true

# ── Source ──────────────────────────────────────────────────────────────────
# Copy source AFTER deps — source-only changes invalidate the build layer
# but not the (much more expensive) install layer.
COPY packages/ ./packages/
COPY apps/console/ ./apps/console/

# Build: vite build from console dir, with NODE_PATH to find hoisted deps
ENV NODE_PATH=/workspace/node_modules
RUN cd apps/console && npx vite build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy SPA build output
COPY --from=builder /workspace/apps/console/dist /usr/share/nginx/html

# Copy nginx SPA config
COPY apps/console/nginx.conf /etc/nginx/conf.d/default.conf

# Runtime config.js is injected by the entrypoint script
COPY apps/console/docker-entrypoint.sh /docker-entrypoint.d/40-config-js.sh
RUN chmod +x /docker-entrypoint.d/40-config-js.sh

EXPOSE 80
