import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import routes from "./routes/index.js";

const app = new OpenAPIHono<{ Bindings: Cloudflare.Env }>();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Api-Key"],
    maxAge: 86400,
  }),
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.route("/", routes);

// ---------------------------------------------------------------------------
// OpenAPI doc + Swagger UI
// ---------------------------------------------------------------------------
app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "ACME DNS Worker",
    version: "1.0.0",
    description:
      "Cloudflare Worker providing an acme-dns–compatible API for managing " +
      "ACME DNS-01 challenge TXT records via the Cloudflare DNS API.",
  },
  security: [{ ApiKeyAuth: [] }],
});

app.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-Api-Key",
  description: "Pre-shared vendor API key",
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));
app.get("/", (c) => c.redirect("/docs"));

// Catch-all 404
app.all("*", (c) => c.json({ error: "Not found" }, 404));

// ---------------------------------------------------------------------------
// Worker export
// ---------------------------------------------------------------------------
export default {
  async fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
