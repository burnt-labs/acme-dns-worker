import { describe, it, expect } from "vitest";
import { parseAllowedDomains, parseApiKeys } from "../src/config.js";

describe("parseAllowedDomains", () => {
  it("parses comma-separated domains", () => {
    const result = parseAllowedDomains("foo.com,bar.com,baz.com");
    expect(result).toEqual(new Set(["foo.com", "bar.com", "baz.com"]));
  });

  it("lowercases and trims domains", () => {
    const result = parseAllowedDomains("  FOO.COM , Bar.Com ");
    expect(result).toEqual(new Set(["foo.com", "bar.com"]));
  });

  it("ignores empty segments", () => {
    const result = parseAllowedDomains("foo.com,,bar.com,");
    expect(result).toEqual(new Set(["foo.com", "bar.com"]));
  });

  it("returns empty set for empty string", () => {
    expect(parseAllowedDomains("")).toEqual(new Set());
  });
});

describe("parseApiKeys", () => {
  it("parses JSON key→vendor map", () => {
    const result = parseApiKeys('{"key1":"acme-corp","key2":"widgets-inc"}');
    expect(result).toEqual({ key1: "acme-corp", key2: "widgets-inc" });
  });

  it("throws on non-JSON input", () => {
    expect(() => parseApiKeys("not-json")).toThrow(/not valid JSON/);
  });

  it("throws on JSON array", () => {
    expect(() => parseApiKeys('["key1"]')).toThrow(/must be a JSON object/);
  });

  it("throws on null", () => {
    expect(() => parseApiKeys("null")).toThrow(/must be a JSON object/);
  });
});
