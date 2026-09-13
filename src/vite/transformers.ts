import sharp from "sharp";
import type { SolidImageFormat } from "../core/types.ts";

/**
 * Resizes an image to the given width and converts it to the target format.
 * The height follows the aspect ratio. Quality goes from 1 to 100.
 */
export function transformImage(
  originalPath: string,
  targetFormat: SolidImageFormat,
  size: number,
  quality: number,
) {
  const input = sharp(originalPath);
  switch (targetFormat) {
    case "avif":
      return input.resize(size).avif({
        quality,
      });
    case "jpeg":
      return input.resize(size).jpeg({
        quality,
      });
    case "png":
      return input.resize(size).png({
        quality,
      });
    case "webp":
      return input.resize(size).webp({
        quality,
      });
    case "tiff":
      return input.resize(size).tiff({
        quality,
      });
  }
}

export interface PlaceholderData {
  url: string;
  color: string;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/**
 * Builds a preview small enough to inline in the page.
 * The image is downscaled to a few pixels and encoded as a data URL,
 * together with the dominant color of the original.
 */
export async function getPlaceholderData(
  originalPath: string,
  size: number,
): Promise<PlaceholderData> {
  const input = sharp(originalPath);
  const [buffer, stats] = await Promise.all([
    input.clone().resize(size).webp({ quality: 40 }).toBuffer(),
    input.clone().stats(),
  ]);

  const { r, g, b } = stats.dominant;

  return {
    url: `data:image/webp;base64,${buffer.toString("base64")}`,
    color: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
  };
}

export interface BlurhashData {
  hash: string;
  color: string;
}

/** Signature of `encode` from the `blurhash` package. */
export type BlurhashEncode = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  componentX: number,
  componentY: number,
) => string;

// Longest side the image is reduced to before it is encoded. A BlurHash keeps
// only a few components, so more pixels cost time and add no detail.
const BLURHASH_SAMPLE_SIZE = 32;

/**
 * Encodes an image as a BlurHash, together with its average color.
 * The encoder is passed in because `blurhash` is an optional dependency.
 */
export async function getBlurhashData(
  originalPath: string,
  encode: BlurhashEncode,
  componentX: number,
  componentY: number,
): Promise<BlurhashData> {
  const { data, info } = await sharp(originalPath)
    .resize(BLURHASH_SAMPLE_SIZE, BLURHASH_SAMPLE_SIZE, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let red = 0;
  let green = 0;
  let blue = 0;
  for (let i = 0; i < data.length; i += 4) {
    red += data[i]!;
    green += data[i + 1]!;
    blue += data[i + 2]!;
  }
  const count = info.width * info.height;

  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

  return {
    hash: encode(pixels, info.width, info.height, componentX, componentY),
    color: `#${toHex(Math.round(red / count))}${toHex(Math.round(green / count))}${toHex(Math.round(blue / count))}`,
  };
}

interface ImageData {
  width: number;
  height: number;
}

/** Reads the intrinsic size of an image. Missing values become 0. */
export async function getImageData(originalPath: string): Promise<ImageData> {
  const result = await sharp(originalPath).metadata();
  return {
    width: result.width || 0,
    height: result.height || 0,
  };
}
