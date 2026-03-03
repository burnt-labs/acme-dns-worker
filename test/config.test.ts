import { describe, it, expect } from "vitest";
import { parseApiKeys } from "../src/config.js";

describe("parseApiKeys", () => {
  it("parses JSON key→vendor-config map", () => {
    const result = parseApiKeys(
      '{"key1":{"name":"acme-corp","domains":["a.example.com"]},"key2":{"name":"widgets-inc","domains":["b.example.com"]}}',
    );
    expect(result).toEqual({
      key1: { name: "acme-corp", domains: ["a.example.com"] },
      key2: { name: "widgets-inc", domains: ["b.example.com"] },
    });
  });

  it("lowercases and trims domains", () => {
    const result = parseApiKeys(
      '{"key1":{"name":"v","domains":[" FOO.COM ","Bar.Com"]}}',
    );
    expect(result.key1.domains).toEqual(["foo.com", "bar.com"]);
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

  it("throws when value is a plain string instead of object", () => {
    expect(() => parseApiKeys('{"key1":"vendor"}')).toThrow(
      /must be an object with name and domains/,
    );
  });

  it("throws when name is missing", () => {
    expect(() => parseApiKeys('{"key1":{"domains":["a.com"]}}')).toThrow(
      /name must be a non-empty string/,
    );
  });

  it("throws when domains is not an array", () => {
    expect(() => parseApiKeys('{"key1":{"name":"v","domains":"a.com"}}')).toThrow(
      /domains must be an array/,
    );
  });
});
