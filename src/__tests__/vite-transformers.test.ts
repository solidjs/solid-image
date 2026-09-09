import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getImageData, transformImage } from "../vite/transformers";

let dir: string;
let imagePath: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "solid-image-sharp-"));
  imagePath = path.join(dir, "photo.png");

  await sharp({
    create: { width: 800, height: 400, channels: 3, background: "#112233" },
  })
    .png()
    .toFile(imagePath);
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("getImageData", () => {
  it("reads the size of an image", async () => {
    expect(await getImageData(imagePath)).toEqual({ width: 800, height: 400 });
  });

  it("rejects for a missing file", async () => {
    await expect(getImageData(path.join(dir, "missing.png"))).rejects.toThrow();
  });
});

describe("transformImage", () => {
  it("resizes to the requested width and keeps the aspect ratio", async () => {
    const buffer = await transformImage(imagePath, "webp", 400, 80).toBuffer();
    const meta = await sharp(buffer).metadata();

    expect(meta.width).toBe(400);
    expect(meta.height).toBe(200);
  });

  it("converts to every supported output format", async () => {
    // sharp reports an AVIF file as heif, its container format.
    const formats = [
      ["avif", "heif"],
      ["jpeg", "jpeg"],
      ["png", "png"],
      ["webp", "webp"],
      ["tiff", "tiff"],
    ] as const;

    for (const [format, reported] of formats) {
      const buffer = await transformImage(imagePath, format, 100, 80).toBuffer();
      const meta = await sharp(buffer).metadata();

      expect(meta.format).toBe(reported);
      expect(meta.width).toBe(100);
    }
  });
});
