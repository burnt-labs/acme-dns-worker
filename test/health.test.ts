import { describe, it, expect } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import healthRoutes from "../src/routes/health.js";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const app = new OpenAPIHono();
    app.route("/", healthRoutes);

    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
