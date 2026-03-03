import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloudflareDnsService } from "../src/services/cloudflare-dns.js";

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
        { id: "r1", type: "TXT", name: "_acme-challenge.example.com", content: "val1", ttl: 120 },
      ];
      mockFetch.mockResolvedValue(cfOkList(records));

      const result = await dns.listTxtRecords("_acme-challenge.example.com");
      expect(result).toEqual(records);
    });
  });

  describe("upsertAcmeChallenge", () => {
    it("creates a new record when none exist", async () => {
      // First call: list → empty
      mockFetch.mockResolvedValueOnce(cfOkList([]));
      // Second call: create
      const created = { id: "new-1", type: "TXT", name: "_acme-challenge.test.com", content: "tok", ttl: 120, comment: "acme-dns:vendor=test-vendor" };
      mockFetch.mockResolvedValueOnce(cfOk(created));

      const result = await dns.upsertAcmeChallenge("test.com", "tok", "test-vendor");

      expect(result).toEqual(created);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Verify the POST body includes comment
      const createCall = mockFetch.mock.calls[1];
      expect(createCall[1].method).toBe("POST");
      const body = JSON.parse(createCall[1].body);
      expect(body.type).toBe("TXT");
      expect(body.name).toBe("_acme-challenge.test.com");
      expect(body.content).toBe("tok");
      expect(body.comment).toBe("acme-dns:vendor=test-vendor");
    });

    it("creates a second record when under maxRecords", async () => {
      const existing = [
        { id: "r1", type: "TXT", name: "_acme-challenge.test.com", content: "old", ttl: 120, comment: "acme-dns:vendor=test-vendor" },
      ];
      mockFetch.mockResolvedValueOnce(cfOkList(existing));
      const created = { id: "r2", type: "TXT", name: "_acme-challenge.test.com", content: "new", ttl: 120, comment: "acme-dns:vendor=test-vendor" };
      mockFetch.mockResolvedValueOnce(cfOk(created));

      const result = await dns.upsertAcmeChallenge("test.com", "new", "test-vendor");

      expect(result).toEqual(created);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][1].method).toBe("POST");
    });

    it("only considers records tagged with the same vendor", async () => {
      // Two records exist but belong to different vendors
      const existing = [
        { id: "r1", type: "TXT", name: "_acme-challenge.test.com", content: "other", ttl: 120, comment: "acme-dns:vendor=other-vendor" },
        { id: "r2", type: "TXT", name: "_acme-challenge.test.com", content: "other2", ttl: 120, comment: "acme-dns:vendor=other-vendor" },
      ];
      mockFetch.mockResolvedValueOnce(cfOkList(existing));
      const created = { id: "r3", type: "TXT", name: "_acme-challenge.test.com", content: "tok", ttl: 120, comment: "acme-dns:vendor=test-vendor" };
      mockFetch.mockResolvedValueOnce(cfOk(created));

      const result = await dns.upsertAcmeChallenge("test.com", "tok", "test-vendor");

      expect(result).toEqual(created);
      // Should create, not update, since no records belong to test-vendor
      expect(mockFetch.mock.calls[1][1].method).toBe("POST");
    });

    it("returns existing record when value already matches", async () => {
      const existing = [
        { id: "r1", type: "TXT", name: "_acme-challenge.test.com", content: "same", ttl: 120, comment: "acme-dns:vendor=test-vendor" },
      ];
      mockFetch.mockResolvedValueOnce(cfOkList(existing));

      const result = await dns.upsertAcmeChallenge("test.com", "same", "test-vendor");

      expect(result).toEqual(existing[0]);
      // Only the list call was made
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("updates the oldest record when at maxRecords capacity", async () => {
      const existing = [
        { id: "r1", type: "TXT", name: "_acme-challenge.test.com", content: "val-a", ttl: 120, comment: "acme-dns:vendor=test-vendor" },
        { id: "r2", type: "TXT", name: "_acme-challenge.test.com", content: "val-b", ttl: 120, comment: "acme-dns:vendor=test-vendor" },
      ];
      mockFetch.mockResolvedValueOnce(cfOkList(existing));
      const updated = { ...existing[0], content: "new-val" };
      mockFetch.mockResolvedValueOnce(cfOk(updated));

      const result = await dns.upsertAcmeChallenge("test.com", "new-val", "test-vendor", 2);

      expect(result).toEqual(updated);
      // Should have PUT to r1 (first non-matching record)
      const putCall = mockFetch.mock.calls[1];
      expect(putCall[1].method).toBe("PUT");
      expect(putCall[0]).toContain("/dns_records/r1");
    });
  });
});
