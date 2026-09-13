import { describe, expect, it } from "vitest";
import xxHash32 from "../vite/xxhash32";

describe("xxHash32", () => {
  it("matches the reference digest for an empty string", () => {
    expect(xxHash32("")).toBe(0x02cc5d05);
  });

  it("matches the reference digest for a short string", () => {
    expect(xxHash32("abc")).toBe(0x32d153ff);
  });

  it("matches the reference digest for an input longer than one stripe", () => {
    expect(xxHash32("0123456789abcdefghijklmnopqrstuvwxyz")).toBe(0x9aa38e7e);
  });
});
