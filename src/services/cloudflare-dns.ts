import type {
  CfApiListResponse,
  CfApiResponse,
  CfDnsRecord,
} from "../types.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Minimal Cloudflare DNS API client scoped to a single zone.
 */
export class CloudflareDnsService {
  constructor(
    private readonly zoneId: string,
    private readonly apiToken: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * List TXT records matching an exact name (e.g. `_acme-challenge.app.example.com`).
   */
  async listTxtRecords(name: string): Promise<CfDnsRecord[]> {
    const params = new URLSearchParams({ type: "TXT", name });
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records?${params}`;

    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Cloudflare API error listing records: ${res.status} ${text}`,
      );
    }

    const body = (await res.json()) as CfApiListResponse<CfDnsRecord>;
    if (!body.success) {
      throw new Error(
        `Cloudflare API failure: ${JSON.stringify(body.errors)}`,
      );
    }

    return body.result;
  }

  /**
   * Create a new TXT record.
   */
  async createTxtRecord(
    name: string,
    content: string,
    ttl = 120,
  ): Promise<CfDnsRecord> {
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ type: "TXT", name, content, ttl }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Cloudflare API error creating record: ${res.status} ${text}`,
      );
    }

    const body = (await res.json()) as CfApiResponse<CfDnsRecord>;
    if (!body.success) {
      throw new Error(
        `Cloudflare API failure: ${JSON.stringify(body.errors)}`,
      );
    }

    return body.result;
  }

  /**
   * Update an existing TXT record by ID.
   */
  async updateTxtRecord(
    recordId: string,
    name: string,
    content: string,
    ttl = 120,
  ): Promise<CfDnsRecord> {
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records/${recordId}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ type: "TXT", name, content, ttl }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Cloudflare API error updating record: ${res.status} ${text}`,
      );
    }

    const body = (await res.json()) as CfApiResponse<CfDnsRecord>;
    if (!body.success) {
      throw new Error(
        `Cloudflare API failure: ${JSON.stringify(body.errors)}`,
      );
    }

    return body.result;
  }

  /**
   * Delete a TXT record by ID.
   */
  async deleteTxtRecord(recordId: string): Promise<void> {
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records/${recordId}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Cloudflare API error deleting record: ${res.status} ${text}`,
      );
    }
  }

  /**
   * Upsert a TXT record for an ACME challenge.
   *
   * Follows acme-dns semantics: keeps up to 2 TXT records for the same name
   * to support simultaneous base + wildcard validation. If there are already 2,
   * the oldest one is replaced.
   */
  async upsertAcmeChallenge(domain: string, txt: string): Promise<CfDnsRecord> {
    const name = `_acme-challenge.${domain}`;

    const existing = await this.listTxtRecords(name);

    if (existing.length === 0) {
      // No records yet — create one
      return this.createTxtRecord(name, txt);
    }

    if (existing.length === 1) {
      if (existing[0].content === txt) {
        // Already set to the same value
        return existing[0];
      }
      // Create a second record (for wildcard + base domain support)
      return this.createTxtRecord(name, txt);
    }

    // 2+ records exist — replace the oldest (first in list, assuming default ordering)
    // or find one that's not equal to the new value
    const target =
      existing.find((r) => r.content !== txt) ?? existing[0];

    return this.updateTxtRecord(target.id, name, txt);
  }
}
