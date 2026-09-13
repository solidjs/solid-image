import { describe, expect, it } from "vitest";
import {
  getAspectRatioBoxStyle,
  getEmptyImageURL,
  getEmptySVGPlaceholder,
  getEncodedOptionalSVG,
  getEncodedSVG,
} from "../core/utils";

describe("getAspectRatioBoxStyle", () => {
  it("uses padding-top to reserve the 16:9 box", () => {
    expect(getAspectRatioBoxStyle({ width: 16, height: 9 })).toEqual({
      position: "relative",
      "padding-top": "56.25%",
      width: "100%",
      height: "0",
      overflow: "hidden",
    });
  });

  it("reserves a square box with 100% padding", () => {
    expect(getAspectRatioBoxStyle({ width: 100, height: 100 })["padding-top"]).toBe("100%");
  });

  it("reserves more than 100% padding for a portrait box", () => {
    expect(getAspectRatioBoxStyle({ width: 9, height: 16 })["padding-top"]).toBe(
      `${(16 * 100) / 9}%`,
    );
  });

  it("works with the raw pixel size of the image", () => {
    expect(getAspectRatioBoxStyle({ width: 1920, height: 1080 })["padding-top"]).toBe("56.25%");
  });
});

describe("getEmptySVGPlaceholder", () => {
  it("returns an SVG with the given size", () => {
    const svg = getEmptySVGPlaceholder({ width: 16, height: 9 });

    expect(svg).toContain('width="16"');
    expect(svg).toContain('height="9"');
    expect(svg).toContain("http://www.w3.org/2000/svg");
  });

  it("returns a self closing SVG with no content", () => {
    expect(getEmptySVGPlaceholder({ width: 1, height: 1 })).toBe(
      '<svg width="1" height="1" xmlns="http://www.w3.org/2000/svg" version="1.1"/>',
    );
  });
});

describe("getEncodedSVG", () => {
  it("prefixes the encoded SVG with the data URL scheme", () => {
    expect(getEncodedSVG("<svg/>")).toBe("data:image/svg+xml,%3Csvg%2F%3E");
  });

  it("encodes characters that are unsafe in a URL", () => {
    const result = getEncodedSVG('<svg width="2"/>');

    expect(result).not.toContain("<");
    expect(result).not.toContain('"');
  });
});

describe("getEncodedOptionalSVG", () => {
  it("encodes the given SVG when one is passed", () => {
    expect(getEncodedOptionalSVG({ width: 4, height: 3 }, "<svg/>")).toBe(
      getEncodedSVG("<svg/>"),
    );
  });

  it("falls back to an empty placeholder when no SVG is passed", () => {
    expect(getEncodedOptionalSVG({ width: 4, height: 3 })).toBe(
      getEncodedSVG(getEmptySVGPlaceholder({ width: 4, height: 3 })),
    );
  });
});

describe("getEmptyImageURL", () => {
  it("returns a data URL usable as an img src", () => {
    const url = getEmptyImageURL({ width: 800, height: 600 });

    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(url)).toContain('width="800"');
    expect(decodeURIComponent(url)).toContain('height="600"');
  });
});
