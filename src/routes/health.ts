import { createRoute } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HealthResponseSchema } from "../types.js";

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check",
  description: "Returns 200 if the worker is running.",
  responses: {
    200: {
      description: "Worker is healthy",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

const healthRoutes = new OpenAPIHono<{ Bindings: Cloudflare.Env }>();

healthRoutes.openapi(healthRoute, (c) => {
  return c.json({ status: "ok" as const }, 200);
});

export default healthRoutes;
