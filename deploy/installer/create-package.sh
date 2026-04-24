#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  DM3 Offline Installation Package Builder                               ║
# ║  Creates a self-contained installer with Docker images + compose config  ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_SRC="$PROJECT_ROOT/docker-compose.prod.yml"
NGINX_CONF="$PROJECT_ROOT/deploy/nginx/nginx.conf"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"

# ── Defaults ─────────────────────────────────────────────────────────────────
VERSION="${VERSION:-$(cd "$PROJECT_ROOT" && git describe --tags --always 2>/dev/null || echo "dev")}"
OUTPUT_DIR="$PROJECT_ROOT/dist"
INTERACTIVE=true
EXPOSE_PORTS=true   # add host port mapping to nginx

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

# ── Service registry ────────────────────────────────────────────────────────
# All services in display order. Infrastructure is mandatory.
INFRA_SERVICES=(timescaledb emqx nats valkey minio)
BACKEND_SERVICES=(auth-svc identity-svc access-svc audit-svc device-gateway visitor-svc parking-svc cctv-svc attend-svc)
MEDIA_SERVICES=(mediamtx)
FRONTEND_SERVICES=(webapp nginx)
OPTIONAL_SERVICES=(simulator)

# Human-readable descriptions
declare -A SVC_DESC=(
  [timescaledb]="TimescaleDB (PostgreSQL)"
  [emqx]="MQTT Broker"
  [nats]="NATS Message Bus"
  [valkey]="Valkey Cache (Redis-compatible)"
  [minio]="MinIO Object Storage"
  [auth-svc]="Authentication & Users"
  [identity-svc]="Person & Group Management"
  [access-svc]="Access Control & Events"
  [audit-svc]="Audit Log"
  [device-gateway]="Device Management & MQTT Gateway"
  [visitor-svc]="Visitor Management (plugin)"
  [parking-svc]="Parking Management (plugin)"
  [cctv-svc]="CCTV Cameras & Clips (plugin)"
  [attend-svc]="Attendance & Shifts (plugin)"
  [mediamtx]="MediaMTX RTSP/WebRTC/HLS (cctv-svc dep)"
  [webapp]="Web Dashboard"
  [nginx]="Nginx Reverse Proxy"
  [simulator]="Device Simulator (staging)"
)

# Third-party images (pulled, not built)
declare -A PULL_IMAGES=(
  [timescaledb]="timescale/timescaledb:2.17.2-pg16"
  [emqx]="emqx/emqx:5.8.3"
  [nats]="nats:2.10-alpine"
  [valkey]="valkey/valkey:8.0-alpine"
  [minio]="minio/minio:latest"
  [mediamtx]="bluenviron/mediamtx:1.9.3"
  [nginx]="nginx:alpine"
)

# Build contexts: service -> "context|dockerfile"
# Every backend service shares a single ./backend build → produces dm3/backend:VERSION,
# deduplicated in build_images/export_images.
declare -A BUILD_CTX=(
  [auth-svc]="./backend|Dockerfile"
  [identity-svc]="./backend|Dockerfile"
  [access-svc]="./backend|Dockerfile"
  [audit-svc]="./backend|Dockerfile"
  [device-gateway]="./backend|Dockerfile"
  [visitor-svc]="./backend|Dockerfile"
  [parking-svc]="./backend|Dockerfile"
  [cctv-svc]="./backend|Dockerfile"
  [attend-svc]="./backend|Dockerfile"
  [migrate]="./backend|Dockerfile"
  [webapp]=".|apps/console/Dockerfile"
  [simulator]="./simulator|Dockerfile"
)

# ── Selection state (1=selected, 0=not) ─────────────────────────────────────
declare -A SELECTED=()

init_defaults() {
  for svc in "${INFRA_SERVICES[@]}"; do SELECTED[$svc]=1; done
  for svc in "${BACKEND_SERVICES[@]}"; do SELECTED[$svc]=1; done
  for svc in "${MEDIA_SERVICES[@]}"; do SELECTED[$svc]=1; done
  for svc in "${FRONTEND_SERVICES[@]}"; do SELECTED[$svc]=1; done
  for svc in "${OPTIONAL_SERVICES[@]}"; do SELECTED[$svc]=0; done
}

# ── YQ dependency ───────────────────────────────────────────────────────────
YQ=""
ensure_yq() {
  if command -v yq &>/dev/null; then
    YQ="yq"
    return
  fi
  local yq_bin="$SCRIPT_DIR/.yq"
  if [[ -x "$yq_bin" ]]; then
    YQ="$yq_bin"
    return
  fi
  echo -e "${YELLOW}⚙  yq not found — downloading...${RESET}"
  local arch
  arch=$(uname -m)
  case "$arch" in
    x86_64)  arch="amd64" ;;
    aarch64) arch="arm64" ;;
    *)       echo -e "${RED}✗ Unsupported architecture: $arch${RESET}"; exit 1 ;;
  esac
  curl -sSL "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_${arch}" -o "$yq_bin"
  chmod +x "$yq_bin"
  YQ="$yq_bin"
  echo -e "${GREEN}✓ yq installed${RESET}"
}

# ══════════════════════════════════════════════════════════════════════════════
#  CLI parsing
# ══════════════════════════════════════════════════════════════════════════════

usage() {
  cat <<EOF
${BOLD}DM3 Offline Installation Package Builder${RESET}

${BOLD}Usage:${RESET}
  $(basename "$0") [OPTIONS]

${BOLD}Options:${RESET}
  --version VER      Package version tag (default: git describe)
  --output DIR       Output directory (default: ./dist)
  --all              Include all services
  --no-simulator     Exclude simulator (default)
  --services LIST    Comma-separated list of services to include
                     (infrastructure is always included)
  --no-ports         Don't expose host ports on nginx
  --non-interactive  Skip interactive menu
  -h, --help         Show this help

${BOLD}Examples:${RESET}
  # Interactive mode (default)
  $(basename "$0")

  # All services
  $(basename "$0") --all --version v1.0.0

  # Backend only (no webapp/simulator)
  $(basename "$0") --services auth-svc,device-gateway --non-interactive

  # Specific services
  $(basename "$0") --services auth-svc,identity-svc,webapp,nginx --version v1.2.0

${BOLD}Service groups:${RESET}
  Infrastructure (always): timescaledb, emqx, nats, valkey, minio
  Backend:                 auth-svc, identity-svc, access-svc, device-gateway
  Frontend:                webapp, nginx
  Optional:                simulator
EOF
  exit 0
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help) usage ;;
      --version)
        VERSION="$2"; shift 2 ;;
      --output)
        OUTPUT_DIR="$2"; shift 2 ;;
      --all)
        for svc in "${BACKEND_SERVICES[@]}" "${MEDIA_SERVICES[@]}" "${FRONTEND_SERVICES[@]}" "${OPTIONAL_SERVICES[@]}"; do
          SELECTED[$svc]=1
        done
        INTERACTIVE=false; shift ;;
      --no-simulator)
        SELECTED[simulator]=0; shift ;;
      --no-ports)
        EXPOSE_PORTS=false; shift ;;
      --non-interactive)
        INTERACTIVE=false; shift ;;
      --services)
        # Reset non-infra to 0, then enable specified
        for svc in "${BACKEND_SERVICES[@]}" "${MEDIA_SERVICES[@]}" "${FRONTEND_SERVICES[@]}" "${OPTIONAL_SERVICES[@]}"; do
          SELECTED[$svc]=0
        done
        IFS=',' read -ra svc_list <<< "$2"
        for svc in "${svc_list[@]}"; do
          svc="$(echo "$svc" | xargs)"  # trim whitespace
          if [[ -n "${SVC_DESC[$svc]+x}" ]]; then
            SELECTED[$svc]=1
          else
            echo -e "${RED}✗ Unknown service: $svc${RESET}" >&2; exit 1
          fi
        done
        INTERACTIVE=false; shift 2 ;;
      *)
        echo -e "${RED}✗ Unknown option: $1${RESET}" >&2; usage ;;
    esac
  done
}

# ══════════════════════════════════════════════════════════════════════════════
#  Interactive menu
# ══════════════════════════════════════════════════════════════════════════════

show_banner() {
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}║${BOLD}       DM3 Offline Installation Package Builder          ${RESET}${CYAN}║${RESET}"
  echo -e "${CYAN}║${DIM}       Version: ${VERSION}                                     ${RESET}${CYAN}║${RESET}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

show_menu() {
  local idx=1

  while true; do
    echo -e "${BOLD}  INFRASTRUCTURE${RESET} ${DIM}(always included)${RESET}"
    for svc in "${INFRA_SERVICES[@]}"; do
      printf "    ${GREEN}✅${RESET} %2d) %-20s %s\n" "$idx" "$svc" "${SVC_DESC[$svc]}"
      ((idx++))
    done

    echo ""
    echo -e "${BOLD}  BACKEND${RESET} ${DIM}(toggle individually)${RESET}"
    for svc in "${BACKEND_SERVICES[@]}"; do
      local icon="${GREEN}✅${RESET}"
      [[ "${SELECTED[$svc]}" == "0" ]] && icon="${RED}❌${RESET}"
      printf "    %b %2d) %-20s %s\n" "$icon" "$idx" "$svc" "${SVC_DESC[$svc]}"
      ((idx++))
    done

    echo ""
    echo -e "${BOLD}  MEDIA${RESET} ${DIM}(required for cctv-svc)${RESET}"
    for svc in "${MEDIA_SERVICES[@]}"; do
      local icon="${GREEN}✅${RESET}"
      [[ "${SELECTED[$svc]}" == "0" ]] && icon="${RED}❌${RESET}"
      printf "    %b %2d) %-20s %s\n" "$icon" "$idx" "$svc" "${SVC_DESC[$svc]}"
      ((idx++))
    done

    echo ""
    echo -e "${BOLD}  FRONTEND${RESET}"
    for svc in "${FRONTEND_SERVICES[@]}"; do
      local icon="${GREEN}✅${RESET}"
      [[ "${SELECTED[$svc]}" == "0" ]] && icon="${RED}❌${RESET}"
      printf "    %b %2d) %-20s %s\n" "$icon" "$idx" "$svc" "${SVC_DESC[$svc]}"
      ((idx++))
    done

    echo ""
    echo -e "${BOLD}  OPTIONAL${RESET}"
    for svc in "${OPTIONAL_SERVICES[@]}"; do
      local icon="${GREEN}✅${RESET}"
      [[ "${SELECTED[$svc]}" == "0" ]] && icon="${RED}❌${RESET}"
      printf "    %b %2d) %-20s %s\n" "$icon" "$idx" "$svc" "${SVC_DESC[$svc]}"
      ((idx++))
    done

    echo ""
    echo -e "  ${DIM}Commands: [number] toggle  |  [a]ll on  |  [n]one (backend/frontend/optional)  |  [d]one${RESET}"
    echo -n "  > "
    read -r choice

    # Map number → service name
    local all_toggleable=("${BACKEND_SERVICES[@]}" "${MEDIA_SERVICES[@]}" "${FRONTEND_SERVICES[@]}" "${OPTIONAL_SERVICES[@]}")
    local infra_count=${#INFRA_SERVICES[@]}

    case "$choice" in
      a)
        for svc in "${all_toggleable[@]}"; do SELECTED[$svc]=1; done ;;
      n)
        for svc in "${all_toggleable[@]}"; do SELECTED[$svc]=0; done ;;
      d|done|"")
        echo ""; return ;;
      [0-9]*)
        local num=$((choice))
        if (( num >= 1 && num <= infra_count )); then
          echo -e "  ${YELLOW}⚠  Infrastructure services cannot be toggled${RESET}"
        else
          local adj=$((num - infra_count - 1))
          if (( adj >= 0 && adj < ${#all_toggleable[@]} )); then
            local target="${all_toggleable[$adj]}"
            if [[ "${SELECTED[$target]}" == "1" ]]; then
              SELECTED[$target]=0
            else
              SELECTED[$target]=1
            fi
          else
            echo -e "  ${RED}Invalid number${RESET}"
          fi
        fi
        ;;
      *)
        echo -e "  ${RED}Invalid input${RESET}" ;;
    esac

    # Reset index for redraw
    idx=1
    echo ""
  done
}

# ══════════════════════════════════════════════════════════════════════════════
#  Build logic
# ══════════════════════════════════════════════════════════════════════════════

# Collect final service list (infra + selected + auto-deps)
get_selected_services() {
  local services=()
  for svc in "${INFRA_SERVICES[@]}"; do services+=("$svc"); done

  local has_backend=false
  for svc in "${BACKEND_SERVICES[@]}"; do
    if [[ "${SELECTED[$svc]}" == "1" ]]; then
      services+=("$svc")
      has_backend=true
    fi
  done

  # Auto-include migrate if any backend service is selected
  if $has_backend; then
    services+=("migrate")
  fi

  # cctv-svc requires mediamtx — auto-enable if not explicitly selected
  if [[ "${SELECTED[cctv-svc]:-0}" == "1" && "${SELECTED[mediamtx]:-0}" == "0" ]]; then
    SELECTED[mediamtx]=1
  fi
  for svc in "${MEDIA_SERVICES[@]}"; do
    [[ "${SELECTED[$svc]}" == "1" ]] && services+=("$svc")
  done

  for svc in "${FRONTEND_SERVICES[@]}"; do
    [[ "${SELECTED[$svc]}" == "1" ]] && services+=("$svc")
  done
  for svc in "${OPTIONAL_SERVICES[@]}"; do
    [[ "${SELECTED[$svc]}" == "1" ]] && services+=("$svc")
  done

  echo "${services[@]}"
}

build_images() {
  local services=("$@")
  local built_contexts=()

  echo -e "${BOLD}📦 Building Docker images...${RESET}"
  cd "$PROJECT_ROOT"

  for svc in "${services[@]}"; do
    # Skip third-party images (they get pulled, not built)
    if [[ -n "${PULL_IMAGES[$svc]+x}" ]]; then
      local pull_tag="${PULL_IMAGES[$svc]}"
      echo -e "  ${DIM}⏬ Pulling $svc → $pull_tag${RESET}"
      if ! docker pull "$pull_tag"; then
        echo -e "  ${RED}✗ docker pull failed for $pull_tag${RESET}" >&2
        exit 1
      fi
      # Verify image is actually present locally — pulls have been observed to
      # exit 0 with interleaved output yet leave the image absent. Fail fast.
      if ! docker image inspect "$pull_tag" >/dev/null 2>&1; then
        echo -e "  ${RED}✗ Image $pull_tag not present after pull — retrying once${RESET}" >&2
        docker pull "$pull_tag" || { echo -e "  ${RED}✗ Retry failed${RESET}" >&2; exit 1; }
        docker image inspect "$pull_tag" >/dev/null 2>&1 \
          || { echo -e "  ${RED}✗ Image $pull_tag still missing after retry${RESET}" >&2; exit 1; }
      fi
      continue
    fi

    # Built images — check if context already built (backend shares one image)
    local ctx_info="${BUILD_CTX[$svc]}"
    local ctx="${ctx_info%%|*}"
    local dockerfile="${ctx_info##*|}"

    # Deduplicate: only build each context once
    local already_built=false
    for done_ctx in "${built_contexts[@]+"${built_contexts[@]}"}"; do
      [[ "$done_ctx" == "$ctx|$dockerfile" ]] && already_built=true && break
    done
    if $already_built; then
      echo -e "  ${DIM}♻  $svc — reusing image from ${ctx}${RESET}"
      continue
    fi

    local tag
    if [[ "$ctx" == "./backend" ]]; then
      tag="dm3/backend:${VERSION}"
    elif [[ "$ctx" == "." && "$dockerfile" == "apps/console/Dockerfile" ]]; then
      tag="dm3/webapp:${VERSION}"
    elif [[ "$ctx" == "./simulator" ]]; then
      tag="dm3/simulator:${VERSION}"
    else
      tag="dm3/${svc}:${VERSION}"
    fi

    echo -e "  ${CYAN}🔨 Building $svc → $tag${RESET}"
    docker build -t "$tag" -f "${ctx}/${dockerfile}" "$ctx" \
      || docker build -t "$tag" -f "${dockerfile}" "$ctx"

    built_contexts+=("$ctx|$dockerfile")
  done

  echo -e "${GREEN}✓ All images built${RESET}\n"
}

export_images() {
  local work_dir="$1"; shift
  local services=("$@")
  local images_dir="$work_dir/images"
  mkdir -p "$images_dir"

  local exported_images=()

  echo -e "${BOLD}💾 Exporting Docker images...${RESET}"

  for svc in "${services[@]}"; do
    local image_name tar_name

    if [[ -n "${PULL_IMAGES[$svc]+x}" ]]; then
      image_name="${PULL_IMAGES[$svc]}"
      tar_name="${svc}.tar"
    elif [[ -n "${BUILD_CTX[$svc]+x}" ]]; then
      local ctx="${BUILD_CTX[$svc]%%|*}"
      if [[ "$ctx" == "./backend" ]]; then
        image_name="dm3/backend:${VERSION}"
        tar_name="dm3-backend.tar"
      elif [[ "$ctx" == "." ]]; then
        image_name="dm3/webapp:${VERSION}"
        tar_name="dm3-webapp.tar"
      elif [[ "$ctx" == "./simulator" ]]; then
        image_name="dm3/simulator:${VERSION}"
        tar_name="dm3-simulator.tar"
      else
        image_name="dm3/${svc}:${VERSION}"
        tar_name="${svc}.tar"
      fi
    else
      continue
    fi

    # Skip if already exported (backend image shared by multiple services)
    local already=false
    for done_img in "${exported_images[@]+"${exported_images[@]}"}"; do
      [[ "$done_img" == "$image_name" ]] && already=true && break
    done
    if $already; then
      echo -e "  ${DIM}♻  $svc — already exported ($tar_name)${RESET}"
      continue
    fi

    echo -e "  ${CYAN}📀 $image_name → images/$tar_name${RESET}"
    docker save "$image_name" -o "$images_dir/$tar_name"
    exported_images+=("$image_name")
  done

  echo -e "${GREEN}✓ All images exported${RESET}\n"
}

# ══════════════════════════════════════════════════════════════════════════════
#  Generate filtered docker-compose.yml
# ══════════════════════════════════════════════════════════════════════════════

generate_compose() {
  local work_dir="$1"; shift
  local services=("$@")
  local out="$work_dir/docker-compose.yml"

  echo -e "${BOLD}📝 Generating docker-compose.yml...${RESET}"

  # Build yq service filter list: ["svc1","svc2",...]
  local svc_list
  svc_list=$(printf '"%s",' "${services[@]}")
  svc_list="[${svc_list%,}]"

  # 1. Copy and keep only selected services
  cp "$COMPOSE_SRC" "$out"
  $YQ -i ".services |= pick($svc_list)" "$out"

  # 2. Replace build: with image: for built services
  for svc in "${services[@]}"; do
    if $YQ -e ".services.\"$svc\".build" "$out" &>/dev/null; then
      local ctx
      ctx=$($YQ ".services.\"$svc\".build.context // \"\"" "$out")
      local image_tag
      case "$ctx" in
        ./backend|backend)   image_tag="dm3/backend:${VERSION}" ;;
        .|./)               image_tag="dm3/webapp:${VERSION}" ;;
        ./simulator)         image_tag="dm3/simulator:${VERSION}" ;;
        *)                   image_tag="dm3/${svc}:${VERSION}" ;;
      esac
      $YQ -i "del(.services.\"$svc\".build) | .services.\"$svc\".image = \"$image_tag\"" "$out"
    fi
  done

  # 3. Fix depends_on — remove references to excluded services
  for svc in "${services[@]}"; do
    if $YQ -e ".services.\"$svc\".depends_on" "$out" &>/dev/null; then
      local deps
      deps=$($YQ ".services.\"$svc\".depends_on | keys | .[]" "$out" 2>/dev/null || true)
      for dep in $deps; do
        local found=false
        for s in "${services[@]}"; do
          [[ "$s" == "$dep" ]] && found=true && break
        done
        if ! $found; then
          $YQ -i "del(.services.\"$svc\".depends_on.\"$dep\")" "$out"
        fi
      done
      # Remove empty depends_on
      local count
      count=$($YQ ".services.\"$svc\".depends_on | length" "$out" 2>/dev/null || echo 0)
      if [[ "$count" == "0" ]]; then
        $YQ -i "del(.services.\"$svc\".depends_on)" "$out"
      fi
    fi
  done

  # 4. Remove profiles (not needed in offline installer)
  $YQ -i 'del(.services.*.profiles)' "$out"

  # 5. Simplify networks — remove dmpw-net (external), keep dm3-internal only
  $YQ -i 'del(.networks.dmpw-net)' "$out"
  for svc in "${services[@]}"; do
    if $YQ -e ".services.\"$svc\".networks" "$out" &>/dev/null; then
      $YQ -i ".services.\"$svc\".networks = [\"dm3-internal\"]" "$out"
    fi
  done

  # 6. Add host port mapping to nginx if requested
  if [[ "$EXPOSE_PORTS" == true ]]; then
    if $YQ -e ".services.nginx" "$out" &>/dev/null; then
      $YQ -i '.services.nginx.ports = ["80:80", "443:443"]' "$out"
    fi
  fi

  # 7. Remove unused volumes
  # Dedupe the volume name list BEFORE passing to yq. When two services mount
  # the same named volume (e.g. mediamtx + cctv-svc both use
  # `mediamtx_recordings`), yq's `pick([a,b,a])` emits the key twice, producing
  # a compose with a duplicate top-level key that `docker compose config -q`
  # rejects as "mapping key already defined".
  local used_volumes=()
  for svc in "${services[@]}"; do
    local vols
    vols=$($YQ ".services.\"$svc\".volumes // [] | .[] | select(test(\"^[a-zA-Z]\")) | split(\":\") | .[0]" "$out" 2>/dev/null || true)
    for v in $vols; do
      used_volumes+=("$v")
    done
  done
  if [[ ${#used_volumes[@]} -gt 0 ]]; then
    local unique_volumes=()
    while IFS= read -r v; do
      [[ -n "$v" ]] && unique_volumes+=("$v")
    done < <(printf '%s\n' "${used_volumes[@]}" | awk '!seen[$0]++')
    local vol_list
    vol_list=$(printf '"%s",' "${unique_volumes[@]}")
    vol_list="[${vol_list%,}]"
    $YQ -i ".volumes |= pick($vol_list)" "$out"
  else
    $YQ -i 'del(.volumes)' "$out"
  fi

  # 8. Remove letsencrypt volume mount from nginx (offline installs handle SSL separately)
  if $YQ -e ".services.nginx.volumes" "$out" &>/dev/null; then
    $YQ -i '.services.nginx.volumes = [
      "./config/nginx/nginx.conf:/etc/nginx/nginx.conf:ro"
    ]' "$out"
  fi

  echo -e "  ${DIM}Services included: ${services[*]}${RESET}"
  echo -e "${GREEN}✓ docker-compose.yml generated${RESET}\n"
}

# ══════════════════════════════════════════════════════════════════════════════
#  Bundle everything
# ══════════════════════════════════════════════════════════════════════════════

bundle_package() {
  local work_dir="$1"
  local pkg_name="$2"

  echo -e "${BOLD}📋 Bundling package contents...${RESET}"

  # Config files
  mkdir -p "$work_dir/config/nginx"
  cp "$NGINX_CONF" "$work_dir/config/nginx/nginx.conf"
  cp "$ENV_EXAMPLE" "$work_dir/.env.example"

  # Install script and guide
  cp "$SCRIPT_DIR/install.sh" "$work_dir/install.sh"
  chmod +x "$work_dir/install.sh"
  cp "$SCRIPT_DIR/INSTALL-GUIDE.md" "$work_dir/INSTALL-GUIDE.md"

  # Compress
  mkdir -p "$OUTPUT_DIR"
  local archive="$OUTPUT_DIR/${pkg_name}.tar.gz"
  echo -e "  ${CYAN}🗜  Compressing → $archive${RESET}"
  tar -czf "$archive" -C "$(dirname "$work_dir")" "$(basename "$work_dir")"

  # Cleanup work dir
  rm -rf "$work_dir"

  # Summary
  local size
  size=$(du -sh "$archive" | cut -f1)
  echo -e "${GREEN}✓ Package created: $archive ($size)${RESET}"
  echo ""
  echo -e "${BOLD}📦 Package contents:${RESET}"
  tar -tzf "$archive" | head -30
  echo -e "  ${DIM}...${RESET}"
}

# ══════════════════════════════════════════════════════════════════════════════
#  Main
# ══════════════════════════════════════════════════════════════════════════════

main() {
  init_defaults
  parse_args "$@"
  ensure_yq
  show_banner

  if [[ "$INTERACTIVE" == true ]]; then
    show_menu
  fi

  # Resolve final service list
  local services
  read -ra services <<< "$(get_selected_services)"

  if [[ ${#services[@]} -eq 0 ]]; then
    echo -e "${RED}✗ No services selected${RESET}"; exit 1
  fi

  echo -e "${BOLD}Selected services:${RESET}"
  for svc in "${services[@]}"; do
    echo -e "  ${GREEN}✓${RESET} $svc"
  done
  echo ""

  # Prepare working directory
  local date_stamp
  date_stamp=$(date +%Y%m%d)
  local pkg_name="dm3-installer-${VERSION}-${date_stamp}"
  local final_work="$PROJECT_ROOT/$pkg_name"
  # If a previous run left the dir behind, clear it so mktemp→mv doesn't nest a
  # .pkg-XXXXXX scaffold inside the final archive.
  if [[ -e "$final_work" ]]; then
    echo -e "  ${YELLOW}⚠  Removing stale work dir: $final_work${RESET}"
    rm -rf "$final_work"
  fi
  mkdir -p "$final_work"

  # Build & export
  build_images "${services[@]}"
  export_images "$final_work" "${services[@]}"

  # Generate compose
  generate_compose "$final_work" "${services[@]}"

  # Bundle
  bundle_package "$final_work" "$pkg_name"

  echo ""
  echo -e "${BOLD}🚀 Next steps:${RESET}"
  echo -e "  1. Transfer ${CYAN}$OUTPUT_DIR/${pkg_name}.tar.gz${RESET} to target server"
  echo -e "  2. Extract:  ${DIM}tar -xzf ${pkg_name}.tar.gz${RESET}"
  echo -e "  3. Install:  ${DIM}cd ${pkg_name} && sudo bash install.sh${RESET}"
  echo ""
}

main "$@"
