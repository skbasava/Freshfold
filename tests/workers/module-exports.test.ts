import { describe, expect, it } from "vitest";
import * as authModule from "../../workers/auth/src/index";

describe("worker module exports", () => {
  it("auth exposes only the default handler", () => {
    expect(Object.keys(authModule)).toEqual(["default"]);
  });
});
