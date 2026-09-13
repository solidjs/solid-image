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
