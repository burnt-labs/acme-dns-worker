# CLAUDE.md — acme-dns-worker

## Project Overview

Cloudflare Worker providing an acme-dns-compatible API for ACME DNS-01 challenges via the Cloudflare DNS API. Instead of running a custom DNS server, it creates/updates `_acme-challenge.<domain>` TXT records through Cloudflare's API with per-vendor domain allow-lists.

- **Runtime**: Cloudflare Workers (ESNext, nodejs_compat)
- **Framework**: Hono + @hono/zod-openapi + Swagger UI
- **Package Manager**: pnpm (>=10.28.1)
- **Language**: TypeScript (strict mode)

## Build & Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start local dev server (wrangler dev) |
| `pnpm test` | Run tests once (vitest run) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with v8 coverage |
| `pnpm deploy` | Deploy to Cloudflare Workers |
| `pnpm cf-typegen` | Regenerate Cloudflare bindings types |
| `pnpm sync-vendors` | Sync vendors.json → .dev.vars |
| `pnpm deploy-vendors` | Push vendors.json to CF secrets |

## Architecture

```
src/
├── index.ts                 # App bootstrap: OpenAPIHono, logger, CORS, routes, Swagger UI
├── config.ts                # parseApiKeys() — validates API_KEYS JSON into ApiKeyMap
├── types.ts                 # Zod schemas (UpdateRequest, UpdateResponse, etc.) & CF API types
├── middleware/
│   └── auth.ts              # X-Api-Key validation, sets c.var.vendor on success
├── routes/
│   ├── index.ts             # Route aggregator
│   ├── health.ts            # GET /health — unauthenticated health check
│   └── update.ts            # POST /update — core ACME challenge endpoint (authenticated)
└── services/
    └── cloudflare-dns.ts    # CloudflareDnsService: list/create/update/delete TXT records, upsertAcmeChallenge()
```

### API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | No | Health check → `{ status: "ok" }` |
| POST | `/update` | X-Api-Key | Upsert ACME DNS challenge TXT record |
| GET | `/docs` | No | Swagger UI |
| GET | `/openapi.json` | No | OpenAPI 3.1 spec |

### Key Data Flow (POST /update)

1. `authMiddleware` validates X-Api-Key header against parsed `API_KEYS` env
2. Route validates request body (`{ subdomain, txt }`) via Zod
3. Checks subdomain is in vendor's domain allow-list (403 if not)
4. `CloudflareDnsService.upsertAcmeChallenge()` creates/updates `_acme-challenge.{domain}` TXT record
5. Supports up to 2 concurrent TXT records per challenge name (wildcard + base domain)

## Testing

- **Framework**: Vitest with `@cloudflare/vitest-pool-workers`
- **Config**: `vitest.config.ts` (10s timeout, v8 coverage)
- **Location**: `test/` directory, one test file per module

### Test patterns

- Mock CloudflareDnsService: `vi.mock("../src/services/cloudflare-dns.js")`
- Mock global fetch: `vi.stubGlobal("fetch", mockFetch)`
- Helper functions: `buildApp()` for creating test Hono instances, `cfOk<T>`/`cfOkList<T>` for CF API response fixtures
- `beforeEach` with `vi.clearAllMocks()` for test isolation

## Environment Variables / Secrets

Required secrets (set via `wrangler secret put` or `.dev.vars` locally):

| Secret | Purpose |
|--------|---------|
| `API_KEYS` | JSON map: `{"api-key": {"name": "vendor-name", "domains": ["example.com"]}}` |
| `CF_API_TOKEN` | Cloudflare API token with Zone.DNS edit permission |
| `CF_ZONE_ID` | Cloudflare zone ID |

## Code Conventions

- **Imports**: ESM with `.js` extensions for local imports (e.g., `import X from "./path.js"`)
- **File names**: kebab-case (`cloudflare-dns.ts`)
- **Functions**: camelCase (`parseApiKeys`, `upsertAcmeChallenge`)
- **Types/Interfaces**: PascalCase (`VendorConfig`, `CfDnsRecord`)
- **Constants**: UPPER_SNAKE_CASE (`CF_API_BASE`)
- **Error responses**: `{ error: string }` with appropriate HTTP status (401, 403, 400, 502)
- **Section comments**: `// --- section name ----------------------------------------`
- **Hono context typing**: `Context<{ Bindings: Cloudflare.Env; Variables: { vendor: VendorConfig } }>`

## CI/CD

- **ci.yml**: Runs tests on PRs to main and pushes to main
- **deploy.yml**: On push to main — runs tests, then deploys via wrangler-action, then health checks
- Deployment target: `acme-dns.burnt.com` (custom domain)

## Key Files

- `wrangler.jsonc` — Worker config, routes, compatibility flags
- `vendors.example.json` — Example vendor API key configuration
- `scripts/` — Shell hooks for certbot, acme.sh, lego integration
- `examples/Caddyfile` — Caddy reverse proxy integration example
