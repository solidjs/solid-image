/**
 * List of supported image types
 *
 * Based on https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types
 */
export type SolidImageMIME =
  | "image/avif"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/tiff";

export type SolidImagePNG = "png";
export type SolidImageAVIF = "avif";
export type SolidImageJPEG = "jpg" | "jpeg" | "jfif" | "pjpeg" | "pjp";
export type SolidImageWebP = "webp";
export type SolidImageTIFF = "tiff" | "tif";

export type SolidImageFile =
  | SolidImageAVIF
  | SolidImageJPEG
  | SolidImagePNG
  | SolidImageWebP
  | SolidImageTIFF;

export type SolidImageFormat = "avif" | "jpeg" | "png" | "webp" | "tiff";

/**
 * A variant of an image source. This is used to transform a given source string
 * into a <source> element
 */
export interface SolidImageVariant {
  path: string;
  width: number;
  type: SolidImageMIME;
}

/**
 * A tiny version of an image, small enough to inline in the page.
 * It is shown while the real image loads.
 */
export interface SolidImagePlaceholder {
  /** Data URL of the downscaled image. */
  url: string;
  /** Dominant color of the image, as a hex string. */
  color: string;
}

/**
 * A BlurHash preview of an image.
 * The hash is a short string that the browser decodes into a blurred image.
 */
export interface SolidImageBlurhashPlaceholder {
  /** The encoded BlurHash. */
  hash: string;
  /** Average color of the image, as a hex string. It is painted until the hash is decoded. */
  color: string;
  /** Decodes the hash into RGBA pixels. This is `decode` from the `blurhash` package. */
  decode: (hash: string, width: number, height: number) => Uint8ClampedArray;
}

/**
 * An image source
 */
export interface SolidImageSource<T> {
  source: string;
  width: number;
  height: number;
  options: T;
  /** Inline preview shown until the image has loaded. */
  placeholder?: SolidImagePlaceholder | SolidImageBlurhashPlaceholder;
}

/**
 * Transforms an image source into a set of image variants
 */
export interface SolidImageTransformer<T> {
  transform: (source: SolidImageSource<T>) => SolidImageVariant | SolidImageVariant[];
}
