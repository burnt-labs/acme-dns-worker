#!/usr/bin/env bash
# ------------------------------------------------------------------
# lego exec hook for acme-dns-worker
#
# Usage:
#   export ACME_DNS_WORKER_URL="https://acme-dns.example.com"
#   export ACME_DNS_WORKER_API_KEY="your-api-key"
#
#   lego --dns exec \
#     --exec.path ./lego-hook.sh \
#     --domains app.example.com \
#     --email you@example.com \
#     run
#
# lego sets these env vars:
#   EXEC_MODE        — "present" or "cleanup"
#   EXEC_FQDN        — e.g. "_acme-challenge.app.example.com."
#   EXEC_VALUE       — the challenge token
#   EXEC_DOMAIN      — e.g. "app.example.com"
# ------------------------------------------------------------------

set -euo pipefail

: "${ACME_DNS_WORKER_URL:?Set ACME_DNS_WORKER_URL}"
: "${ACME_DNS_WORKER_API_KEY:?Set ACME_DNS_WORKER_API_KEY}"

case "$EXEC_MODE" in
  present)
    echo "Setting ACME challenge for ${EXEC_DOMAIN}..."

    response=$(curl -s -w "\n%{http_code}" \
      -X POST "${ACME_DNS_WORKER_URL}/update" \
      -H "Content-Type: application/json" \
      -H "X-Api-Key: ${ACME_DNS_WORKER_API_KEY}" \
      -d "{\"subdomain\": \"${EXEC_DOMAIN}\", \"txt\": \"${EXEC_VALUE}\"}")

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$http_code" != "200" ]; then
      echo "Error: HTTP ${http_code} — ${body}" >&2
      exit 1
    fi

    echo "TXT record set: ${body}"
    sleep 10
    ;;

  cleanup)
    echo "Cleanup: TXT records will be overwritten on next renewal."
    ;;

  *)
    echo "Unknown EXEC_MODE: ${EXEC_MODE}" >&2
    exit 1
    ;;
esac
