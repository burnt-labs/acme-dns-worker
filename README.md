# acme-dns-worker

Cloudflare Worker that provides an [acme-dns](https://github.com/joohoi/acme-dns)–compatible API for managing ACME DNS-01 challenges via the **Cloudflare DNS API**.

Instead of running a custom DNS server, this worker creates/updates `_acme-challenge.<domain>` TXT records through Cloudflare's API. Domains are restricted to a configurable allow-list.

## Record ownership

Each vendor owns at most one TXT record per challenge name. Ownership is recorded in the record's Cloudflare `comment` field as `acme-dns:vendor=<name>`, and a vendor only ever rewrites or deletes a record carrying its own marker.

This is what makes concurrent validation safe. A TXT RRset holds many values and ACME matches on any one of them, so several vendors can validate the same domain at the same time, each holding its own record, without destroying each other's in-flight token. Records with no recognised marker are never modified.

Vendors are expected to call `/cleanup` when a validation finishes; without it, each vendor's record simply persists and is reused by its next renewal.

## API

### `GET /health`

Returns `200 { "status": "ok" }`.

### `GET /docs`

Swagger UI.

### `GET /openapi.json`

OpenAPI 3.1 spec.

### `POST /update`

Set the ACME DNS-01 challenge TXT record for a domain.

**Headers:**

| Header      | Required | Description        |
| ----------- | -------- | ------------------ |
| `X-Api-Key` | Yes      | Pre-shared API key |

**Body (JSON):**

```json
{
  "subdomain": "app.example.com",
  "txt": "LHDhK3oGRvkiefQnx7OOczTY5Tic_xZ6HcMOc_gmtoM"
}
```

**Responses:**

| Status | Description                |
| ------ | -------------------------- |
| 200    | TXT record updated         |
| 400    | Invalid request body       |
| 401    | Missing or invalid API key |
| 403    | Domain not in allow-list   |
| 502    | Cloudflare DNS API error   |

### `POST /cleanup`

Remove the calling vendor's ACME DNS-01 challenge TXT record.

**Headers:**

| Header      | Required | Description        |
| ----------- | -------- | ------------------ |
| `X-Api-Key` | Yes      | Pre-shared API key |

**Body (JSON):**

```json
{
  "subdomain": "app.example.com"
}
```

Deleting a record that does not exist is a success (`deleted: false`), so cleanup hooks are idempotent and safe to retry.

**Responses:**

| Status | Description                                    |
| ------ | ---------------------------------------------- |
| 200    | Record removed, or there was nothing to remove |
| 400    | Invalid request body                           |
| 401    | Missing or invalid API key                     |
| 403    | Domain not in allow-list                       |
| 502    | Cloudflare DNS API error                       |

## Setup

### 1. Install

```sh
pnpm install
```

### 2. Configure

Edit `wrangler.jsonc`:

- Set the production `routes` pattern to your desired custom domain

### 3. Set secrets

```sh
# JSON map of API keys → vendor names
wrangler secret put API_KEYS --env production

# Cloudflare API token with Zone.DNS edit permission
wrangler secret put CF_API_TOKEN --env production

# Cloudflare zone ID for the target domain
wrangler secret put CF_ZONE_ID --env production

# Comma-separated list of domains vendors can request certs for
wrangler secret put ALLOWED_DOMAINS --env production
```

### 4. Deploy

```sh
pnpm run deploy:production
```

## Development

```sh
# Create .dev.vars with local secrets
cat > .dev.vars <<'EOF'
API_KEYS={"dev-key-1":"local-vendor"}
CF_API_TOKEN=your-cf-api-token
CF_ZONE_ID=your-zone-id
ALLOWED_DOMAINS=app.example.com,api.example.com
EOF

pnpm dev
```

## Tests

```sh
pnpm test
```

## Examples

See the `examples/` directory for hook scripts for popular ACME clients:

- **certbot** — `certbot-auth-hook.sh` + `certbot-cleanup-hook.sh`
- **acme.sh** — `acme-sh-hook.sh`
- **lego** — `lego-hook.sh` (also used by Traefik)
- **Caddy** — `Caddyfile`
- **get-cert.sh** — Wrapper script that runs certbot with the hooks
