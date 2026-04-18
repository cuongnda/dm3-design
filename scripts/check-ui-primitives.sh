#!/usr/bin/env bash
# Fails if raw Dialog/DialogContent is used outside packages/ui.
# App code must use AppModal / WizardModal / drawer primitives from @dm3/ui
# so modal sizing, header, footer, and a11y stay consistent across the system.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Search only app source files (excluding the primitive definitions in packages/ui).
MATCHES=$(
  grep -rEn \
    --include='*.tsx' --include='*.ts' \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=build \
    '(from "@dm3/ui".*DialogContent)|(^\s*DialogContent\b)|(<DialogContent)' \
    apps/ 2>/dev/null | grep -v 'apps/console/src/features/access/zones/__test_skip__' || true
)

if [ -n "$MATCHES" ]; then
  echo "ERROR: raw DialogContent used in app code. Use AppModal or WizardModal from @dm3/ui instead."
  echo ""
  echo "$MATCHES"
  echo ""
  echo "See docs/design/MODAL_GUIDELINES.md (or AppModal.tsx) for the consumer API."
  exit 1
fi

echo "OK: no raw DialogContent usages in app code."
