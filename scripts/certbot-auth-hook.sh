#!/usr/bin/env bash
# ------------------------------------------------------------------
# certbot manual hook scripts for acme-dns-worker
#
# Usage:
#   export ACME_DNS_WORKER_URL="https://acme-dns.example.com"
#   export ACME_DNS_WORKER_API_KEY="your-api-key"
#
#   certbot certonly \
#     --manual \
#     --preferred-challenges dns \
#     --manual-auth-hook ./certbot-auth-hook.sh \
#     --manual-cleanup-hook ./certbot-cleanup-hook.sh \
#     -d app.example.com \
#     -d api.example.com
#
# certbot sets these env vars for the hook:
#   CERTBOT_DOMAIN    — the domain being validated
#   CERTBOT_VALIDATION — the challenge token value
# ------------------------------------------------------------------

set -euo pipefail

echo "Setting ACME challenge for ${CERTBOT_DOMAIN}..."

response=$(curl -s -w "\n%{http_code}" \
  -X POST "${ACME_DNS_WORKER_URL}/update" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: ${ACME_DNS_WORKER_API_KEY}" \
  -d "{\"subdomain\": \"${CERTBOT_DOMAIN}\", \"txt\": \"${CERTBOT_VALIDATION}\"}")

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -1)

if [ "$http_code" != "200" ]; then
  echo "Error: HTTP ${http_code} — ${body}" >&2
  exit 1
fi

echo "TXT record set: ${body}"

# Wait for DNS propagation
echo "Waiting 10s for DNS propagation..."
sleep 10
