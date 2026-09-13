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
  // Only WebP can store every frame of an animated source. Other formats would
  // get all frames stacked into one tall image, so they keep the first frame.
  const input = sharp(originalPath, { animated: targetFormat === "webp" })
    // Apply the EXIF orientation, so photos from a phone are not sideways.
    .autoOrient()
    // Never enlarge. An upscaled file is larger and has no more detail.
    .resize({ width: size, withoutEnlargement: true });

  switch (targetFormat) {
    case "avif":
      return input.avif({ quality });
    case "jpeg":
      // mozjpeg makes files about a tenth smaller at the same quality.
      return input.jpeg({ quality, mozjpeg: true });
    case "png":
      // PNG is lossless here, so quality does not apply. Spend more time on
      // compression instead, since the result is cached.
      return input.png({ compressionLevel: 9, adaptiveFiltering: true });
    case "webp":
      // The highest effort gives the smallest file. The result is cached, so
      // the extra encoding time is only paid once.
      return input.webp({ quality, effort: 6 });
    case "tiff":
      return input.tiff({ quality });
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
  const input = sharp(originalPath).autoOrient();
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

/**
 * Reads the intrinsic size of an image, as it is displayed.
 * A photo with a rotated EXIF orientation reports its width and height swapped.
 * Missing values become 0.
 */
export async function getImageData(originalPath: string): Promise<ImageData> {
  const result = await sharp(originalPath).metadata();
  const size = result.autoOrient ?? result;
  return {
    width: size.width || 0,
    height: size.height || 0,
  };
}
