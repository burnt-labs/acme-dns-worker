# acme-dns-worker

Cloudflare Worker that provides an [acme-dns](https://github.com/joohoi/acme-dns)–compatible API for managing ACME DNS-01 challenges on a fixed set of Burnt domains.

Instead of running a custom DNS server, this worker uses the **Cloudflare DNS API** to create/update `_acme-challenge.<domain>` TXT records.

## Allowed domains

- `rpc.xion-testnet-2.burnt.com`
- `api.xion-testnet-2.burnt.com`
- `rpc.xion-mainnet-1.burnt.com`
- `api.xion-mainnet-1.burnt.com`

## API

### `GET /health`

Returns `200 { "status": "ok" }`.

### `POST /update`

Set the ACME DNS-01 challenge TXT record for a domain.

**Headers:**

| Header      | Required | Description            |
| ----------- | -------- | ---------------------- |
| `X-Api-Key` | Yes      | Pre-shared API key     |

**Body (JSON):**

```json
{
  "subdomain": "rpc.xion-testnet-2.burnt.com",
  "txt": "LHDhK3oGRvkiefQnx7OOczTY5Tic_xZ6HcMOc_gmtoM"
}
```

**Responses:**

| Status | Description                    |
| ------ | ------------------------------ |
| 200    | TXT record updated             |
| 400    | Invalid request body           |
| 401    | Missing or invalid API key     |
| 403    | Domain not in allow-list       |
| 502    | Cloudflare DNS API error       |

## Setup

### 1. Install

```sh
npm install
```

### 2. Configure secrets

```sh
# Comma-separated API keys for third-party vendors
wrangler secret put API_KEYS

# Cloudflare API token with Zone.DNS edit permission for burnt.com
wrangler secret put CF_API_TOKEN
```

### 3. Set the zone ID

Edit `wrangler.jsonc` and fill in `CF_ZONE_ID` for your burnt.com zone.

### 4. Deploy

```sh
npm run deploy:production
```

## Development

```sh
# Create .dev.vars with local secrets
cat > .dev.vars <<'EOF'
API_KEYS=dev-key-1,dev-key-2
CF_API_TOKEN=your-cf-api-token
CF_ZONE_ID=your-zone-id
EOF

npm run dev
```

## Tests

```sh
npm test
```
