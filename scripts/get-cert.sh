#!/usr/bin/env bash
# ------------------------------------------------------------------
# Simple script to obtain certs using acme-dns-worker + certbot
#
# Prerequisites:
#   - certbot installed
#   - API key from Burnt Network
#
# Usage:
#   export ACME_DNS_WORKER_URL="https://acme-dns.burnt.com"
#   export ACME_DNS_WORKER_API_KEY="your-api-key"
#   ./get-cert.sh
#   ./get-cert.sh --work-dir ./tmp   # run without root
# ------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERTBOT_DIR="${SCRIPT_DIR}/.certbot"

: "${ACME_DNS_WORKER_URL:?Set ACME_DNS_WORKER_URL}"
: "${ACME_DNS_WORKER_API_KEY:?Set ACME_DNS_WORKER_API_KEY}"

# Domains to get a cert for (edit as needed)
DOMAINS=(
  "rpc.xion-testnet-2.burnt.com"
  "api.xion-testnet-2.burnt.com"
)

DOMAIN_ARGS=""
for d in "${DOMAINS[@]}"; do
  DOMAIN_ARGS="${DOMAIN_ARGS} -d ${d}"
done

echo "Requesting certificate for: ${DOMAINS[*]}"

certbot certonly \
  --manual \
  --preferred-challenges dns \
  --manual-auth-hook "${SCRIPT_DIR}/certbot-auth-hook.sh" \
  --manual-cleanup-hook "${SCRIPT_DIR}/certbot-cleanup-hook.sh" \
  --config-dir "${CERTBOT_DIR}/config" \
  --work-dir "${CERTBOT_DIR}/work" \
  --logs-dir "${CERTBOT_DIR}/logs" \
  ${DOMAIN_ARGS} \
  --agree-tos \
  --non-interactive \
  "$@"

echo "Done! Certificates are in /etc/letsencrypt/live/"
