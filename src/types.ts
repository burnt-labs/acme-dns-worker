import { z } from "zod";

// ---------------------------------------------------------------------------
// OpenAPI schemas
// ---------------------------------------------------------------------------

export const UpdateRequestSchema = z.object({
  subdomain: z
    .string()
    .min(1, "subdomain is required")
    .describe("FQDN to set the challenge on, e.g. rpc.xion-testnet-2.burnt.com")
    .transform((v) => v.toLowerCase()),
  txt: z
    .string()
    .min(1, "txt is required")
    .max(255, "txt value too long")
    .describe("ACME DNS-01 challenge token"),
});

export const UpdateResponseSchema = z.object({
  txt: z.string().describe("The TXT record value that was set"),
  vendor: z.string().describe("Vendor name associated with the API key"),
});

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
});

export const ErrorResponseSchema = z.object({
  error: z.string().describe("Error message"),
});

export type UpdateRequest = z.infer<typeof UpdateRequestSchema>;
export type UpdateResponse = z.infer<typeof UpdateResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Shape of a single DNS record returned by the Cloudflare API. */
export interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
}

/** Cloudflare API list response wrapper. */
export interface CfApiListResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T[];
}

/** Cloudflare API single result wrapper. */
export interface CfApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}
