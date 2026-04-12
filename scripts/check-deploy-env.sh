#!/usr/bin/env bash
# Fail fast if the deploy .env is missing any required keys.
#
# Called by GitLab CI after scripts/write-ci-env.sh has generated .env
# from the project's CI/CD variables. Acts as a second line of defense:
# write-ci-env.sh already asserts the same variables are set in the
# shell, this script re-reads the file on disk and re-checks, so a
# broken write (truncation, wrong path, stale cached .env) doesn't
# sneak past.
#
# Required keys are the ones docker-compose.prod.yml interpolates with
# the ${VAR:?...} syntax.
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "[check-deploy-env] FAIL: $ENV_FILE does not exist." >&2
    echo "[check-deploy-env] Expected scripts/write-ci-env.sh to have generated it from CI variables." >&2
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
    echo "[check-deploy-env] Fix: add the missing keys in GitLab project" >&2
    echo "[check-deploy-env]   Settings → CI/CD → Variables (Protect + Mask)." >&2
    echo "[check-deploy-env] See .env.example for the full list of keys." >&2
    exit 1
fi

# Soft-warn on suspiciously short CCTV_CREDENTIAL_KEY (AES-256-GCM needs 32 bytes).
if (( ${#CCTV_CREDENTIAL_KEY} < 32 )); then
    echo "[check-deploy-env] WARN: CCTV_CREDENTIAL_KEY is ${#CCTV_CREDENTIAL_KEY} chars; expected >= 32 for AES-256-GCM." >&2
fi

echo "[check-deploy-env] OK: all required keys present in $ENV_FILE"
