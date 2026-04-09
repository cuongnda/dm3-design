# DM3 Deployment Guide

Target server: `demo.demasterpro.com`
Deploy directory: `/home/gitlab-runner/dm3/`

---

## First-Time Server Setup

### 1. Install Docker + Docker Compose

```sh
# Docker Engine
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker gitlab-runner

# Verify
docker --version
docker compose version
```

### 2. Clone the repository

```sh
sudo -u gitlab-runner bash
cd ~
git clone git@gitlab.com:YOUR_GROUP/dm3.git dm3
cd dm3
```

### 3. Create the `.env` file

```sh
cp .env.example .env
nano .env   # Fill in all CHANGE_ME values
```

Place the same `.env` at `/home/gitlab-runner/.env.dm3` so the CI runner can find it:

```sh
cp .env /home/gitlab-runner/.env.dm3
chmod 600 /home/gitlab-runner/.env.dm3
```

### 4. Register the GitLab runner

If not already registered:

```sh
sudo gitlab-runner register \
  --url https://gitlab.com \
  --token YOUR_PROJECT_RUNNER_TOKEN \
  --executor shell \
  --description "dm3-server" \
  --tag-list "dm3-server"
```

---

## DNS Configuration

Create the following A records pointing to `demo.demasterpro.com`'s IP:

| Subdomain                     | Type | Value            |
|-------------------------------|------|------------------|
| `dm3.demasterpro.com`         | A    | `<server IP>`    |
| `dm3-api.demasterpro.com`     | A    | `<server IP>`    |
| `dm3-mqtt.demasterpro.com`    | A    | `<server IP>`    |
| `dm3-minio.demasterpro.com`   | A    | `<server IP>`    |

---

## Adding SSL with Certbot

### 1. Install certbot

```sh
sudo apt install -y certbot python3-certbot-nginx
# or on alpine/RHEL: use snap / other method
```

### 2. Obtain certificates (HTTP-01 challenge via nginx)

Ensure nginx is running with port 80 open, then:

```sh
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d dm3.demasterpro.com \
  -d dm3-api.demasterpro.com \
  -d dm3-mqtt.demasterpro.com \
  -d dm3-minio.demasterpro.com \
  --email admin@duali.com --agree-tos --non-interactive
```

### 3. Enable SSL in nginx.conf

In `deploy/nginx/nginx.conf`, uncomment all `# SSL placeholder` blocks in each server block, then reload nginx:

```sh
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### 4. Auto-renewal

```sh
sudo crontab -e
# Add:
0 3 * * * certbot renew --quiet && docker compose -f /home/gitlab-runner/dm3/docker-compose.prod.yml exec nginx nginx -s reload
```

---

## Manual Deploy

```sh
cd /home/gitlab-runner/dm3
git pull origin develop
cp /home/gitlab-runner/.env.dm3 .env
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

Check logs:

```sh
docker compose -f docker-compose.prod.yml logs -f --tail=100
```

---

## Rollback Procedure

### Option A — Roll back to previous Git commit

```sh
cd /home/gitlab-runner/dm3
git log --oneline -10          # Find the commit to roll back to
git checkout <commit-sha>
cp /home/gitlab-runner/.env.dm3 .env
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

### Option B — Re-deploy a specific tag

```sh
git fetch --tags
git checkout v1.2.3
cp /home/gitlab-runner/.env.dm3 .env
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

Return to tracking develop when ready:

```sh
git checkout develop && git pull
```

---

## Service Health Checks

```sh
# All services
docker compose -f docker-compose.prod.yml ps

# Individual health
curl https://dm3-api.demasterpro.com/api/v1/auth/healthz    # auth-svc  (returns via nginx)
curl http://localhost:8005/healthz                           # auth-svc  (direct)
curl http://localhost:8004/healthz                           # identity-svc
curl http://localhost:8003/healthz                           # access-svc
curl http://localhost:8002/healthz                           # device-gateway
curl http://localhost:8001/healthz                           # audit-svc
```

---

## Architecture Overview

```
Internet
  │
  ▼
nginx (port 80/443)
  ├── dm3.demasterpro.com           → webapp (nginx:alpine SPA)
  ├── dm3-api.demasterpro.com
  │     ├── /api/v1/auth            → auth-svc:8005
  │     ├── /api/v1/system          → auth-svc:8005
  │     ├── /api/v1/users           → auth-svc:8005
  │     ├── /api/v1/roles           → auth-svc:8005
  │     ├── /api/v1/system/devices  → device-gateway:8002
  │     ├── /api/v1/devices         → device-gateway:8002
  │     ├── /ws/                    → device-gateway:8002 (WS)
  │     ├── /api/v1/users         → identity-svc:8004
  │     ├── /api/v1/groups          → identity-svc:8004
  │     ├── /api/v1/doors           → access-svc:8003
  │     ├── /api/v1/rules           → access-svc:8003
  │     ├── /api/v1/events          → access-svc:8003
  │     ├── /api/v1/schedules       → access-svc:8003
  │     ├── /api/v1/stats           → access-svc:8003
  │     └── /api/v1/audit           → audit-svc:8001
  ├── dm3-mqtt.demasterpro.com/mqtt → emqx:8083 (WS)
  └── dm3-minio.demasterpro.com     → minio:9001 (console)

Internal network (dm3-internal) — not exposed:
  timescaledb:5432, nats:4222, valkey:6379, emqx:1883
```
