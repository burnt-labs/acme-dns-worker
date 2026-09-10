#!/usr/bin/env bash
# ------------------------------------------------------------------
# certbot cleanup hook for acme-dns-worker
#
# Removes the challenge records this vendor created, so the RRset does not
# accumulate stale tokens between renewals. A vendor may hold two at once
# (base + wildcard); cleanup removes all of them.
#
# certbot sets:
#   CERTBOT_DOMAIN — the domain that was validated
# ------------------------------------------------------------------

set -euo pipefail

: "${ACME_DNS_WORKER_URL:?Set ACME_DNS_WORKER_URL}"
: "${ACME_DNS_WORKER_API_KEY:?Set ACME_DNS_WORKER_API_KEY}"

echo "Removing ACME challenge for ${CERTBOT_DOMAIN}..."

# Cleanup runs after issuance has already succeeded or failed, so nothing here
# may fail the renewal. `set -e` would abort on a transient curl error before
# the checks below, so the request is deliberately run with -e disabled and its
# exit status inspected by hand.
set +e
response=$(curl -s -w "\n%{http_code}" \
  -X POST "${ACME_DNS_WORKER_URL}/cleanup" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ${ACME_DNS_WORKER_API_KEY}" \
  -d "{\"subdomain\": \"${CERTBOT_DOMAIN}\"}")
curl_status=$?
set -e

if [ "$curl_status" -ne 0 ]; then
  echo "Warning: cleanup request failed (curl exit ${curl_status})" >&2
  exit 0
fi

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -1)

if [ "$http_code" != "200" ]; then
  echo "Warning: cleanup failed with HTTP ${http_code} — ${body}" >&2
  exit 0
fi

echo "Cleanup done: ${body}"
