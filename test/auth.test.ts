import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../src/middleware/auth.js";
import type { VendorConfig } from "../src/config.js";

function buildApp(apiKeys: Record<string, VendorConfig>) {
  const app = new Hono<{ Bindings: Cloudflare.Env }>();

  app.use("*", async (c, next) => {
    // Inject env
    c.env = { API_KEYS: JSON.stringify(apiKeys) } as Cloudflare.Env;
    await next();
  });

  app.post("/test", authMiddleware, (c) =>
    c.json({ ok: true, vendor: c.get("vendor") }),
  );
  return app;
}

describe("authMiddleware", () => {
  it("returns 401 when X-Api-Key header is missing", async () => {
    const app = buildApp({ "valid-key": { name: "vendor-a", domains: { "a.com": 2 } } });
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/Missing/);
  });

  it("returns 401 for invalid API key", async () => {
    const app = buildApp({ "valid-key": { name: "vendor-a", domains: { "a.com": 2 } } });
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Api-Key": "wrong-key" },
    });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/Invalid/);
  });

  it("passes through for a valid API key and sets vendor", async () => {
    const app = buildApp({
      key1: { name: "acme-corp", domains: { "a.com": 2 } },
      key2: { name: "widgets-inc", domains: { "b.com": 4 } },
    });
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Api-Key": "key2" },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; vendor: { name: string; domains: Record<string, number> } }>();
    expect(body.ok).toBe(true);
    expect(body.vendor.name).toBe("widgets-inc");
    expect(body.vendor.domains).toEqual({ "b.com": 4 });
  });
});
