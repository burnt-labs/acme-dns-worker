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
    comment?: string,
  ): Promise<CfDnsRecord> {
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records`;
    const payload: Record<string, unknown> = { type: "TXT", name, content, ttl };
    if (comment) payload.comment = comment;

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
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
    comment?: string,
  ): Promise<CfDnsRecord> {
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records/${recordId}`;
    const payload: Record<string, unknown> = { type: "TXT", name, content, ttl };
    if (comment) payload.comment = comment;

    const res = await fetch(url, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify(payload),
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
   * Upsert a TXT record for an ACME challenge, scoped to a specific vendor.
   *
   * Records are tagged with a comment (`acme-dns:vendor=<name>`) so that
   * multiple vendors can manage TXT records for the same domain without
   * interfering with each other.
   *
   * Each vendor may hold up to `maxRecords` TXT records per challenge name
   * (default 2 — enough for simultaneous base + wildcard validation).
   */
  async upsertAcmeChallenge(
    domain: string,
    txt: string,
    vendor: string,
    maxRecords = 2,
  ): Promise<CfDnsRecord> {
    const name = `_acme-challenge.${domain}`;
    const tag = `acme-dns:vendor=${vendor}`;

    // Fetch all TXT records for this challenge name, then filter to this vendor
    const allRecords = await this.listTxtRecords(name);
    const vendorRecords = allRecords.filter((r) => r.comment === tag);

    if (vendorRecords.length === 0) {
      return this.createTxtRecord(name, txt, 120, tag);
    }

    // Already set to the same value — no-op
    const duplicate = vendorRecords.find((r) => r.content === txt);
    if (duplicate) {
      return duplicate;
    }

    if (vendorRecords.length < maxRecords) {
      // Still have room — create another record
      return this.createTxtRecord(name, txt, 120, tag);
    }

    // At capacity — replace the oldest (first) non-matching record
    const target = vendorRecords.find((r) => r.content !== txt) ?? vendorRecords[0];
    return this.updateTxtRecord(target.id, name, txt, 120, tag);
  }
}
