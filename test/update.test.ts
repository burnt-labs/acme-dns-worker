import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import updateRoutes from "../src/routes/update.js";

// ---------------------------------------------------------------------------
// We mock the CloudflareDnsService so tests never hit the real CF API.
// ---------------------------------------------------------------------------
const mockUpsertAcmeChallenge = vi.fn();

vi.mock("../src/services/cloudflare-dns.js", () => ({
  CloudflareDnsService: vi.fn().mockImplementation(() => ({
    upsertAcmeChallenge: mockUpsertAcmeChallenge,
  })),
}));

// ---------------------------------------------------------------------------
// Build a test app that injects env bindings
// ---------------------------------------------------------------------------
function buildApp() {
  const app = new OpenAPIHono<{ Bindings: Cloudflare.Env }>();

  app.use("*", async (c, next) => {
    c.env = {
      API_KEYS: JSON.stringify({
        "test-key-1": {
          name: "vendor-alpha",
          domains: [
            "rpc.xion-testnet-2.burnt.com",
            "api.xion-testnet-2.burnt.com",
            "rpc.xion-mainnet-1.burnt.com",
            "api.xion-mainnet-1.burnt.com",
          ],
        },
        "test-key-2": {
          name: "vendor-beta",
          domains: ["beta.example.com"],
        },
      }),
      CF_API_TOKEN: "fake-token",
      CF_ZONE_ID: "fake-zone-id",
    } satisfies Cloudflare.Env;
    await next();
  });

  app.route("/", updateRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function postUpdate(
  app: ReturnType<typeof buildApp>,
  body: unknown,
  apiKey = "test-key-1",
) {
  return app.request("/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsertAcmeChallenge.mockResolvedValue({
      id: "rec-1",
      type: "TXT",
      name: "_acme-challenge.rpc.xion-testnet-2.burnt.com",
      content: "challenge-token-abc123",
      ttl: 120,
    });
  });

  it("returns 401 without API key", async () => {
    const app = buildApp();
    const res = await app.request("/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subdomain: "rpc.xion-testnet-2.burnt.com",
        txt: "abc",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const app = buildApp();
    const res = await app.request("/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": "test-key-1",
      },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when subdomain is missing", async () => {
    const app = buildApp();
    const res = await postUpdate(app, { txt: "abc" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when txt is missing", async () => {
    const app = buildApp();
    const res = await postUpdate(app, {
      subdomain: "rpc.xion-testnet-2.burnt.com",
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for disallowed domain", async () => {
    const app = buildApp();
    const res = await postUpdate(app, {
      subdomain: "evil.example.com",
      txt: "challenge-token",
    });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/not in the allow-list/);
  });

  it("returns 200 and updates TXT record for allowed domain", async () => {
    const app = buildApp();
    const res = await postUpdate(app, {
      subdomain: "rpc.xion-testnet-2.burnt.com",
      txt: "LHDhK3oGRvkiefQnx7OOczTY5Tic_xZ6HcMOc_gmtoM",
    });

    expect(res.status).toBe(200);
    const body = await res.json<{ txt: string; vendor: string }>();
    expect(body.txt).toBe(
      "LHDhK3oGRvkiefQnx7OOczTY5Tic_xZ6HcMOc_gmtoM",
    );
    expect(body.vendor).toBe("vendor-alpha");
    expect(mockUpsertAcmeChallenge).toHaveBeenCalledWith(
      "rpc.xion-testnet-2.burnt.com",
      "LHDhK3oGRvkiefQnx7OOczTY5Tic_xZ6HcMOc_gmtoM",
    );
  });

  it("accepts all four allowed domains", async () => {
    const app = buildApp();
    const domains = [
      "rpc.xion-testnet-2.burnt.com",
      "api.xion-testnet-2.burnt.com",
      "rpc.xion-mainnet-1.burnt.com",
      "api.xion-mainnet-1.burnt.com",
    ];

    for (const domain of domains) {
      const res = await postUpdate(app, {
        subdomain: domain,
        txt: "token",
      });
      expect(res.status).toBe(200);
    }

    expect(mockUpsertAcmeChallenge).toHaveBeenCalledTimes(4);
  });

  it("is case-insensitive for domain matching", async () => {
    const app = buildApp();
    const res = await postUpdate(app, {
      subdomain: "RPC.XION-TESTNET-2.BURNT.COM",
      txt: "token",
    });
    expect(res.status).toBe(200);
  });

  it("returns 502 when Cloudflare API fails", async () => {
    mockUpsertAcmeChallenge.mockRejectedValue(
      new Error("CF API error"),
    );
    const app = buildApp();
    const res = await postUpdate(app, {
      subdomain: "rpc.xion-testnet-2.burnt.com",
      txt: "token",
    });
    expect(res.status).toBe(502);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/Failed to update/);
  });
});
