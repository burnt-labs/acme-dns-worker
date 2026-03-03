/** Default max TXT records a vendor may hold per challenge name. */
export const DEFAULT_MAX_RECORDS = 2;

/**
 * Vendor configuration attached to an API key.
 */
export interface VendorConfig {
  name: string;
  /** Map of domain → max concurrent TXT records for that domain. */
  domains: Record<string, number>;
}

/**
 * API key → vendor config mapping.
 * Stored as a JSON secret:
 * ```json
 * {
 *   "<api-key>": {
 *     "name": "<vendor>",
 *     "domains": { "rpc.example.com": 4, "api.example.com": 2 }
 *   }
 * }
 * ```
 */
export type ApiKeyMap = Record<string, VendorConfig>;

/** Parse the API_KEYS JSON secret into a key→vendor-config map. */
export function parseApiKeys(raw: string): ApiKeyMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("API_KEYS is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("API_KEYS must be a JSON object");
  }

  const map = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`API_KEYS["${key}"] must be an object with name and domains`);
    }
    const v = value as Record<string, unknown>;
    if (typeof v.name !== "string" || !v.name) {
      throw new Error(`API_KEYS["${key}"].name must be a non-empty string`);
    }
    if (typeof v.domains !== "object" || v.domains === null || Array.isArray(v.domains)) {
      throw new Error(`API_KEYS["${key}"].domains must be an object mapping domain names to maxRecords`);
    }
    // Normalise domain keys to lowercase and validate maxRecords values
    const normalized: Record<string, number> = {};
    for (const [domain, max] of Object.entries(v.domains as Record<string, unknown>)) {
      const d = domain.trim().toLowerCase();
      if (!d) continue;
      if (typeof max !== "number" || !Number.isInteger(max) || max < 1) {
        throw new Error(`API_KEYS["${key}"].domains["${domain}"] must be a positive integer (maxRecords)`);
      }
      normalized[d] = max;
    }
    v.domains = normalized;
  }

  return map as unknown as ApiKeyMap;
}
