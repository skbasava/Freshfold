import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "../../packages/shared/src/canonical-json";

describe("canonicalJsonStringify", () => {
  it("sorts object keys at every depth", () => {
    expect(
      canonicalJsonStringify({
        z: 1,
        a: { y: 2, b: 3 },
      }),
    ).toBe('{"a":{"b":3,"y":2},"z":1}');
  });

  it("preserves array order", () => {
    expect(canonicalJsonStringify({ items: ["b", "a"] })).toBe(
      '{"items":["b","a"]}',
    );
  });

  it("rejects values that are not valid JSON", () => {
    expect(() => canonicalJsonStringify(Number.POSITIVE_INFINITY)).toThrow(
      TypeError,
    );
    expect(() => canonicalJsonStringify(() => undefined)).toThrow(TypeError);
  });
});
