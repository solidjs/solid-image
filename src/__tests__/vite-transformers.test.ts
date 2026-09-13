import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decode, encode, isBlurhashValid } from "blurhash";
import { getBlurhashData, getImageData, transformImage } from "../vite/transformers";

let dir: string;
let imagePath: string;
let rotatedPath: string;
let animatedPath: string;
let noisePath: string;

// Fills an image with pseudo random pixels. A flat color compresses to almost
// nothing in every encoder, so it cannot show a difference in file size.
function createNoise(width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 42;
  for (let i = 0; i < pixels.length; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    pixels[i] = seed % 256;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } });
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "solid-image-sharp-"));
  imagePath = path.join(dir, "photo.png");
  rotatedPath = path.join(dir, "rotated.jpg");
  animatedPath = path.join(dir, "animated.webp");
  noisePath = path.join(dir, "noise.png");

  await sharp({
    create: { width: 800, height: 400, channels: 3, background: "#112233" },
  })
    .png()
    .toFile(imagePath);

  // Stored landscape, displayed portrait. This is how phones save photos.
  await sharp({ create: { width: 64, height: 32, channels: 3, background: "#112233" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toFile(rotatedPath);

  const frame = (background: string) =>
    sharp({ create: { width: 40, height: 20, channels: 3, background } }).png().toBuffer();
  await sharp([await frame("#ff0000"), await frame("#00ff00"), await frame("#0000ff")], {
    join: { animated: true },
  })
    .webp()
    .toFile(animatedPath);

  await createNoise(256, 256).png().toFile(noisePath);
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

  it("reports the displayed size of a rotated photo", async () => {
    expect(await getImageData(rotatedPath)).toEqual({ width: 32, height: 64 });
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

  it("encodes a rotated photo upright", async () => {
    const seen: [number, number][] = [];

    await getBlurhashData(
      rotatedPath,
      (pixels, width, height, componentX, componentY) => {
        seen.push([width, height]);
        return encode(pixels, width, height, componentX, componentY);
      },
      4,
      3,
    );

    // Stored as 64 by 32 with orientation 6, so it displays as 32 by 64.
    expect(seen).toEqual([[16, 32]]);
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

describe("transformImage output", () => {
  it("never enlarges an image past its own width", async () => {
    const buffer = await transformImage(imagePath, "webp", 1600, 80).toBuffer();
    const meta = await sharp(buffer).metadata();

    expect(meta.width).toBe(800);
    expect(meta.height).toBe(400);
  });

  it("applies the EXIF orientation", async () => {
    const buffer = await transformImage(rotatedPath, "webp", 16, 80).toBuffer();
    const meta = await sharp(buffer).metadata();

    expect(meta.width).toBe(16);
    expect(meta.height).toBe(32);
  });

  it("keeps every frame of an animated image in WebP", async () => {
    const buffer = await transformImage(animatedPath, "webp", 20, 80).toBuffer();
    const meta = await sharp(buffer, { animated: true }).metadata();

    expect(meta.pages).toBe(3);
    expect(meta.width).toBe(20);
    expect(meta.pageHeight).toBe(10);
  });

  it("keeps only the first frame in formats that cannot animate", async () => {
    for (const format of ["avif", "jpeg", "png"] as const) {
      const buffer = await transformImage(animatedPath, format, 20, 80).toBuffer();
      const meta = await sharp(buffer).metadata();

      // A stacked strip of frames would be 30 pixels tall.
      expect(meta.width).toBe(20);
      expect(meta.height).toBe(10);
    }
  });

  it("encodes JPEG smaller than the default encoder at the same quality", async () => {
    const tuned = await transformImage(noisePath, "jpeg", 256, 80).toBuffer();
    const plain = await sharp(noisePath).jpeg({ quality: 80 }).toBuffer();

    expect(tuned.length).toBeLessThan(plain.length);
  });

  it("encodes PNG no larger than the default encoder", async () => {
    const tuned = await transformImage(noisePath, "png", 256, 80).toBuffer();
    const plain = await sharp(noisePath).png().toBuffer();

    expect(tuned.length).toBeLessThanOrEqual(plain.length);
  });
});
