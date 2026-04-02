# DM3 Offline Installation Guide

## System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 20.04+ / Debian 11+ / CentOS 8+ | Ubuntu 22.04 LTS |
| Docker | 24.0+ | Latest stable |
| Docker Compose | v2.20+ (plugin) | Latest stable |
| RAM | 4 GB | 8 GB+ |
| CPU | 2 cores | 4 cores+ |
| Disk | 20 GB free | 50 GB+ SSD |

---

## Quick Install

### 1. Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and log back in for group changes to take effect
```

### 2. Extract the installation package

```bash
tar -xzf dm3-installer-*.tar.gz
cd dm3-installer-*/
```

### 3. Run the installer

```bash
sudo bash install.sh
```

The installer will automatically:
- Load all Docker images from `.tar` files
- Copy configuration files to `/opt/dm3`
- Open the `.env` file for you to edit
- Start all selected services

### Installer Options

```bash
# Install to a custom directory
sudo bash install.sh --install-dir /srv/dm3

# Only load Docker images (don't install or start)
sudo bash install.sh --load-only

# Install files but don't start services yet
sudo bash install.sh --no-start
```

---

## Environment Configuration

After installation, edit the `.env` file to set your passwords and secrets:

```bash
nano /opt/dm3/.env
```

### Required Variables

| Variable | Description | How to Generate |
|---|---|---|
| `DB_PASSWORD` | Database password | Use a strong password (16+ chars) |
| `JWT_SECRET` | JWT signing key (≥32 chars) | `openssl rand -hex 64` |
| `BOOTSTRAP_SECRET` | Device bootstrap key | Use a strong random string |
| `MINIO_ROOT_PASSWORD` | MinIO storage password | Use a strong password |

### Optional Variables

| Variable | Default | Description |
|---|---|---|
| `DB_NAME` | `dm3` | Database name |
| `DB_USER` | `dm3` | Database username |
| `API_URL` | `https://dm3-api.demasterpro.com` | API URL for frontend |
| `MQTT_WS_URL` | `wss://dm3-mqtt.demasterpro.com/mqtt` | MQTT WebSocket URL |
| `CORS_ORIGIN` | `https://dm3.demasterpro.com` | Allowed CORS origin |

> **⚠ IMPORTANT:** You MUST change all `CHANGE_ME` values before starting services in production!

---

## Service Management

### Check status

```bash
cd /opt/dm3
docker compose ps
```

### View logs

```bash
# All services
docker compose logs -f --tail=100

# Specific service
docker compose logs -f auth-svc
docker compose logs -f device-gateway
```

### Restart services

```bash
# All services
docker compose restart

# Single service
docker compose restart auth-svc
```

### Stop all services

```bash
docker compose down
```

### Start all services

```bash
docker compose up -d
```

---

## Health Checks

```bash
# Webapp
curl http://localhost:80

# Backend services (adjust ports as needed)
curl http://localhost:8005/healthz    # auth-svc
curl http://localhost:8004/healthz    # identity-svc
curl http://localhost:8003/healthz    # access-svc
curl http://localhost:8002/healthz    # device-gateway
```

---

## SSL / TLS Setup

### Option 1: Let's Encrypt (recommended for public servers)

```bash
# Install certbot
sudo apt install -y certbot

# Request certificate
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d your-domain.com \
  -d api.your-domain.com \
  --email admin@your-domain.com --agree-tos

# Update nginx config to enable SSL blocks
nano /opt/dm3/config/nginx/nginx.conf

# Restart nginx
docker compose restart nginx
```

### Option 2: Self-signed certificate (for testing / internal use)

```bash
mkdir -p /opt/dm3/config/nginx/ssl

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /opt/dm3/config/nginx/ssl/server.key \
  -out /opt/dm3/config/nginx/ssl/server.crt

# Update nginx.conf to reference the cert, then restart
docker compose restart nginx
```

### Option 3: Custom certificate

Place your `.crt` and `.key` files in `/opt/dm3/config/nginx/ssl/`, then update `nginx.conf` accordingly.

---

## System Architecture

```
Internet
  │
  ▼
nginx (port 80/443)
  ├── /                         → webapp (Web Dashboard)
  ├── /api/v1/auth              → auth-svc
  ├── /api/v1/users             → auth-svc
  ├── /api/v1/roles             → auth-svc
  ├── /api/v1/devices           → device-gateway
  ├── /api/v1/persons           → identity-svc
  ├── /api/v1/groups            → identity-svc
  ├── /api/v1/doors             → access-svc
  ├── /api/v1/rules             → access-svc
  ├── /api/v1/events            → access-svc
  └── /ws/                      → device-gateway (WebSocket)

Internal network (dm3-internal):
  ├── timescaledb:5432   (PostgreSQL + TimescaleDB)
  ├── emqx:1883          (MQTT Broker)
  ├── nats:4222          (Message Bus)
  ├── valkey:6379        (Cache)
  └── minio:9000         (Object Storage)
```

---

## Troubleshooting

### Service won't start

```bash
# Check logs for the failing service
docker compose logs <service-name>

# Check health status
docker inspect --format='{{.State.Health.Status}}' dm3-<service-name>
```

### Database connection refused

```bash
# Check if TimescaleDB is ready
docker compose logs timescaledb
docker exec dm3-timescaledb pg_isready -U dm3
```

### MQTT connection failed

```bash
# Check EMQX status
docker exec dm3-emqx emqx ctl status
```

### Disk space issues

```bash
# Check Docker disk usage
docker system df

# Clean up unused images and containers
docker system prune -a
```

### Full reset (WARNING: destroys all data)

```bash
cd /opt/dm3
docker compose down -v    # Removes all volumes = all data!
docker compose up -d
```

---

## Upgrading

When you receive a new installation package:

```bash
# 1. Stop current services
cd /opt/dm3
docker compose down

# 2. Extract the new package
cd /tmp
tar -xzf dm3-installer-v*.tar.gz
cd dm3-installer-*/

# 3. Load new Docker images only
sudo bash install.sh --load-only

# 4. Update compose file (keep your existing .env)
cp docker-compose.yml /opt/dm3/docker-compose.yml
cp -r config/ /opt/dm3/

# 5. Start services with new images
cd /opt/dm3
docker compose up -d
```

---

## Support

- **Company**: Duali Vietnam
- **Product**: Duall Master 3.0
- **Email**: support@duali.com
