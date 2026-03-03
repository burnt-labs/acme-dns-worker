import { describe, it, expect } from "vitest";
import { parseApiKeys } from "../src/config.js";

describe("parseApiKeys", () => {
  it("parses JSON key→vendor-config map", () => {
    const result = parseApiKeys(
      '{"key1":{"name":"acme-corp","domains":{"a.example.com":2}},"key2":{"name":"widgets-inc","domains":{"b.example.com":3}}}',
    );
    expect(result).toEqual({
      key1: { name: "acme-corp", domains: { "a.example.com": 2 } },
      key2: { name: "widgets-inc", domains: { "b.example.com": 3 } },
    });
  });

  it("lowercases and trims domain keys", () => {
    const result = parseApiKeys(
      '{"key1":{"name":"v","domains":{" FOO.COM ":2,"Bar.Com":3}}}',
    );
    expect(result.key1.domains).toEqual({ "foo.com": 2, "bar.com": 3 });
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
    expect(() => parseApiKeys('{"key1":{"domains":{"a.com":2}}}')).toThrow(
      /name must be a non-empty string/,
    );
  });

  it("throws when domains is not an object", () => {
    expect(() => parseApiKeys('{"key1":{"name":"v","domains":"a.com"}}')).toThrow(
      /must be an object mapping/,
    );
  });

  it("throws when domains is an array", () => {
    expect(() => parseApiKeys('{"key1":{"name":"v","domains":["a.com"]}}')).toThrow(
      /must be an object mapping/,
    );
  });

  it("throws when maxRecords value is not a positive integer", () => {
    expect(() => parseApiKeys('{"key1":{"name":"v","domains":{"a.com":0}}}')).toThrow(
      /must be a positive integer/,
    );
    expect(() => parseApiKeys('{"key1":{"name":"v","domains":{"a.com":"two"}}}')).toThrow(
      /must be a positive integer/,
    );
  });
});
