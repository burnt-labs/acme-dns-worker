import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import type { VendorConfig } from "../config.js";
import { authMiddleware } from "../middleware/auth.js";
import { CloudflareDnsService } from "../services/cloudflare-dns.js";
import {
  UpdateRequestSchema,
  UpdateResponseSchema,
  ErrorResponseSchema,
} from "../types.js";

type UpdateEnv = {
  Bindings: Cloudflare.Env;
  Variables: {
    vendor: VendorConfig;
  };
};

const updateRoute = createRoute({
  method: "post",
  path: "/update",
  tags: ["ACME DNS"],
  summary: "Update ACME DNS-01 challenge TXT record",
  description:
    "Sets a `_acme-challenge.<subdomain>` TXT record via the Cloudflare DNS API. " +
    "Records are scoped per-vendor so multiple vendors can manage the same domain. " +
    "Each vendor may hold up to `maxRecords` concurrent TXT records per domain.",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: UpdateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "TXT record updated successfully",
      content: {
        "application/json": {
          schema: UpdateResponseSchema,
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

const updateRoutes = new OpenAPIHono<UpdateEnv>();

updateRoutes.use("/update", authMiddleware);

updateRoutes.openapi(updateRoute, async (c) => {
  const { subdomain, txt } = c.req.valid("json");

  // --- check vendor domain allow-list ----------------------------------------
  const vendorConfig = c.get("vendor");
  const vendor = vendorConfig?.name ?? "unknown";
  const maxRecords = vendorConfig?.domains[subdomain];

  if (maxRecords === undefined) {
    return c.json({ error: `Domain "${subdomain}" is not in the allow-list` }, 403);
  }

  // --- upsert TXT record via Cloudflare API ----------------------------------
  const dns = new CloudflareDnsService(c.env.CF_ZONE_ID, c.env.CF_API_TOKEN);

  try {
    await dns.upsertAcmeChallenge(subdomain, txt, vendor, maxRecords);
  } catch (err) {
    console.error(`Cloudflare DNS API error (vendor=${vendor}):`, err);
    return c.json({ error: "Failed to update DNS record" }, 502);
  }

  console.log(`TXT record updated: domain=${subdomain} vendor=${vendor}`);
  return c.json({ txt, vendor }, 200);
});

export default updateRoutes;
