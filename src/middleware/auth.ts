import type { Context, Next } from "hono";
import { parseApiKeys, type VendorConfig } from "../config.js";

/**
 * Middleware that validates the `X-Api-Key` header against configured keys.
 * On success, sets `c.set("vendor", vendorConfig)` for downstream handlers.
 * Returns 401 if the key is missing or invalid.
 */
export async function authMiddleware(
  c: Context<{ Bindings: Cloudflare.Env; Variables: { vendor: VendorConfig } }>,
  next: Next,
): Promise<Response | void> {
  const apiKey = c.req.header("X-Api-Key");

  if (!apiKey) {
    return c.json({ error: "Missing X-Api-Key header" }, 401);
  }

  const keyMap = parseApiKeys(c.env.API_KEYS);
  const vendor = keyMap[apiKey];

  if (!vendor) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  c.set("vendor", vendor);
  await next();
}
