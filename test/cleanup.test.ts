import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import cleanupRoutes from "../src/routes/cleanup.js";

// ---------------------------------------------------------------------------
// We mock the CloudflareDnsService so tests never hit the real CF API.
// ---------------------------------------------------------------------------
const mockDeleteAcmeChallenge = vi.fn();

vi.mock("../src/services/cloudflare-dns.js", () => ({
  CloudflareDnsService: vi.fn().mockImplementation(function () {
    return { deleteAcmeChallenge: mockDeleteAcmeChallenge };
  }),
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

  app.route("/", cleanupRoutes);
  return app;
}

function postCleanup(
  app: ReturnType<typeof buildApp>,
  body: unknown,
  apiKey = "test-key-1",
) {
  return app.request("/cleanup", {
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
describe("POST /cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteAcmeChallenge.mockResolvedValue(true);
  });

  it("returns 401 without API key", async () => {
    const app = buildApp();
    const res = await app.request("/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subdomain: "rpc.xion-testnet-2.burnt.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when subdomain is missing", async () => {
    const app = buildApp();
    const res = await postCleanup(app, {});
    expect(res.status).toBe(400);
  });

  it("returns 403 for a domain outside the vendor's allow-list", async () => {
    const app = buildApp();
    const res = await postCleanup(app, { subdomain: "beta.example.com" });
    expect(res.status).toBe(403);
    expect(mockDeleteAcmeChallenge).not.toHaveBeenCalled();
  });

  it("deletes the calling vendor's record and reports it", async () => {
    const app = buildApp();
    const res = await postCleanup(app, {
      subdomain: "rpc.xion-testnet-2.burnt.com",
    });

    expect(res.status).toBe(200);
    const body = await res.json<{ deleted: boolean; vendor: string }>();
    expect(body).toEqual({ deleted: true, vendor: "vendor-alpha" });
    expect(mockDeleteAcmeChallenge).toHaveBeenCalledWith(
      "rpc.xion-testnet-2.burnt.com",
      "vendor-alpha",
    );
  });

  it("is idempotent when there is nothing to delete", async () => {
    mockDeleteAcmeChallenge.mockResolvedValue(false);
    const app = buildApp();
    const res = await postCleanup(app, {
      subdomain: "rpc.xion-testnet-2.burnt.com",
    });

    expect(res.status).toBe(200);
    const body = await res.json<{ deleted: boolean }>();
    expect(body.deleted).toBe(false);
  });

  it("scopes the delete to the calling vendor", async () => {
    const app = buildApp();
    await postCleanup(app, { subdomain: "beta.example.com" }, "test-key-2");

    expect(mockDeleteAcmeChallenge).toHaveBeenCalledWith(
      "beta.example.com",
      "vendor-beta",
    );
  });

  it("is case-insensitive for domain matching", async () => {
    const app = buildApp();
    const res = await postCleanup(app, {
      subdomain: "RPC.XION-TESTNET-2.BURNT.COM",
    });
    expect(res.status).toBe(200);
  });

  it("returns 502 when Cloudflare API fails", async () => {
    mockDeleteAcmeChallenge.mockRejectedValue(new Error("CF API error"));
    const app = buildApp();
    const res = await postCleanup(app, {
      subdomain: "rpc.xion-testnet-2.burnt.com",
    });
    expect(res.status).toBe(502);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/Failed to delete/);
  });
});
