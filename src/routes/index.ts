import { OpenAPIHono } from "@hono/zod-openapi";
import cleanupRoutes from "./cleanup.js";
import healthRoutes from "./health.js";
import updateRoutes from "./update.js";

const routes = new OpenAPIHono<{ Bindings: Cloudflare.Env }>();

routes.route("/", healthRoutes);
routes.route("/", updateRoutes);
routes.route("/", cleanupRoutes);

export default routes;
