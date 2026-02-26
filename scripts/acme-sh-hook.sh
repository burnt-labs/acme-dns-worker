#!/usr/bin/env bash
# ------------------------------------------------------------------
# acme.sh DNS hook for acme-dns-worker
#
# Usage:
#   export ACME_DNS_WORKER_URL="https://acme-dns.burnt.com"
#   export ACME_DNS_WORKER_API_KEY="your-api-key"
#
#   acme.sh --issue \
#     -d rpc.xion-testnet-2.burnt.com \
#     --dns dns_acme_dns_worker
#
# Or for multiple domains:
#   acme.sh --issue \
#     -d rpc.xion-testnet-2.burnt.com \
#     -d api.xion-testnet-2.burnt.com \
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
  # Cleanup is optional — the TXT records get overwritten on the next update
  echo "Cleanup: TXT records will be overwritten on next certificate renewal."
  return 0
}
