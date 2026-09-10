import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CloudflareDnsService,
  vendorComment,
} from "../src/services/cloudflare-dns.js";

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function cfOk<T>(result: T) {
  return new Response(JSON.stringify({ success: true, errors: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function cfOkList<T>(result: T[]) {
  return new Response(JSON.stringify({ success: true, errors: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const ALPHA = vendorComment("alpha");
const BETA = vendorComment("beta");

function rec(
  id: string,
  content: string,
  comment?: string,
  created_on = "2026-01-01T00:00:00Z",
) {
  return {
    id,
    type: "TXT",
    name: "_acme-challenge.test.com",
    content,
    ttl: 120,
    comment: comment ?? null,
    created_on,
  };
}

describe("vendorComment", () => {
  it("matches the tag format already written in the zone", () => {
    // Records predating the comment being dropped carry this exact format;
    // changing it would orphan them instead of adopting them.
    expect(vendorComment("lav5")).toBe("acme-dns:vendor=lav5");
    expect(vendorComment("itrocket")).toBe("acme-dns:vendor=itrocket");
  });
});

describe("CloudflareDnsService", () => {
  let dns: CloudflareDnsService;

  beforeEach(() => {
    vi.clearAllMocks();
    dns = new CloudflareDnsService("zone-123", "token-abc");
  });

  describe("listTxtRecords", () => {
    it("calls CF API with correct URL and auth header", async () => {
      mockFetch.mockResolvedValue(cfOkList([]));

      await dns.listTxtRecords("_acme-challenge.example.com");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain("/zones/zone-123/dns_records");
      expect(url).toContain("type=TXT");
      expect(url).toContain("name=_acme-challenge.example.com");
      expect(opts.headers.Authorization).toBe("Bearer token-abc");
    });

    it("returns records from response", async () => {
      const records = [
        {
          id: "r1",
          type: "TXT",
          name: "_acme-challenge.example.com",
          content: "val1",
          ttl: 120,
        },
      ];
      mockFetch.mockResolvedValue(cfOkList(records));

      const result = await dns.listTxtRecords("_acme-challenge.example.com");
      expect(result).toEqual(records);
    });
  });

  describe("upsertAcmeChallenge", () => {
    it("creates a record tagged with the vendor when none exist", async () => {
      mockFetch.mockResolvedValueOnce(cfOkList([]));
      const created = rec("new-1", "tok", ALPHA);
      mockFetch.mockResolvedValueOnce(cfOk(created));

      const result = await dns.upsertAcmeChallenge("test.com", "tok", "alpha");

      expect(result).toEqual(created);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const createCall = mockFetch.mock.calls[1];
      expect(createCall[1].method).toBe("POST");
      const body = JSON.parse(createCall[1].body);
      expect(body.name).toBe("_acme-challenge.test.com");
      expect(body.content).toBe("tok");
      expect(body.comment).toBe(ALPHA);
    });

    it("adds a second record so base and wildcard validate together", async () => {
      // Issuing for example.com + *.example.com puts two challenges on the
      // same name; both tokens must be live at once, so the first must not be
      // rewritten while it is still awaiting validation.
      mockFetch.mockResolvedValueOnce(
        cfOkList([rec("r1", "base-token", ALPHA)]),
      );
      const created = rec("r2", "wildcard-token", ALPHA);
      mockFetch.mockResolvedValueOnce(cfOk(created));

      const result = await dns.upsertAcmeChallenge(
        "test.com",
        "wildcard-token",
        "alpha",
      );

      expect(result).toEqual(created);
      expect(mockFetch.mock.calls[1][1].method).toBe("POST");
      // The in-flight base token was not rewritten
      expect(String(mockFetch.mock.calls[1][0])).not.toContain(
        "/dns_records/r1",
      );
    });

    it("recycles its oldest record once at capacity", async () => {
      mockFetch.mockResolvedValueOnce(
        cfOkList([
          rec("r-new", "newer", ALPHA, "2026-02-02T00:00:00Z"),
          rec("r-old", "older", ALPHA, "2026-01-01T00:00:00Z"),
        ]),
      );
      const updated = rec("r-old", "third", ALPHA);
      mockFetch.mockResolvedValueOnce(cfOk(updated));

      await dns.upsertAcmeChallenge("test.com", "third", "alpha");

      const putCall = mockFetch.mock.calls[1];
      expect(putCall[1].method).toBe("PUT");
      // Oldest by created_on, regardless of the order the API returned them
      expect(putCall[0]).toContain("/dns_records/r-old");
      expect(putCall[0]).not.toContain("/dns_records/r-new");
    });

    it("is a no-op when the vendor already holds the value", async () => {
      const existing = rec("r1", "same", ALPHA);
      mockFetch.mockResolvedValueOnce(cfOkList([existing]));

      const result = await dns.upsertAcmeChallenge("test.com", "same", "alpha");

      expect(result).toEqual(existing);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("leaves another vendor's in-flight record untouched", async () => {
      // The regression this fix targets: two vendors validating the same domain
      // concurrently. beta holds a live token; alpha must add its own record
      // rather than overwrite beta's.
      mockFetch.mockResolvedValueOnce(
        cfOkList([rec("r1", "beta-token", BETA)]),
      );
      const created = rec("r2", "alpha-token", ALPHA);
      mockFetch.mockResolvedValueOnce(cfOk(created));

      const result = await dns.upsertAcmeChallenge(
        "test.com",
        "alpha-token",
        "alpha",
      );

      expect(result).toEqual(created);
      expect(mockFetch.mock.calls[1][1].method).toBe("POST");
      for (const [url, opts] of mockFetch.mock.calls) {
        expect(String(url)).not.toContain("/dns_records/r1");
        if (opts) expect(opts.method).not.toBe("DELETE");
      }
    });

    it("picks its own records out of a crowded RRset", async () => {
      // Mirrors the production state behind DO-495: the RRset had grown to 5-6
      // records, so the old code fell into "overwrite whichever record differs"
      // and every vendor wrote into the same slot. alpha is at capacity here,
      // so it recycles its own oldest and touches nothing else.
      mockFetch.mockResolvedValueOnce(
        cfOkList([
          rec("r0", "legacy-token"),
          rec("r1", "beta-token", BETA),
          rec("r2", "alpha-old", ALPHA, "2026-01-01T00:00:00Z"),
          rec("r3", "alpha-newer", ALPHA, "2026-02-01T00:00:00Z"),
        ]),
      );
      const updated = rec("r2", "alpha-new", ALPHA);
      mockFetch.mockResolvedValueOnce(cfOk(updated));

      const result = await dns.upsertAcmeChallenge(
        "test.com",
        "alpha-new",
        "alpha",
      );

      expect(result).toEqual(updated);
      const putCall = mockFetch.mock.calls[1];
      expect(putCall[1].method).toBe("PUT");
      expect(putCall[0]).toContain("/dns_records/r2");
      // Neither the legacy record, beta's live token, nor alpha's newer one
      expect(putCall[0]).not.toContain("/dns_records/r0");
      expect(putCall[0]).not.toContain("/dns_records/r1");
      expect(putCall[0]).not.toContain("/dns_records/r3");
    });

    it("does not adopt an untagged legacy record", async () => {
      mockFetch.mockResolvedValueOnce(cfOkList([rec("r1", "legacy")]));
      const created = rec("r2", "tok", ALPHA);
      mockFetch.mockResolvedValueOnce(cfOk(created));

      await dns.upsertAcmeChallenge("test.com", "tok", "alpha");

      expect(mockFetch.mock.calls[1][1].method).toBe("POST");
      expect(String(mockFetch.mock.calls[1][0])).not.toContain(
        "/dns_records/r1",
      );
    });
  });

  describe("deleteAcmeChallenge", () => {
    it("deletes only the calling vendor's records", async () => {
      mockFetch.mockResolvedValueOnce(
        cfOkList([
          rec("r1", "alpha-token", ALPHA),
          rec("r2", "beta-token", BETA),
          rec("r3", "legacy"),
        ]),
      );
      mockFetch.mockResolvedValueOnce(cfOk({}));

      const removed = await dns.deleteAcmeChallenge("test.com", "alpha");

      expect(removed).toBe(1);
      const delCall = mockFetch.mock.calls[1];
      expect(delCall[1].method).toBe("DELETE");
      expect(delCall[0]).toContain("/dns_records/r1");
      // beta's token and the untagged record survive
      for (const [url] of mockFetch.mock.calls) {
        expect(String(url)).not.toContain("/dns_records/r2");
        expect(String(url)).not.toContain("/dns_records/r3");
      }
    });

    it("removes both records when the vendor holds base + wildcard", async () => {
      mockFetch.mockResolvedValueOnce(
        cfOkList([
          rec("r1", "base-token", ALPHA, "2026-01-01T00:00:00Z"),
          rec("r2", "wildcard-token", ALPHA, "2026-01-01T00:01:00Z"),
          rec("r3", "beta-token", BETA),
        ]),
      );
      mockFetch.mockResolvedValueOnce(cfOk({}));
      mockFetch.mockResolvedValueOnce(cfOk({}));

      const removed = await dns.deleteAcmeChallenge("test.com", "alpha");

      expect(removed).toBe(2);
      const deleted = mockFetch.mock.calls
        .slice(1)
        .map(([url]) => String(url).split("/dns_records/")[1]);
      expect(deleted.sort()).toEqual(["r1", "r2"]);
    });

    it("reports nothing removed when the vendor has no record", async () => {
      mockFetch.mockResolvedValueOnce(
        cfOkList([rec("r2", "beta-token", BETA)]),
      );

      const removed = await dns.deleteAcmeChallenge("test.com", "alpha");

      expect(removed).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("reports nothing removed for an empty RRset", async () => {
      mockFetch.mockResolvedValueOnce(cfOkList([]));

      const removed = await dns.deleteAcmeChallenge("test.com", "alpha");

      expect(removed).toBe(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
