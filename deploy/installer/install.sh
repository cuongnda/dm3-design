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
INSTALL_DIR="${INSTALL_DIR:-/opt/dm3}"

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
    ((count++))
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

  # .env setup
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    echo -e "  ${YELLOW}⚠${RESET} .env already exists — keeping current version"
    echo -e "     ${DIM}New template saved as .env.new for reference${RESET}"
    cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env.new"
  else
    cp "$SCRIPT_DIR/.env.example" "$INSTALL_DIR/.env"
    echo -e "  ${GREEN}✓${RESET} .env (from template)"
    echo ""
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${YELLOW}║  ⚠  IMPORTANT: You MUST edit .env before starting!       ║${RESET}"
    echo -e "${YELLOW}║     Change all CHANGE_ME values to real passwords.        ║${RESET}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
    read -p "  Edit .env now? [Y/n] " -r
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      ${EDITOR:-nano} "$INSTALL_DIR/.env"
    fi
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

  # Ensure .env has no CHANGE_ME values
  if grep -q "CHANGE_ME" "$INSTALL_DIR/.env" 2>/dev/null; then
    echo -e "${RED}✗ .env still contains CHANGE_ME placeholder values!${RESET}"
    echo -e "  Please edit ${INSTALL_DIR}/.env first."
    read -p "  Start anyway (NOT recommended for production)? [y/N] " -r
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
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
      -h|--help)
        echo "Usage: install.sh [--install-dir DIR] [--load-only] [--no-start]"
        echo ""
        echo "Options:"
        echo "  --install-dir DIR  Installation directory (default: /opt/dm3)"
        echo "  --load-only        Only load Docker images, don't install or start"
        echo "  --no-start         Install files but don't start services"
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
