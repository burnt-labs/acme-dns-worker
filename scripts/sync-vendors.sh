#!/usr/bin/env bash
# ------------------------------------------------------------------
# Sync vendors.json → .dev.vars (for local wrangler dev)
# Also supports pushing to Cloudflare secrets for production.
#
# Usage:
#   ./scripts/sync-vendors.sh          # update .dev.vars
#   ./scripts/sync-vendors.sh --deploy # push API_KEYS secret to CF
# ------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENDORS_FILE="${ROOT_DIR}/vendors.json"
DEV_VARS_FILE="${ROOT_DIR}/.dev.vars"

if [ ! -f "$VENDORS_FILE" ]; then
  echo "Error: ${VENDORS_FILE} not found." >&2
  echo "Copy vendors.example.json to vendors.json and fill in your vendors." >&2
  exit 1
fi

# Compact the JSON to a single line
API_KEYS=$(jq -c . "$VENDORS_FILE")

if [ "${1:-}" = "--deploy" ]; then
  echo "Pushing API_KEYS secret to Cloudflare..."
  echo "$API_KEYS" | npx wrangler secret put API_KEYS
  echo "Done."
  exit 0
fi

# --- Update .dev.vars ---------------------------------------------------------
if [ -f "$DEV_VARS_FILE" ]; then
  # Remove existing API_KEYS line and rewrite
  grep -v '^API_KEYS=' "$DEV_VARS_FILE" > "${DEV_VARS_FILE}.tmp" || true
  echo "API_KEYS=${API_KEYS}" | cat - "${DEV_VARS_FILE}.tmp" > "$DEV_VARS_FILE"
  rm "${DEV_VARS_FILE}.tmp"
else
  echo "API_KEYS=${API_KEYS}" > "$DEV_VARS_FILE"
fi

echo "Updated ${DEV_VARS_FILE} with vendors from ${VENDORS_FILE}"
