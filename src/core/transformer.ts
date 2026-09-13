import type {
  SolidImageFile,
  SolidImageFormat,
  SolidImageMIME,
  SolidImageSource,
  SolidImageTransformer,
  SolidImageVariant,
} from "./types";

const MIME_TO_FORMAT: Record<SolidImageMIME, SolidImageFormat> = {
  "image/avif": "avif",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/tiff": "tiff",
};

/** Returns the image format for a MIME type. */
export function getFormatFromMIME(mime: SolidImageMIME): SolidImageFormat {
  return MIME_TO_FORMAT[mime];
}

const FORMAT_TO_MIME: Record<SolidImageFormat, SolidImageMIME> = {
  avif: "image/avif",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tiff: "image/tiff",
};

/** Returns the MIME type for an image format. */
export function getMIMEFromFormat(format: SolidImageFormat): SolidImageMIME {
  return FORMAT_TO_MIME[format];
}

const FILE_TO_FORMAT: Record<SolidImageFile, SolidImageFormat> = {
  avif: "avif",
  jfif: "jpeg",
  jpeg: "jpeg",
  jpg: "jpeg",
  pjp: "jpeg",
  pjpeg: "jpeg",
  png: "png",
  webp: "webp",
  tif: "tiff",
  tiff: "tiff",
};

/** Returns the image format for a file extension, such as jpg for jpeg. */
export function getFormatFromFile(file: SolidImageFile): SolidImageFormat {
  return FILE_TO_FORMAT[file];
}

const FORMAT_TO_FILES: Record<SolidImageFormat, SolidImageFile[]> = {
  avif: ["avif"],
  jpeg: ["jfif", "jpeg", "jpg", "pjp", "pjpeg"],
  png: ["png"],
  webp: ["webp"],
  tiff: ["tif", "tiff"],
};

/** Returns every file extension that maps to the given format. */
export function getFilesFromFormat(format: SolidImageFormat): SolidImageFile[] {
  return FORMAT_TO_FILES[format];
}

const FORMAT_TO_OUTPUT: Record<SolidImageFormat, SolidImageFile> = {
  avif: "avif",
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  tiff: "tiff",
};

/** Returns the file extension to use when writing a file of the given format. */
export function getOutputFileFromFormat(format: SolidImageFormat): SolidImageFile {
  return FORMAT_TO_OUTPUT[format];
}

function ensureArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

/**
 * Runs the transformer over a source and always returns an array.
 * A transformer may return a single variant for convenience.
 */
export function createImageVariants<T>(
  source: SolidImageSource<T>,
  transformer: SolidImageTransformer<T>,
): SolidImageVariant[] {
  return ensureArray(transformer.transform(source));
}

function variantToSrcSetPart(variant: SolidImageVariant): string {
  return variant.path + " " + variant.width + "w";
}

/** Joins variants into one `srcset` value. Each entry is a path and its width. */
export function mergeImageVariantsToSrcSet(variants: SolidImageVariant[]): string {
  let result = variantToSrcSetPart(variants[0]!);

  for (let i = 1, len = variants.length; i < len; i++) {
    result += "," + variantToSrcSetPart(variants[i]!);
  }

  return result;
}

/**
 * Groups variants by MIME type.
 * Each group becomes one `source` element inside the picture.
 */
export function mergeImageVariantsByType(
  variants: SolidImageVariant[],
): Map<string, SolidImageVariant[]> {
  const map = new Map<string, SolidImageVariant[]>();

  for (let i = 0, len = variants.length; i < len; i++) {
    const current = variants[i]!;

    const arr = map.get(current.type) || [];
    arr.push(current);
    map.set(current.type, arr);
  }

  return map;
}
