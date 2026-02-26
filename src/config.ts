/** Domains that third parties may request ACME challenges for. */
export const DEFAULT_ALLOWED_DOMAINS = [
  "rpc.xion-testnet-2.burnt.com",
  "api.xion-testnet-2.burnt.com",
  "rpc.xion-mainnet-1.burnt.com",
  "api.xion-mainnet-1.burnt.com",
] as const;

/** Parse the comma-separated ALLOWED_DOMAINS env var into a Set. */
export function parseAllowedDomains(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * API key → vendor name mapping.
 * Stored as a JSON secret: `{ "<api-key>": "<vendor-name>", ... }`
 */
export type ApiKeyMap = Record<string, string>;

/** Parse the API_KEYS JSON secret into a key→vendor map. */
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
  return parsed as ApiKeyMap;
}
