#!/usr/bin/env bash
# ------------------------------------------------------------------
# acme.sh DNS hook for acme-dns-worker
#
# Usage:
#   export ACME_DNS_WORKER_URL="https://acme-dns.example.com"
#   export ACME_DNS_WORKER_API_KEY="your-api-key"
#
#   acme.sh --issue \
#     -d app.example.com \
#     --dns dns_acme_dns_worker
#
# Or for multiple domains:
#   acme.sh --issue \
#     -d app.example.com \
#     -d api.example.com \
#     --dns dns_acme_dns_worker
# ------------------------------------------------------------------

dns_acme_dns_worker_add() {
  local fulldomain="$1"
  local txtvalue="$2"

  # Strip _acme-challenge. prefix to get the base domain
  local domain="${fulldomain#_acme-challenge.}"

  echo "Setting TXT record for ${domain} via acme-dns-worker..."

  local response
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "${ACME_DNS_WORKER_URL}/update" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ${ACME_DNS_WORKER_API_KEY}" \
    -d "{\"subdomain\": \"${domain}\", \"txt\": \"${txtvalue}\"}")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | head -1)

  if [ "$http_code" != "200" ]; then
    echo "Error: HTTP ${http_code} — ${body}"
    return 1
  fi

  echo "TXT record set successfully: ${body}"

  # Wait for DNS propagation
  echo "Waiting 10s for DNS propagation..."
  sleep 10
  return 0
}

dns_acme_dns_worker_rm() {
  local fulldomain="$1"

  # Strip _acme-challenge. prefix to get the base domain
  local domain="${fulldomain#_acme-challenge.}"

  echo "Removing TXT record for ${domain} via acme-dns-worker..."

  local response
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "${ACME_DNS_WORKER_URL}/cleanup" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: ${ACME_DNS_WORKER_API_KEY}" \
    -d "{\"subdomain\": \"${domain}\"}")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | head -1)

  # Issuance has already finished by the time cleanup runs, so a failure here
  # must not fail the certificate request.
  if [ "$http_code" != "200" ]; then
    echo "Warning: cleanup failed with HTTP ${http_code} — ${body}"
    return 0
  fi

  echo "Cleanup done: ${body}"
  return 0
}
