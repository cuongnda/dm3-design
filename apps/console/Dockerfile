# Stage 1: Build React SPA with Turborepo
FROM node:22-alpine AS builder

WORKDIR /workspace

# Copy root package files for workspace resolution
COPY package.json package-lock.json turbo.json ./

# Copy all package manifests so npm ci can resolve workspaces
COPY packages/ui/package.json          ./packages/ui/package.json
COPY packages/api-client/package.json  ./packages/api-client/package.json
COPY apps/console/package.json         ./apps/console/package.json

RUN npm ci

# Copy full source
COPY packages/ ./packages/
COPY apps/console/ ./apps/console/

# Build only console (turbo handles workspace deps in correct order)
RUN npx turbo build --filter=@dm3/console

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
