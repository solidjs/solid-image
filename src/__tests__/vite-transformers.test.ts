import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decode, encode, isBlurhashValid } from "blurhash";
import { getBlurhashData, getImageData, transformImage } from "../vite/transformers";

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

describe("getBlurhashData", () => {
  it("encodes a valid BlurHash with the requested components", async () => {
    const { hash } = await getBlurhashData(imagePath, encode, 3, 2);

    expect(isBlurhashValid(hash).result).toBe(true);
    expect(hash).toHaveLength(4 + 2 * 3 * 2);
  });

  it("reports the average color, which is the color the hash encodes", async () => {
    const { color } = await getBlurhashData(imagePath, encode, 4, 3);
    expect(color).toBe("#112233");

    // With one component the hash keeps only its base color, so it decodes
    // exactly. More components add detail terms that BlurHash rounds, which
    // shifts a flat image by a few levels.
    const { hash } = await getBlurhashData(imagePath, encode, 1, 1);
    const pixels = decode(hash, 4, 4);
    for (let i = 0; i < pixels.length; i += 4) {
      expect([pixels[i], pixels[i + 1], pixels[i + 2]]).toEqual([0x11, 0x22, 0x33]);
    }
  });

  it("encodes a small copy instead of every pixel", async () => {
    const seen: [number, number][] = [];

    await getBlurhashData(
      imagePath,
      (pixels, width, height, componentX, componentY) => {
        seen.push([width, height]);
        expect(pixels.length).toBe(width * height * 4);
        return encode(pixels, width, height, componentX, componentY);
      },
      4,
      3,
    );

    // The 800 by 400 source is reduced to fit inside 32 pixels.
    expect(seen).toEqual([[32, 16]]);
  });
});
