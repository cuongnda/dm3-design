#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  DM3 Offline Installer                                                  ║
# ║  Loads Docker images and starts services on the target server            ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default install dir: /opt/dm3. But snap-packaged Docker runs under strict
# confinement and cannot read /opt or /tmp — its compose file + bind-mounted
# volumes must live under the invoking user's $HOME. Detect that and pick a
# home-rooted default instead so `docker compose up` actually works.
_default_install_dir() {
  if readlink -f "$(command -v docker)" 2>/dev/null | grep -q '^/snap/'; then
    # snap docker: install under the invoking user's home (not root's home)
    local home_user="${SUDO_USER:-$USER}"
    local home_dir
    home_dir=$(getent passwd "$home_user" | cut -d: -f6)
    echo "${home_dir:-/home/$home_user}/dm3"
  else
    echo "/opt/dm3"
  fi
}
INSTALL_DIR="${INSTALL_DIR:-$(_default_install_dir)}"

# ══════════════════════════════════════════════════════════════════════════════
#  Pre-flight checks
# ══════════════════════════════════════════════════════════════════════════════

check_prerequisites() {
  echo -e "${BOLD}🔍 Checking prerequisites...${RESET}"

  # Root check
  if [[ $EUID -ne 0 ]]; then
    echo -e "${YELLOW}⚠  Not running as root. Some operations may fail.${RESET}"
    echo -e "   Run with: ${DIM}sudo bash install.sh${RESET}"
    read -p "   Continue anyway? [y/N] " -r
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
  fi

  # Docker
  if ! command -v docker &>/dev/null; then
    echo -e "${RED}✗ Docker is not installed${RESET}"
    echo -e "  Install with: ${DIM}curl -fsSL https://get.docker.com | sh${RESET}"
    exit 1
  fi
  echo -e "  ${GREEN}✓${RESET} Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"

  # Docker Compose
  if ! docker compose version &>/dev/null; then
    echo -e "${RED}✗ Docker Compose v2 is not installed${RESET}"
    echo -e "  Install Docker Compose plugin: ${DIM}sudo apt install docker-compose-plugin${RESET}"
    exit 1
  fi
  echo -e "  ${GREEN}✓${RESET} $(docker compose version | grep -oP 'v\d+\.\d+\.\d+')"

  # Docker daemon running
  if ! docker info &>/dev/null; then
    echo -e "${RED}✗ Docker daemon is not running${RESET}"
    echo -e "  Start with: ${DIM}sudo systemctl start docker${RESET}"
    exit 1
  fi
  echo -e "  ${GREEN}✓${RESET} Docker daemon running"

  # Disk space (warn if < 10GB free)
  local free_gb
  free_gb=$(df -BG "$SCRIPT_DIR" | tail -1 | awk '{print $4}' | tr -d 'G')
  if (( free_gb < 10 )); then
    echo -e "${YELLOW}⚠  Low disk space: ${free_gb}GB free (recommend 10GB+)${RESET}"
  else
    echo -e "  ${GREEN}✓${RESET} Disk space: ${free_gb}GB free"
  fi

  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
#  Load Docker images
# ══════════════════════════════════════════════════════════════════════════════

load_images() {
  echo -e "${BOLD}📀 Loading Docker images...${RESET}"

  local count=0
  local total
  total=$(ls -1 "$SCRIPT_DIR/images/"*.tar 2>/dev/null | wc -l)

  if [[ "$total" -eq 0 ]]; then
    echo -e "${RED}✗ No image files found in images/${RESET}"
    exit 1
  fi

  for tar_file in "$SCRIPT_DIR/images/"*.tar; do
    # NOTE: do NOT use `((count++))` — post-increment returns the OLD value of
    # count, which is 0 on the first iteration, producing exit code 1. Combined
    # with `set -euo pipefail`, that kills the script silently right after the
    # "Loading Docker images..." header with no error message.
    count=$((count + 1))
    local name
    name=$(basename "$tar_file")
    echo -e "  ${CYAN}[$count/$total]${RESET} Loading ${name}..."
    docker load -i "$tar_file"
  done

  echo -e "${GREEN}✓ All images loaded ($count)${RESET}\n"
}

# ══════════════════════════════════════════════════════════════════════════════
#  Install files
# ══════════════════════════════════════════════════════════════════════════════

install_files() {
  echo -e "${BOLD}📋 Installing to ${INSTALL_DIR}...${RESET}"

  mkdir -p "$INSTALL_DIR"

  # docker-compose.yml
  cp "$SCRIPT_DIR/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
  echo -e "  ${GREEN}✓${RESET} docker-compose.yml"

  # Config files
  if [[ -d "$SCRIPT_DIR/config" ]]; then
    cp -r "$SCRIPT_DIR/config" "$INSTALL_DIR/"
    echo -e "  ${GREEN}✓${RESET} config/"
  fi

  # Resolve server IP for __SERVER_IP__ substitution in .env. Precedence:
  #   1. --server-ip flag (explicit override)
  #   2. `hostname -I` primary address
  #   3. `ip route get 1.1.1.1` src (the IP used for default-route egress)
  #   4. 127.0.0.1 fallback (installer warns + user must edit .env)
  # User can always override later by editing /opt/dm3/.env before starting.
  local server_ip="${SERVER_IP_OVERRIDE:-}"
  if [[ -n "$server_ip" ]]; then
    echo -e "  ${GREEN}✓${RESET} Using provided server IP: ${CYAN}${server_ip}${RESET}"
  else
    if command -v hostname &>/dev/null; then
      server_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    if [[ -z "$server_ip" ]] && command -v ip &>/dev/null; then
      server_ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '/src/ {for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
    fi
    if [[ -z "$server_ip" ]]; then
      server_ip="127.0.0.1"
      echo -e "  ${YELLOW}⚠${RESET} Could not auto-detect server IP — defaulting to 127.0.0.1"
      echo -e "     ${DIM}Re-run with --server-ip <IP>, or edit /opt/dm3/.env after install${RESET}"
    else
      echo -e "  ${GREEN}✓${RESET} Detected server IP: ${CYAN}${server_ip}${RESET}"
      echo -e "     ${DIM}Override with --server-ip <IP> if clients reach the server via a different address${RESET}"
    fi
  fi

  # .env setup
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    echo -e "  ${YELLOW}⚠${RESET} .env already exists — keeping current version"
    echo -e "     ${DIM}New template saved as .env.new for reference${RESET}"
    sed "s|__SERVER_IP__|${server_ip}|g" "$SCRIPT_DIR/.env.example" > "$INSTALL_DIR/.env.new"
  else
    sed "s|__SERVER_IP__|${server_ip}|g" "$SCRIPT_DIR/.env.example" > "$INSTALL_DIR/.env"
    echo -e "  ${GREEN}✓${RESET} .env (from template, __SERVER_IP__ → ${server_ip})"

    # Auto-generate strong random secrets for every placeholder we know how to
    # fill. Generation happens entirely on the target server — values are
    # never printed to stdout/stderr. User can still edit .env to override.
    # Skipped: SMTP_PASSWORD (requires real provider-issued credential) and
    # anything already customised (only values matching CHANGE_ME* / placeholder
    # tokens are replaced).
    if ! command -v openssl &>/dev/null; then
      echo -e "  ${YELLOW}⚠${RESET} openssl not available — cannot auto-generate secrets"
      echo -e "     ${DIM}Edit ${INSTALL_DIR}/.env manually before starting.${RESET}"
    else
      echo -e "  ${CYAN}🔐 Auto-generating secrets into .env...${RESET}"
      local DB_PW JWT BOOT MINIO_PW CCTV_KEY MTX_STREAM MTX_API
      DB_PW=$(openssl rand -hex 24)
      JWT=$(openssl rand -hex 64)
      BOOT=$(openssl rand -hex 32)
      MINIO_PW=$(openssl rand -hex 24)
      CCTV_KEY=$(openssl rand -base64 32 | tr -d '\n')
      MTX_STREAM=$(openssl rand -hex 24)
      MTX_API=$(openssl rand -hex 24)

      # Sanity: CCTV_CREDENTIAL_KEY must base64-decode cleanly.
      if ! echo "$CCTV_KEY" | base64 -d >/dev/null 2>&1; then
        echo -e "  ${RED}✗ generated CCTV_KEY failed base64 self-test — aborting${RESET}" >&2
        exit 1
      fi

      # Substitute via perl -i -pe (handles +/= in base64 without escape hell).
      export DB_PW JWT BOOT MINIO_PW CCTV_KEY MTX_STREAM MTX_API
      perl -i -pe '
        s|^DB_PASSWORD=CHANGE_ME.*|DB_PASSWORD=$ENV{DB_PW}|;
        s|^JWT_SECRET=CHANGE_ME.*|JWT_SECRET=$ENV{JWT}|;
        s|^BOOTSTRAP_SECRET=CHANGE_ME.*|BOOTSTRAP_SECRET=$ENV{BOOT}|;
        s|^MINIO_ROOT_PASSWORD=CHANGE_ME.*|MINIO_ROOT_PASSWORD=$ENV{MINIO_PW}|;
        s|^CCTV_CREDENTIAL_KEY=<base64-encoded-32-random-bytes>|CCTV_CREDENTIAL_KEY=$ENV{CCTV_KEY}|;
        s|^MEDIAMTX_STREAM_PASS=<random-hex>|MEDIAMTX_STREAM_PASS=$ENV{MTX_STREAM}|;
        s|^MEDIAMTX_API_PASS=<random-hex>|MEDIAMTX_API_PASS=$ENV{MTX_API}|;
      ' "$INSTALL_DIR/.env"
      unset DB_PW JWT BOOT MINIO_PW CCTV_KEY MTX_STREAM MTX_API

      echo -e "  ${GREEN}✓${RESET} secrets written (DB, JWT, bootstrap, MinIO, CCTV, MediaMTX×2)"
      echo -e "     ${DIM}SMTP_PASSWORD still placeholder — only needed if you use email${RESET}"
    fi

    chmod 600 "$INSTALL_DIR/.env"

    echo ""
    echo -e "  ${DIM}To inspect or customise: sudo \${EDITOR:-nano} ${INSTALL_DIR}/.env${RESET}"
  fi

  # Guide
  cp "$SCRIPT_DIR/INSTALL-GUIDE.md" "$INSTALL_DIR/INSTALL-GUIDE.md"
  echo -e "  ${GREEN}✓${RESET} INSTALL-GUIDE.md"

  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
#  Start services
# ══════════════════════════════════════════════════════════════════════════════

start_services() {
  echo -e "${BOLD}🚀 Starting DM3 services...${RESET}"

  cd "$INSTALL_DIR"

  # Refuse to start if CRITICAL secrets are still placeholder values. cctv-svc
  # rejects an invalid CCTV_CREDENTIAL_KEY at startup (it will crashloop and
  # take the rest of the stack down as a dep-failed-to-start), and the other
  # services silently fall back to insecure dev defaults — both outcomes are
  # worse than a hard stop here.
  local critical_broken=()
  local key
  for key in DB_PASSWORD JWT_SECRET BOOTSTRAP_SECRET MINIO_ROOT_PASSWORD CCTV_CREDENTIAL_KEY MEDIAMTX_STREAM_PASS MEDIAMTX_API_PASS; do
    # pull the raw value, check for placeholder patterns
    local val
    val=$(grep -E "^${key}=" "$INSTALL_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)
    if [[ -z "$val" ]] \
      || [[ "$val" == CHANGE_ME* ]] \
      || [[ "$val" == \<*\> ]]; then
      critical_broken+=("$key")
    fi
  done
  if [[ ${#critical_broken[@]} -gt 0 ]]; then
    echo -e "${RED}✗ Critical secrets in ${INSTALL_DIR}/.env are still placeholders:${RESET}"
    for key in "${critical_broken[@]}"; do
      echo -e "    ${RED}• $key${RESET}"
    done
    echo -e "  ${DIM}Fix: edit ${INSTALL_DIR}/.env and replace the placeholder values.${RESET}"
    echo -e "  ${DIM}Or re-run this installer on a machine with openssl so it can auto-generate.${RESET}"
    exit 1
  fi

  # Non-critical placeholder warning (SMTP_PASSWORD etc.) — just a nudge
  if grep -q "CHANGE_ME" "$INSTALL_DIR/.env" 2>/dev/null; then
    echo -e "${YELLOW}⚠ .env still has CHANGE_ME values (e.g. SMTP_PASSWORD) — email features will not work until set.${RESET}"
  fi

  docker compose up -d --remove-orphans

  echo ""
  echo -e "${BOLD}📊 Service status:${RESET}"
  sleep 5
  docker compose ps

  echo ""
  echo -e "${GREEN}✓ DM3 installation complete!${RESET}"
}

# ══════════════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════════════

main() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}║${BOLD}            DM3 Offline Installer                        ${RESET}${CYAN}║${RESET}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${RESET}"
  echo ""

  # Parse args
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --install-dir) INSTALL_DIR="$2"; shift 2 ;;
      --load-only)   LOAD_ONLY=true; shift ;;
      --no-start)    NO_START=true; shift ;;
      --server-ip)   SERVER_IP_OVERRIDE="$2"; shift 2 ;;
      -h|--help)
        echo "Usage: install.sh [--install-dir DIR] [--load-only] [--no-start] [--server-ip IP]"
        echo ""
        echo "Options:"
        echo "  --install-dir DIR  Installation directory (default: /opt/dm3)"
        echo "  --load-only        Only load Docker images, don't install or start"
        echo "  --no-start         Install files but don't start services"
        echo "  --server-ip IP     Override auto-detected server IP"
        echo "                     (use when clients reach the server via a"
        echo "                     different IP than the primary NIC)"
        exit 0 ;;
      *) echo "Unknown option: $1"; exit 1 ;;
    esac
  done

  check_prerequisites
  load_images

  if [[ "${LOAD_ONLY:-false}" == true ]]; then
    echo -e "${GREEN}✓ Images loaded. Skipping install (--load-only).${RESET}"
    exit 0
  fi

  install_files

  if [[ "${NO_START:-false}" == true ]]; then
    echo -e "${GREEN}✓ Files installed to ${INSTALL_DIR}. Skipping start (--no-start).${RESET}"
    echo -e "  Start manually: ${DIM}cd ${INSTALL_DIR} && docker compose up -d${RESET}"
    exit 0
  fi

  start_services

  echo ""
  echo -e "${BOLD}📖 Next steps:${RESET}"
  echo -e "  • Check logs:    ${DIM}cd ${INSTALL_DIR} && docker compose logs -f${RESET}"
  echo -e "  • Service status: ${DIM}cd ${INSTALL_DIR} && docker compose ps${RESET}"
  echo -e "  • Read guide:    ${DIM}cat ${INSTALL_DIR}/INSTALL-GUIDE.md${RESET}"
  echo ""
}

main "$@"
