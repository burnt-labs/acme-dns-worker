#!/usr/bin/env bash
# ------------------------------------------------------------------
# certbot cleanup hook for acme-dns-worker
#
# Removes the challenge record this vendor created, so the RRset does not
# accumulate stale tokens between renewals.
#
# certbot sets:
#   CERTBOT_DOMAIN — the domain that was validated
# ------------------------------------------------------------------

set -euo pipefail

: "${ACME_DNS_WORKER_URL:?Set ACME_DNS_WORKER_URL}"
: "${ACME_DNS_WORKER_API_KEY:?Set ACME_DNS_WORKER_API_KEY}"

echo "Removing ACME challenge for ${CERTBOT_DOMAIN}..."

response=$(curl -s -w "\n%{http_code}" \
  -X POST "${ACME_DNS_WORKER_URL}/cleanup" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ${ACME_DNS_WORKER_API_KEY}" \
  -d "{\"subdomain\": \"${CERTBOT_DOMAIN}\"}" || true)

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -1)

# Cleanup runs after issuance has already succeeded or failed, so a problem
# here must not fail the renewal - warn and carry on.
if [ "$http_code" != "200" ]; then
  echo "Warning: cleanup failed with HTTP ${http_code} — ${body}" >&2
  exit 0
fi

echo "Cleanup done: ${body}"
