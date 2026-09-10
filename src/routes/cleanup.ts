import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { isDomainAllowed, type VendorConfig } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { CloudflareDnsService } from "../services/cloudflare-dns.js";
import {
  CleanupRequestSchema,
  CleanupResponseSchema,
  ErrorResponseSchema,
} from "../types.js";

type CleanupEnv = {
  Bindings: Cloudflare.Env;
  Variables: {
    vendor: VendorConfig;
  };
};

const cleanupRoute = createRoute({
  method: "post",
  path: "/cleanup",
  tags: ["ACME DNS"],
  summary: "Remove this vendor's ACME DNS-01 challenge TXT record",
  description:
    "Deletes every `_acme-challenge.<subdomain>` TXT record owned by the calling " +
    "vendor - a vendor may hold two at once for base + wildcard validation. " +
    "Records belonging to other vendors are never touched. Removing nothing is " +
    "a success, so cleanup hooks are idempotent.",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: CleanupRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Record removed, or there was nothing to remove",
      content: {
        "application/json": {
          schema: CleanupResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    401: {
      description: "Missing or invalid API key",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: "Domain not in allow-list",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    502: {
      description: "Cloudflare DNS API error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const cleanupRoutes = new OpenAPIHono<CleanupEnv>();

cleanupRoutes.use("/cleanup", authMiddleware);

cleanupRoutes.openapi(cleanupRoute, async (c) => {
  const { subdomain } = c.req.valid("json");

  // --- check vendor domain allow-list ----------------------------------------
  const vendorConfig = c.get("vendor");
  const vendor = vendorConfig?.name ?? "unknown";

  if (!isDomainAllowed(vendorConfig, subdomain)) {
    return c.json(
      { error: `Domain "${subdomain}" is not in the allow-list` },
      403,
    );
  }

  // --- delete this vendor's record via Cloudflare API -------------------------
  const dns = new CloudflareDnsService(c.env.CF_ZONE_ID, c.env.CF_API_TOKEN);

  let count: number;
  try {
    count = await dns.deleteAcmeChallenge(subdomain, vendor);
  } catch (err) {
    console.error(`Cloudflare DNS API error (vendor=${vendor}):`, err);
    return c.json({ error: "Failed to delete DNS record" }, 502);
  }

  console.log(
    `TXT record cleanup: domain=${subdomain} vendor=${vendor} removed=${count}`,
  );
  return c.json({ deleted: count > 0, count, vendor }, 200);
});

export default cleanupRoutes;
