import type {
  CfApiListResponse,
  CfApiResponse,
  CfDnsRecord,
} from "../types.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Prefix for the `comment` field used to tag record ownership.
 *
 * This is the tag format already present in the zone, written by an earlier
 * version of the worker: records created before the comment was dropped still
 * carry `acme-dns:vendor=<name>`. Keeping the format means those records are
 * adopted by their owning vendor on the next renewal rather than orphaned
 * alongside a freshly created duplicate.
 */
const COMMENT_PREFIX = "acme-dns:vendor=";

/**
 * Ownership marker stored in a record's `comment` field, e.g.
 * `acme-dns:vendor=lav5`.
 *
 * Each vendor owns at most one TXT record per challenge name, and only ever
 * rewrites or deletes the record carrying its own marker. That is what makes
 * concurrent validation safe: two vendors validating the same domain at the
 * same time each hold their own record, so neither can destroy the other's
 * in-flight token. A TXT RRset holds many values, and ACME matches on any one
 * of them, so both validations succeed.
 *
 * Records without a recognised marker are never touched — they predate this
 * scheme and are left for the prune tooling to remove.
 */
export function vendorComment(vendor: string): string {
  return `${COMMENT_PREFIX}${vendor}`;
}

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
      throw new Error(`Cloudflare API failure: ${JSON.stringify(body.errors)}`);
    }

    return body.result;
  }

  /**
   * Create a new TXT record.
   */
  async createTxtRecord(
    name: string,
    content: string,
    comment?: string,
    ttl = 120,
  ): Promise<CfDnsRecord> {
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ type: "TXT", name, content, ttl, comment }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Cloudflare API error creating record: ${res.status} ${text}`,
      );
    }

    const body = (await res.json()) as CfApiResponse<CfDnsRecord>;
    if (!body.success) {
      throw new Error(`Cloudflare API failure: ${JSON.stringify(body.errors)}`);
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
    comment?: string,
    ttl = 120,
  ): Promise<CfDnsRecord> {
    const url = `${CF_API_BASE}/zones/${this.zoneId}/dns_records/${recordId}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ type: "TXT", name, content, ttl, comment }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Cloudflare API error updating record: ${res.status} ${text}`,
      );
    }

    const body = (await res.json()) as CfApiResponse<CfDnsRecord>;
    if (!body.success) {
      throw new Error(`Cloudflare API failure: ${JSON.stringify(body.errors)}`);
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
   * Find the record owned by `vendor` for a challenge name, if any.
   */
  private async findOwnedRecord(
    name: string,
    vendor: string,
  ): Promise<CfDnsRecord | undefined> {
    const marker = vendorComment(vendor);
    const existing = await this.listTxtRecords(name);
    return existing.find((r) => r.comment === marker);
  }

  /**
   * Upsert this vendor's TXT record for an ACME challenge.
   *
   * The vendor's own record is reused if it already exists, so repeated
   * validations do not grow the RRset. Records belonging to other vendors, and
   * untagged records, are left untouched.
   */
  async upsertAcmeChallenge(
    domain: string,
    txt: string,
    vendor: string,
  ): Promise<CfDnsRecord> {
    const name = `_acme-challenge.${domain}`;
    const marker = vendorComment(vendor);

    const owned = await this.findOwnedRecord(name, vendor);

    if (!owned) {
      return this.createTxtRecord(name, txt, marker);
    }

    if (owned.content === txt) {
      // Already set to the same value
      return owned;
    }

    return this.updateTxtRecord(owned.id, name, txt, marker);
  }

  /**
   * Delete this vendor's TXT record for an ACME challenge.
   *
   * Returns whether a record was actually removed, so a cleanup that finds
   * nothing to do is a success rather than an error.
   */
  async deleteAcmeChallenge(domain: string, vendor: string): Promise<boolean> {
    const name = `_acme-challenge.${domain}`;

    const owned = await this.findOwnedRecord(name, vendor);
    if (!owned) {
      return false;
    }

    await this.deleteTxtRecord(owned.id);
    return true;
  }
}
