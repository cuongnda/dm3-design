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

Extract into your **home directory** (not `/tmp`). Snap-packaged Docker runs
under strict confinement and cannot read `/tmp`, which makes `docker load`
silently fail with "no such file or directory" on the `.tar` files.

```bash
cd ~
tar -xzf /path/to/dm3-installer-*.tar.gz
cd dm3-installer-*/
```

### 3. Run the installer

```bash
sudo bash install.sh
```

The installer will automatically:
- Load all Docker images from `.tar` files
- Copy configuration files to the install directory (see below)
- **Auto-detect the server's primary IP** and substitute it into `.env`
  (`API_URL`, `APP_URL`, `MQTT_WS_URL`, `CORS_ORIGIN`, `MEDIAMTX_PUBLIC_IP`),
  so a fresh install works on a raw IP out of the box. You can override these
  later with real domain names once DNS + TLS are set up.
- Open the `.env` file for you to edit secrets (`DB_PASSWORD`, `JWT_SECRET`, etc.)
- Start all selected services

**Install directory auto-selection**
- Default: `/opt/dm3`
- If Docker is installed via **snap** (common on Ubuntu), the default switches
  to `$HOME/dm3` automatically because snap Docker cannot read `/opt/`.
- Override either default with `--install-dir /path/to/dir`.

Access URLs after install (with default IP mode):
- Web dashboard: `http://<SERVER_IP>/`
- API: `http://<SERVER_IP>/api/v1/...`
- MQTT over WebSocket: `ws://<SERVER_IP>/mqtt`

> **Note**: The `.env` file is a dotfile and is hidden from `ll` / `ls` without
> `-a`. Use `ls -la` to see it.

### Installer Options

```bash
# Install to a custom directory
sudo bash install.sh --install-dir /srv/dm3

# Only load Docker images (don't install or start)
sudo bash install.sh --load-only

# Install files but don't start services yet
sudo bash install.sh --no-start

# Override auto-detected server IP (multi-NIC, NAT, floating IP, etc.)
sudo bash install.sh --server-ip 203.0.113.42
```

---

## Environment Configuration

After installation, edit the `.env` file to set your passwords and secrets.
Replace `$DM3_DIR` with your install directory — `/opt/dm3` by default, or
`~/dm3` if you're on snap Docker:

```bash
# Pick whichever one applies to your install:
DM3_DIR=/opt/dm3     # or: DM3_DIR=~/dm3
nano $DM3_DIR/.env
```

### Required Variables

| Variable | Description | How to Generate |
|---|---|---|
| `DB_PASSWORD` | Database password | Use a strong password (16+ chars) |
| `JWT_SECRET` | JWT signing key (≥32 chars) | `openssl rand -hex 64` |
| `BOOTSTRAP_SECRET` | Device bootstrap key | `openssl rand -hex 32` |
| `MINIO_ROOT_PASSWORD` | MinIO storage password | Use a strong password |
| `CCTV_CREDENTIAL_KEY` | Encryption key for stored RTSP creds (cctv-svc) | `openssl rand -base64 32` |
| `MEDIAMTX_STREAM_PASS` | MediaMTX stream publish/read password | `openssl rand -hex 24` |
| `MEDIAMTX_API_PASS` | MediaMTX admin API password | `openssl rand -hex 24` |
| `SMTP_PASSWORD` | SMTP password for transactional email | App password from provider |

### Optional Variables

| Variable | Default | Description |
|---|---|---|
| `DB_NAME` | `dm3` | Database name |
| `DB_USER` | `dm3` | Database username |
| `API_URL` | `http://<detected IP>` | API URL for frontend (substituted by installer) |
| `MQTT_WS_URL` | `ws://<detected IP>/mqtt` | MQTT WebSocket URL (substituted by installer) |
| `APP_URL` | `http://<detected IP>` | App URL (used in emails, substituted by installer) |
| `CORS_ORIGIN` | `http://<detected IP>` | Allowed CORS origin (substituted by installer) |
| `MEDIAMTX_PUBLIC_IP` | `<detected IP>` | ICE host for WebRTC (substituted by installer) |

> **⚠ IMPORTANT:** You MUST change all `CHANGE_ME` values before starting services in production!

---

## Service Management

> All commands below run from your install directory. Set this once per shell:
> ```bash
> DM3_DIR=/opt/dm3     # or: DM3_DIR=~/dm3 if using snap Docker
> cd $DM3_DIR
> ```

### Check status

```bash
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
nano $DM3_DIR/config/nginx/nginx.conf

# Restart nginx
docker compose restart nginx
```

### Option 2: Self-signed certificate (for testing / internal use)

```bash
mkdir -p $DM3_DIR/config/nginx/ssl

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout $DM3_DIR/config/nginx/ssl/server.key \
  -out $DM3_DIR/config/nginx/ssl/server.crt

# Update nginx.conf to reference the cert, then restart
docker compose restart nginx
```

### Option 3: Custom certificate

Place your `.crt` and `.key` files in `$DM3_DIR/config/nginx/ssl/`, then update `nginx.conf` accordingly.

---

## System Architecture

```
Internet
  │
  ▼
nginx (port 80/443)
  ├── /                         → webapp (Web Dashboard)
  ├── /api/v1/auth              → auth-svc:8005
  ├── /api/v1/system            → auth-svc:8005
  ├── /api/v1/users (auth)      → auth-svc:8005
  ├── /api/v1/roles             → auth-svc:8005
  ├── /api/v1/system/devices    → device-gateway:8002
  ├── /api/v1/devices           → device-gateway:8002
  ├── /api/v1/users (identity)  → identity-svc:8004
  ├── /api/v1/groups            → identity-svc:8004
  ├── /api/v1/doors             → access-svc:8003
  ├── /api/v1/rules             → access-svc:8003
  ├── /api/v1/events            → access-svc:8003
  ├── /api/v1/schedules         → access-svc:8003
  ├── /api/v1/stats             → access-svc:8003
  ├── /api/v1/audit             → audit-svc:8001
  ├── /api/v1/visitors          → visitor-svc:8006       (plugin)
  ├── /api/v1/parking           → parking-svc:8007       (plugin)
  ├── /api/v1/cctv              → cctv-svc:8008          (plugin)
  ├── /api/v1/attendance        → attend-svc:8010        (plugin)
  ├── /cctv/whep                → mediamtx:8889          (WebRTC)
  ├── /cctv/hls                 → mediamtx:8888          (LL-HLS)
  └── /ws/                      → device-gateway:8002    (WebSocket)

Internal network (dm3-internal):
  ├── timescaledb:5432   (PostgreSQL + TimescaleDB)
  ├── emqx:1883          (MQTT Broker)
  ├── nats:4222          (Message Bus + JetStream)
  ├── valkey:6379        (Cache)
  ├── minio:9000         (Object Storage — S3 API)
  └── mediamtx:9997      (RTSP/WebRTC control API, cctv-svc only)
```

### Plugin-gated services

`visitor-svc`, `parking-svc`, `cctv-svc`, and `attend-svc` are plugin-gated
per tenant via the company's `plugins[]` configuration. The containers run,
but RBAC and route registration in `auth-svc` only expose them to tenants
whose plugin list contains the matching flag (e.g. `cctv`, `visitor`). If a
tenant doesn't have the plugin enabled, those `/api/v1/...` routes return
403. `cctv-svc` additionally requires `mediamtx` for live streams and clips.

---

## Troubleshooting

### `docker load`: "open .../<file>.tar: no such file or directory"

Cause: **Docker is installed via snap**. Snap confinement blocks reads from
`/tmp` and `/opt`. The `docker` CLI can't see the `.tar` files even though
`ls` can.

Fix: install from the user's home directory instead.

```bash
# Check whether your Docker is snap-packaged
readlink -f "$(command -v docker)"
# If output starts with /snap/, move the installer to ~ and rerun:
mv /tmp/dm3-installer-*  ~/
cd ~/dm3-installer-*
sudo bash install.sh
```

If `/opt/dm3` was already created by a previous run:
```bash
sudo mv /opt/dm3 ~/dm3
sudo chown -R $USER:$USER ~/dm3
cd ~/dm3 && docker compose up -d
```

(The v1.0.3+ installer detects snap Docker automatically and picks `~/dm3` as
the default install dir.)

### Installer exits silently after "Loading Docker images..."

If you're running v1.0.1 or v1.0.2, there's a `set -e` + `((count++))` bug
that kills the script before the first `docker load`. Patch in place:

```bash
sudo sed -i 's/((count++))/count=$((count+1))/' install.sh
```

Fixed in v1.0.3+.

### `docker compose` — "mapping key ... already defined"

Specifically `mediamtx_recordings` on lines ~506/512. The v1.0.1/v1.0.2
packager emitted the shared volume twice. Fix in place on the server:

```bash
grep -n "mediamtx_recordings:" docker-compose.yml    # note duplicate line numbers
# Then delete the 6-line duplicate block (numbers from the grep above, second
# occurrence). For the stock v1.0.2 compose it is lines 507-512:
cp docker-compose.yml docker-compose.yml.bak
sed -i '507,512d' docker-compose.yml
docker compose config -q && echo OK
```

Fixed in v1.0.3+.

### `.env` doesn't show in `ll`

`ll` (typically `ls -l`) hides dotfiles. The `.env` file exists — use:
```bash
ls -la ~/dm3
```

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
cd $DM3_DIR
docker compose down -v    # Removes all volumes = all data!
docker compose up -d
```

---

## Upgrading

When you receive a new installation package:

```bash
# 1. Stop current services
cd $DM3_DIR
docker compose down

# 2. Extract the new package (into HOME, not /tmp, if on snap Docker)
cd ~
tar -xzf /path/to/dm3-installer-v*.tar.gz
cd dm3-installer-*/

# 3. Load new Docker images only
sudo bash install.sh --load-only

# 4. Update compose file (keep your existing .env)
cp docker-compose.yml $DM3_DIR/docker-compose.yml
cp -r config/ $DM3_DIR/

# 5. Start services with new images
cd $DM3_DIR
docker compose up -d
```

---

## Support

- **Company**: Duali Vietnam
- **Product**: Duall Master 3.0
- **Email**: support@duali.com
