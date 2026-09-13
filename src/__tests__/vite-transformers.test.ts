import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encode, isBlurhashValid } from "blurhash";
import {
  getBlurhashComponents,
  getBlurhashData,
  getImageData,
  transformImage,
} from "../vite/transformers";

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
    expect(await getImageData(imagePath)).toEqual({ width: 800, height: 400, transparent: false });
  });

  it("rejects for a missing file", async () => {
    await expect(getImageData(path.join(dir, "missing.png"))).rejects.toThrow();
  });

  it("reports a see-through image as transparent", async () => {
    const transparentPath = path.join(dir, "transparent.png");
    await sharp({
      create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
    })
      .png()
      .toFile(transparentPath);

    expect((await getImageData(transparentPath)).transparent).toBe(true);
  });

  it("reports an alpha channel with only opaque pixels as not transparent", async () => {
    const opaquePath = path.join(dir, "opaque-alpha.png");
    await sharp({
      create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toFile(opaquePath);

    expect((await getImageData(opaquePath)).transparent).toBe(false);
  });

  it("reports the displayed size of a rotated photo", async () => {
    expect(await getImageData(rotatedPath)).toEqual({ width: 32, height: 64, transparent: false });
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

// BlurHash writes every value in base 83 with this alphabet.
const BASE83 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";

function readBase83(value: string) {
  return [...value].reduce((total, character) => total * 83 + BASE83.indexOf(character), 0);
}

// The first character of a hash holds its component counts.
function readComponents(hash: string): [number, number] {
  const flag = readBase83(hash[0]!);
  return [(flag % 9) + 1, Math.floor(flag / 9) + 1];
}

describe("getBlurhashComponents", () => {
  it.each([
    ["4:3 landscape", 4, 3, [4, 3]],
    ["16:9", 16, 9, [5, 3]],
    ["square", 1, 1, [3, 3]],
    ["9:16 portrait", 9, 16, [3, 5]],
    ["3:1 panorama", 3, 1, [6, 2]],
    ["10:1 banner", 10, 1, [9, 1]],
    ["1:10 strip", 1, 10, [1, 9]],
  ])("splits the components for a %s image", (_name, width, height, expected) => {
    expect(getBlurhashComponents(width as number, height as number)).toEqual(expected);
  });

  it("keeps every count within the 1 to 9 BlurHash allows", () => {
    expect(getBlurhashComponents(1000, 1)).toEqual([9, 1]);
    expect(getBlurhashComponents(1, 1000)).toEqual([1, 9]);
  });

  it("falls back to 4 by 3 when the size is unknown", () => {
    expect(getBlurhashComponents(0, 0)).toEqual([4, 3]);
  });
});

describe("getBlurhashData", () => {
  it("encodes a valid BlurHash with components picked from the aspect ratio", async () => {
    const { hash } = await getBlurhashData(imagePath, encode);

    expect(isBlurhashValid(hash).result).toBe(true);
    // The 800 by 400 source has a ratio of 2.
    expect(readComponents(hash)).toEqual([5, 2]);
  });

  it("reports the average color, which is the base color of the hash", async () => {
    const { hash, color } = await getBlurhashData(imagePath, encode);

    expect(color).toBe("#112233");
    // Characters 2 to 5 hold the base color as a 24 bit number.
    expect(readBase83(hash.slice(2, 6))).toBe(0x112233);
  });

  it("encodes a rotated photo upright", async () => {
    const seen: [number, number][] = [];

    const { hash } = await getBlurhashData(rotatedPath, (pixels, width, height, x, y) => {
      seen.push([width, height]);
      return encode(pixels, width, height, x, y);
    });

    // Stored as 64 by 32 with orientation 6, so it displays as 32 by 64.
    expect(seen).toEqual([[16, 32]]);
    // A portrait gets more vertical components.
    expect(readComponents(hash)).toEqual([2, 5]);
  });

  it("encodes a small copy instead of every pixel", async () => {
    const seen: [number, number, number, number][] = [];

    await getBlurhashData(imagePath, (pixels, width, height, x, y) => {
      seen.push([width, height, x, y]);
      expect(pixels.length).toBe(width * height * 4);
      return encode(pixels, width, height, x, y);
    });

    // The 800 by 400 source is reduced to fit inside 32 pixels.
    expect(seen).toEqual([[32, 16, 5, 2]]);
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

describe("GIF input", () => {
  it("keeps every frame of an animated GIF in WebP and GIF", async () => {
    const gifPath = path.join(dir, "animated.gif");
    const frame = (background: string) =>
      sharp({ create: { width: 40, height: 20, channels: 3, background } }).png().toBuffer();
    await sharp([await frame("#ff0000"), await frame("#00ff00"), await frame("#0000ff")], {
      join: { animated: true },
    })
      .gif()
      .toFile(gifPath);

    for (const format of ["webp", "gif"] as const) {
      const buffer = await transformImage(gifPath, format, 20, 80).toBuffer();
      const meta = await sharp(buffer, { animated: true }).metadata();

      expect(meta.format).toBe(format);
      expect(meta.pages).toBe(3);
      expect(meta.pageHeight).toBe(10);
    }
  });
});
