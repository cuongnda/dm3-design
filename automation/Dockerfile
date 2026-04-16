###############################################################################
# DM3 Automation Test Container
#
# Runs Playwright + pytest against DM3 services (API + Web).
# - On startup: runs tests for modules changed in the latest commit
# - On cron schedule: runs full test suite
#
# Build: docker compose -f docker-compose.prod.yml build automation
# Run:   docker compose -f docker-compose.prod.yml up -d automation
###############################################################################

FROM mcr.microsoft.com/playwright/python:v1.52.0-noble

LABEL maintainer="DUALi Inc."
LABEL description="DM3 Automation Test Runner"

# ── System deps ──────────────────────────────────────────────────────────────
# Note: ffmpeg, git, curl are already in the Playwright base image.
# Only cron needs to be installed. Retry apt-get update for transient network issues.
RUN for i in 1 2 3; do apt-get update && break || sleep 5; done \
    && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

# ── Python deps ──────────────────────────────────────────────────────────────
WORKDIR /app/automation
COPY automation/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir Pillow

# ── Install Playwright browsers (Chromium only) ─────────────────────────────
RUN playwright install chromium --with-deps

# ── Copy automation code ─────────────────────────────────────────────────────
COPY automation/ .

# ── Copy full repo for git diff (detect changed modules) ────────────────────
COPY .git /app/.git

# ── Entrypoint ───────────────────────────────────────────────────────────────
COPY automation/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# ── Log directory ────────────────────────────────────────────────────────────
RUN mkdir -p /var/log /app/automation/export

ENTRYPOINT ["/docker-entrypoint.sh"]
