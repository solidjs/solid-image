import { describe, expect, it } from "vitest";
import {
  getFilesFromFormat,
  getFormatFromFile,
  getFormatFromMIME,
  getMIMEFromFormat,
  getOutputFileFromFormat,
} from "../core/transformer";
import type { SolidImageFormat, SolidImageMIME } from "../core/types";

const FORMATS: SolidImageFormat[] = ["avif", "jpeg", "png", "webp", "tiff"];
const MIMES: SolidImageMIME[] = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
];

describe("getMIMEFromFormat", () => {
  it("maps every format to a MIME type", () => {
    expect(FORMATS.map(getMIMEFromFormat)).toEqual(MIMES);
  });

  it("round trips with getFormatFromMIME", () => {
    for (const format of FORMATS) {
      expect(getFormatFromMIME(getMIMEFromFormat(format))).toBe(format);
    }
  });
});

describe("getFilesFromFormat", () => {
  it("lists every extension accepted for jpeg", () => {
    expect(getFilesFromFormat("jpeg")).toEqual(["jfif", "jpeg", "jpg", "pjp", "pjpeg"]);
  });

  it("returns extensions that map back to the same format", () => {
    for (const format of FORMATS) {
      for (const file of getFilesFromFormat(format)) {
        expect(getFormatFromFile(file)).toBe(format);
      }
    }
  });
});

describe("getOutputFileFromFormat", () => {
  it("picks a single output extension per format", () => {
    expect(FORMATS.map(getOutputFileFromFormat)).toEqual(["avif", "jpg", "png", "webp", "tiff"]);
  });

  it("picks an extension that is valid for the format", () => {
    for (const format of FORMATS) {
      expect(getFilesFromFormat(format)).toContain(getOutputFileFromFormat(format));
    }
  });
});
