#!/usr/bin/env bash
# Fail fast if the deploy .env is missing any required keys.
# Run by GitLab CI's verify:compose job after copying the runner's
# /home/gitlab-runner/.env.dm3 into the workspace as .env.
#
# Required keys are the ones docker-compose.prod.yml interpolates with
# the ${VAR:?...} syntax, plus any that must be non-empty but use a
# default-expansion ${VAR:-default} in compose that we still want
# audited at deploy time.
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "[check-deploy-env] FAIL: $ENV_FILE does not exist." >&2
    echo "[check-deploy-env] Expected /home/gitlab-runner/.env.dm3 to be copied to $ENV_FILE" >&2
    exit 1
fi

REQUIRED=(
    DB_PASSWORD
    JWT_SECRET
    MINIO_ROOT_PASSWORD
    BOOTSTRAP_SECRET
    CCTV_CREDENTIAL_KEY
)

# Load .env into this shell without exporting side-effects into parent.
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

missing=()
for key in "${REQUIRED[@]}"; do
    if [[ -z "${!key:-}" ]]; then
        missing+=("$key")
    fi
done

if (( ${#missing[@]} > 0 )); then
    echo "[check-deploy-env] FAIL: the following required keys are missing or empty in $ENV_FILE:" >&2
    for key in "${missing[@]}"; do
        echo "  - $key" >&2
    done
    echo "" >&2
    echo "[check-deploy-env] Fix: SSH to the runner host and edit /home/gitlab-runner/.env.dm3" >&2
    echo "[check-deploy-env] See .env.example for the full list of keys." >&2
    exit 1
fi

# Soft-warn on suspiciously short CCTV_CREDENTIAL_KEY (AES-256-GCM needs 32 bytes).
if (( ${#CCTV_CREDENTIAL_KEY} < 32 )); then
    echo "[check-deploy-env] WARN: CCTV_CREDENTIAL_KEY is ${#CCTV_CREDENTIAL_KEY} chars; expected >= 32 for AES-256-GCM." >&2
fi

echo "[check-deploy-env] OK: all required keys present in $ENV_FILE"
