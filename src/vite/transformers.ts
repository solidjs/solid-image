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

// Total components a hash aims for. 4 by 3 is the usual BlurHash default, and
// staying near that total keeps hashes near 28 characters.
const BLURHASH_COMPONENT_BUDGET = 12;

/**
 * Picks the horizontal and vertical component counts for an image.
 * The budget is split by aspect ratio, so the long side gets more components
 * and detail stays even. Each count stays within the 1 to 9 BlurHash allows.
 */
export function getBlurhashComponents(width: number, height: number): [x: number, y: number] {
  if (!(width > 0 && height > 0)) {
    return [4, 3];
  }

  const ratio = width / height;
  const clamp = (value: number) => Math.min(9, Math.max(1, Math.round(value)));

  return [
    clamp(Math.sqrt(BLURHASH_COMPONENT_BUDGET * ratio)),
    clamp(Math.sqrt(BLURHASH_COMPONENT_BUDGET / ratio)),
  ];
}

/**
 * Encodes an image as a BlurHash, together with its average color.
 * The component counts come from the aspect ratio of the image.
 * The encoder is passed in because `blurhash` is an optional dependency.
 */
export async function getBlurhashData(
  originalPath: string,
  encode: BlurhashEncode,
): Promise<BlurhashData> {
  const { data, info } = await sharp(originalPath)
    // Hash the photo as it displays, like the variants and the inline preview.
    .autoOrient()
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
  // The sample keeps the aspect ratio of the image, so its size is enough.
  const [componentX, componentY] = getBlurhashComponents(info.width, info.height);

  return {
    hash: encode(pixels, info.width, info.height, componentX, componentY),
    color: `#${toHex(Math.round(red / count))}${toHex(Math.round(green / count))}${toHex(Math.round(blue / count))}`,
  };
}

interface ImageData {
  width: number;
  height: number;
  /** Whether any pixel is at least partly see-through. */
  transparent: boolean;
}

/**
 * Reads the intrinsic size of an image, as it is displayed, and whether it is
 * transparent. A photo with a rotated EXIF orientation reports its width and
 * height swapped. Missing sizes become 0.
 */
export async function getImageData(originalPath: string): Promise<ImageData> {
  const result = await sharp(originalPath).metadata();
  const size = result.autoOrient ?? result;
  return {
    width: size.width || 0,
    height: size.height || 0,
    // An alpha channel alone does not mean transparency. Many PNGs carry one
    // with every pixel opaque, so read the pixels only when there is a channel.
    transparent: result.hasAlpha ? !(await sharp(originalPath).stats()).isOpaque : false,
  };
}
