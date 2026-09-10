/**
 * Vendor configuration attached to an API key.
 */
export interface VendorConfig {
  name: string;
  domains: string[];
}

/**
 * API key → vendor config mapping.
 * Stored as a JSON secret:
 * ```json
 * {
 *   "<api-key>": { "name": "<vendor>", "domains": ["a.example.com", ...] },
 *   ...
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
      throw new Error(
        `API_KEYS["${key}"] must be an object with name and domains`,
      );
    }
    const v = value as Record<string, unknown>;
    if (typeof v.name !== "string" || !v.name) {
      throw new Error(`API_KEYS["${key}"].name must be a non-empty string`);
    }
    if (
      !Array.isArray(v.domains) ||
      !v.domains.every((d) => typeof d === "string")
    ) {
      throw new Error(`API_KEYS["${key}"].domains must be an array of strings`);
    }
    // Normalise domains to lowercase
    v.domains = (v.domains as string[]).map((d) => d.trim().toLowerCase());
  }

  return map as unknown as ApiKeyMap;
}

/**
 * Whether a vendor may manage the challenge record for `subdomain`.
 *
 * Matching is exact against the vendor's configured domains, which are
 * normalised to lowercase by `parseApiKeys`; request schemas lowercase the
 * incoming subdomain to match.
 */
export function isDomainAllowed(
  vendor: VendorConfig | undefined,
  subdomain: string,
): boolean {
  return vendor?.domains.includes(subdomain) ?? false;
}
