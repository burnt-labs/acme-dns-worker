#!/usr/bin/env bash
# ------------------------------------------------------------------
# Simple script to obtain certs using acme-dns-worker + certbot
#
# Prerequisites:
#   - certbot installed
#   - One API key per vendor from the worker operator
#
# Usage:
#   export ACME_DNS_WORKER_URL="https://acme-dns.example.com"
#   export ACME_CORP_API_KEY="key-for-acme-corp"
#   export GLOBEX_API_KEY="key-for-globex"
#   ./get-cert.sh
#   ./get-cert.sh --work-dir ./tmp   # run without root
# ------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERTBOT_DIR="${CERTBOT_DIR:-${SCRIPT_DIR}/.certbot}"

: "${ACME_DNS_WORKER_URL:?Set ACME_DNS_WORKER_URL}"

# ------------------------------------------------------------------
# Vendor definitions — each vendor has its own API key and domains.
# Add/remove vendors as needed.
#
# Format:
#   VENDORS["<name>"]="<api-key>"
#   VENDOR_DOMAINS["<name>"]="<domain1> <domain2> ..."
# ------------------------------------------------------------------
declare -A VENDORS
declare -A VENDOR_DOMAINS

VENDORS["acme-corp"]="${ACME_CORP_API_KEY:?Set ACME_CORP_API_KEY}"
VENDOR_DOMAINS["acme-corp"]="app.acme-corp.example.com api.acme-corp.example.com"

VENDORS["globex"]="${GLOBEX_API_KEY:?Set GLOBEX_API_KEY}"
VENDOR_DOMAINS["globex"]="app.globex.example.com api.globex.example.com"

# ------------------------------------------------------------------

for vendor in "${!VENDORS[@]}"; do
  api_key="${VENDORS[$vendor]}"
  read -ra domains <<< "${VENDOR_DOMAINS[$vendor]}"

  domain_args=""
  for d in "${domains[@]}"; do
    domain_args="${domain_args} -d ${d}"
  done

  echo ""
  echo "=== Vendor: ${vendor} ==="
  echo "Requesting certificate for: ${domains[*]}"

  ACME_DNS_WORKER_API_KEY="${api_key}" \
  certbot certonly \
    --manual \
    --preferred-challenges dns \
    --manual-auth-hook "${SCRIPT_DIR}/certbot-auth-hook.sh" \
    --manual-cleanup-hook "${SCRIPT_DIR}/certbot-cleanup-hook.sh" \
    --config-dir "${CERTBOT_DIR}/config" \
    --work-dir "${CERTBOT_DIR}/work" \
    --logs-dir "${CERTBOT_DIR}/logs" \
    ${domain_args} \
    --agree-tos \
    --non-interactive \
    "$@"

  echo "=== Done: ${vendor} ==="
done

echo ""
echo "All certificates are in ${CERTBOT_DIR}/config/live/"
