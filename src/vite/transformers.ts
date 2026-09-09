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
