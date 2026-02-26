import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../src/middleware/auth.js";

function buildApp(apiKeys: Record<string, string>) {
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
    const app = buildApp({ "valid-key": "vendor-a" });
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/Missing/);
  });

  it("returns 401 for invalid API key", async () => {
    const app = buildApp({ "valid-key": "vendor-a" });
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Api-Key": "wrong-key" },
    });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/Invalid/);
  });

  it("passes through for a valid API key and sets vendor", async () => {
    const app = buildApp({ key1: "acme-corp", key2: "widgets-inc" });
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Api-Key": "key2" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, vendor: "widgets-inc" });
  });
});
