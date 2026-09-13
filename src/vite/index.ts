import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "vite";
import { getFilesFromFormat, getMIMEFromFormat, getOutputFileFromFormat } from "../core/transformer.ts";
import type {
  SolidImageBlurhashPlaceholder,
  SolidImageFile,
  SolidImageFormat,
  SolidImagePlaceholder,
  SolidImageVariant,
} from "../core/types.ts";
import { fileExists, getFileSignature, outputFile, pruneStaleFiles, touchFile } from "./fs.ts";
import { createLimit } from "./limit.ts";
import {
  getBlurhashData,
  getImageData,
  getPlaceholderData,
  type ImageInfo,
  transformImage,
} from "./transformers.ts";
import xxHash32 from "./xxhash32.ts";

const DEFAULT_INPUT: SolidImageFormat[] = ["png", "jpeg", "webp", "gif"];
// WebP for browsers that read it, JPEG for the rest. PNG is added per image
// when the source is transparent.
const DEFAULT_OUTPUT: SolidImageFormat[] = ["webp", "jpeg"];
// Order of the `source` elements. The browser takes the first format it reads,
// so the smallest formats come first. JPEG and PNG come last because every
// browser reads them, and the last format is also the `img` fallback. TIFF only
// works in Safari, so it must never be that fallback. GIF comes last of all:
// every browser reads it and it keeps animation, so when it is listed it is the
// fallback for animated images.
const FORMAT_ORDER: SolidImageFormat[] = ["avif", "webp", "tiff", "jpeg", "png", "gif"];
// Encoders read quality on different scales. AVIF reaches similar visual
// quality at a lower number, so its default is 50, the same as sharp's.
const DEFAULT_QUALITY: Record<SolidImageFormat, number> = {
  avif: 50,
  webp: 80,
  jpeg: 80,
  png: 80,
  tiff: 80,
  gif: 80,
};
// Width of the inline preview, in pixels. Small enough to stay under a
// kilobyte once encoded, large enough to show the shape of the image.
const DEFAULT_PLACEHOLDER_SIZE = 20;
// Part of every cache key. Bump it whenever the encoding pipeline changes, so
// files encoded by an older version of the plugin are not reused.
const PIPELINE_VERSION = 1;
// Cached files unused for this long are removed when the dev server or a build
// starts. A week keeps files that another build of the same app still uses.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type MaybePromise<T> = T | Promise<T>;

type Preview = SolidImagePlaceholder | Omit<SolidImageBlurhashPlaceholder, "decode">;

/**
 * Turns on a BlurHash preview instead of the inline image preview.
 * The number of components is picked per image from its aspect ratio.
 */
export interface BlurhashPlaceholderOptions {
  type: "blurhash";
}

export interface SolidImageOptions {
  /** Handles imports that end with `?image`. */
  local?: {
    /** Output widths in pixels. The height follows the aspect ratio. */
    sizes: number[];
    /** Source formats to process. Other files are left alone. Defaults to png, jpeg, webp and gif. */
    input?: SolidImageFormat[];
    /**
     * Formats to emit. One file is written per format and per size.
     * They are offered smallest first, whatever the order here.
     * Defaults to webp and jpeg.
     */
    output?: SolidImageFormat[];
    /**
     * Quality passed to sharp, from 1 to 100. PNG and GIF ignore it.
     *
     * - Leave it out to use a default per format, 50 for AVIF and 80 for the rest.
     * - Give a number to use it for every format.
     * - Give an object such as `{ avif: 45, webp: 75 }` to set formats one by one.
     */
    quality?: number | Partial<Record<SolidImageFormat, number>>;
    /** Directory the dev server writes processed files to. Defaults to Vite's `publicDir`. */
    publicPath?: string;
    /**
     * Preview shown until the image has loaded. Defaults to a 20px inline image.
     *
     * - Set to `false` to skip it.
     * - Give `{ size }` to change the width of the inline image.
     * - Give `{ type: "blurhash" }` to use a BlurHash instead. It needs the
     *   `blurhash` package installed.
     */
    placeholder?: boolean | { type?: "image"; size?: number } | BlurhashPlaceholderOptions;
    /** Most images processed at the same time. Defaults to the number of CPU cores. */
    concurrency?: number;
  };
  /** Handles imports that start with `image:`. */
  remote?: {
    /** Maps the text after `image:` to a source and its variants. May be async. */
    transformURL(url: string): MaybePromise<{
      src: {
        source: string;
        width: number;
        height: number;
        placeholder?: Preview;
      };
      variants: SolidImageVariant | SolidImageVariant[];
    }>;
  };
}

type LocalOptions = NonNullable<SolidImageOptions["local"]>;

function getValidFileExtensions(formats: SolidImageFormat[]): Set<string> {
  const result = new Set<SolidImageFile>();
  for (const format of formats) {
    for (const file of getFilesFromFormat(format)) {
      result.add(file);
    }
  }
  return result;
}

function isValidFileExtension(extensions: Set<string>, target: string): target is SolidImageFile {
  return extensions.has(target);
}

type ResolvedPlaceholder =
  | { type: "none" }
  | { type: "image"; size: number }
  | { type: "blurhash" };

function resolvePlaceholder(option: LocalOptions["placeholder"]): ResolvedPlaceholder {
  if (option === false) {
    return { type: "none" };
  }
  if (option === undefined || option === true) {
    return { type: "image", size: DEFAULT_PLACEHOLDER_SIZE };
  }
  if (option.type === "blurhash") {
    return { type: "blurhash" };
  }
  return { type: "image", size: option.size ?? DEFAULT_PLACEHOLDER_SIZE };
}

/**
 * Returns the quality to encode each format with.
 * A number applies to every format. An object sets formats one by one, and the
 * rest keep their default.
 */
export function resolveQuality(option: LocalOptions["quality"]): (format: SolidImageFormat) => number {
  if (typeof option === "number") {
    return () => option;
  }
  return format => option?.[format] ?? DEFAULT_QUALITY[format];
}

/**
 * Returns the file name of an encoded variant.
 * The name covers everything that changes the output, so an edited image, a
 * changed option or a newer pipeline never reuses a stale file. It leaves out
 * the file path, which differs between checkouts.
 */
export function getVariantFilename(
  signature: string,
  format: SolidImageFormat,
  size: number,
  quality: number,
  version: number = PIPELINE_VERSION,
): string {
  const hash = xxHash32(`v${version}|${signature}|${format}|${size}|${quality}`).toString(16);
  return `i-${hash}-${size}.${getOutputFileFromFormat(format)}`;
}

/**
 * Loads the `blurhash` package.
 * It is only needed for the BlurHash preview, so it is an optional peer
 * dependency that the app installs itself.
 */
async function loadBlurhash(): Promise<typeof import("blurhash")> {
  try {
    return await import("blurhash");
  } catch (error) {
    throw new Error(
      'The BlurHash placeholder needs the "blurhash" package. Install it with `npm i blurhash`.',
      { cause: error },
    );
  }
}

async function computePlaceholder(
  imagePath: string,
  placeholder: Exclude<ResolvedPlaceholder, { type: "none" }>,
): Promise<Preview> {
  if (placeholder.type === "image") {
    return await getPlaceholderData(imagePath, placeholder.size);
  }
  const { encode } = await loadBlurhash();
  return await getBlurhashData(imagePath, encode);
}

/**
 * Returns the formats to emit for one image, in the order they are offered.
 *
 * - Formats are sorted from the smallest to the most widely supported, whatever
 *   order the config lists them in.
 * - A transparent image gets PNG in place of JPEG, since JPEG has no
 *   transparency and would paint it black.
 * - An opaque image drops PNG when JPEG is also listed, since JPEG is far
 *   smaller for photos.
 */
export function getEffectiveFormats(
  formats: SolidImageFormat[],
  transparent: boolean,
): SolidImageFormat[] {
  const result = new Set(formats);

  if (result.has("jpeg")) {
    if (transparent) {
      result.delete("jpeg");
      result.add("png");
    } else {
      result.delete("png");
    }
  }

  return FORMAT_ORDER.filter(format => result.has(format));
}

/**
 * Returns the widths to emit for a source of the given width.
 *
 * Widths above the source are dropped, since they would only upscale it into a
 * larger and blurrier file. The source width takes their place, so the largest
 * variant still keeps every pixel of the original.
 */
export function getEffectiveSizes(sizes: number[], sourceWidth: number): number[] {
  // sharp could not read the width, so there is nothing to compare against.
  if (sourceWidth <= 0) {
    return [...new Set(sizes)];
  }

  const result = new Set(sizes.filter(size => size <= sourceWidth));
  if (sizes.some(size => size > sourceWidth)) {
    result.add(sourceWidth);
  }
  return [...result];
}

/**
 * Shares one read of a file between every load that needs it.
 * A failed read is forgotten, so the next load tries again.
 */
function remember<T>(cache: Map<string, Promise<T>>, file: string, read: () => Promise<T>): Promise<T> {
  const key = path.normalize(file);
  let value = cache.get(key);
  if (!value) {
    value = read();
    cache.set(key, value);
    value.catch(() => cache.delete(key));
  }
  return value;
}

/**
 * Builds the module that carries the image, its intrinsic size and its preview.
 *
 * `source` points at the largest variant of the fallback format rather than the
 * original file, so the untouched original never reaches the bundle.
 */
function getImageSource(
  relativePath: string,
  info: ImageInfo,
  preview: Preview | undefined,
  outputFormat: SolidImageFormat[],
  sizes: number[],
  isBlurhash: boolean,
): string {
  const largestSize = Math.max(...getEffectiveSizes(sizes, info.width));
  // The last format is the one every browser reads, so the `img` falls back to it.
  const formats = getEffectiveFormats(outputFormat, info.transparent);
  const fallback = formats[formats.length - 1]!;
  const variantPath = `${relativePath}?image-raw-${fallback}-${largestSize}`;

  // A BlurHash is decoded in the browser. The module brings the decoder along,
  // so only apps that turned the BlurHash preview on import the package.
  return `
import source from ${JSON.stringify(variantPath)};
${isBlurhash ? 'import { decode } from "blurhash";' : ""}
export default {
  width: ${JSON.stringify(info.width)},
  height: ${JSON.stringify(info.height)},
  placeholder: ${isBlurhash ? `{ ...${JSON.stringify(preview)}, decode }` : JSON.stringify(preview)},
  source,
};
`;
}

function getImageTransformer(imagePath: string, outputTypes: string[], sizes: number[]): string {
  let imported = "";
  let exported = "";

  for (const format of outputTypes) {
    for (const size of sizes) {
      const variantName = "variant_" + format + "_" + size;
      const importPath = JSON.stringify(imagePath + "?image-" + format + "-" + size);
      imported += "import " + variantName + " from " + importPath + ";\n";
      exported += variantName + ",";
    }
  }

  return (
    imported +
    "const variants = [" +
    exported +
    "];\n" +
    "export default { transform() { return variants; }};"
  );
}

function getImageVariant(imagePath: string, target: SolidImageFormat, size: number): string {
  return `import source from ${JSON.stringify(imagePath + "?image-raw-" + target + "-" + size)};
export default {
  width: ${size},
  type: '${getMIMEFromFormat(target)}',
  path: source,
};`;
}

function getImageEntryPoint(imagePath: string): string {
  return `import src from ${JSON.stringify(imagePath + "?image-source")};
import transformer from ${JSON.stringify(imagePath + "?image-transformer")};

export default { src, transformer };
`;
}

const LOCAL_PATH = /\?image(-[a-z]+(-[0-9]+)?)?/;
const REMOTE_PATH = "image:";

/**
 * Vite plugins that turn image imports into responsive image props.
 * Returns one plugin per enabled option group, so it can be spread
 * or nested in the Vite `plugins` array.
 */
export const imagePlugin = (options: SolidImageOptions) => {
  const plugins: Plugin[] = [];
  if (options.remote) {
    const transformUrl = options.remote.transformURL;
    plugins.push({
      name: "solid-start:image/remote",
      enforce: "pre",
      resolveId(id) {
        if (id.startsWith(REMOTE_PATH)) {
          return id;
        }
        return null;
      },
      async load(id) {
        if (id.startsWith(REMOTE_PATH)) {
          const param = id.substring(REMOTE_PATH.length);

          const result = await transformUrl(param);

          const remotePlaceholder = result.src.placeholder;
          const isBlurhash = remotePlaceholder != null && "hash" in remotePlaceholder;

          return `${isBlurhash ? 'import { decode } from "blurhash";\n' : ""}const SRC = ${JSON.stringify(result.src)};
const VARIANTS = ${JSON.stringify(result.variants)};
export default {
  src: ${isBlurhash ? "{ ...SRC, placeholder: { ...SRC.placeholder, decode } }" : "SRC"},
  transformer: {
    transform() {
      return VARIANTS;
    },
  },
};`;
        }
        return null;
      },
    });
  }
  if (options.local) {
    const inputFormat = options.local.input ?? DEFAULT_INPUT;
    const outputFormat = options.local.output ?? DEFAULT_OUTPUT;
    const getQuality = resolveQuality(options.local.quality);
    const sizes = options.local.sizes;
    const publicPathOption = options.local.publicPath;
    // Replaced by Vite's public directory once the config is resolved.
    let publicPath = publicPathOption ?? "public";
    const placeholder = resolvePlaceholder(options.local.placeholder);
    const limit = createLimit(
      Math.max(1, Math.floor(options.local.concurrency ?? os.availableParallelism())),
    );

    const validInputFileExtensions = getValidFileExtensions(inputFormat);

    let isBuild = false;
    // Replaced by the Vite cache directory once the config is resolved.
    let cacheDir = path.join("node_modules", ".vite", "solid-image");

    // Every variant of an image needs its content hash, and several modules need
    // its metadata. Each is read once per file and shared. A file that changes
    // is forgotten, so the dev server reads it again.
    const signatures = new Map<string, Promise<string>>();
    const infos = new Map<string, Promise<ImageInfo>>();
    const readSignature = (file: string) =>
      remember(signatures, file, () => getFileSignature(file));
    const readInfo = (file: string) => remember(infos, file, () => limit(() => getImageData(file)));

    // Previews are cached on disk like the variants, keyed by content, so a
    // build or a dev server restart does not compute them again.
    async function readPreview(file: string): Promise<Preview | undefined> {
      if (placeholder.type === "none") {
        return undefined;
      }

      const signature = await readSignature(file);
      const kind = placeholder.type === "image" ? `image-${placeholder.size}` : "blurhash";
      const hash = xxHash32(`v${PIPELINE_VERSION}|${signature}|${kind}`).toString(16);
      const cachePath = path.join(cacheDir, "previews", `p-${hash}.json`);

      if (await fileExists(cachePath)) {
        try {
          const cached = JSON.parse(await fs.readFile(cachePath, "utf8")) as Preview;
          await touchFile(cachePath);
          return cached;
        } catch {
          // A damaged cache file is computed again below.
        }
      }

      const preview = await limit(() => computePlaceholder(file, placeholder));
      await outputFile(cachePath, JSON.stringify(preview));
      return preview;
    }

    plugins.push({
      name: "solid-start:image/local",
      enforce: "pre",
      async buildStart() {
        if (placeholder.type === "blurhash") {
          await loadBlurhash();
        }
        // Old files are removed at startup, before anything reads them.
        await Promise.all([
          pruneStaleFiles(cacheDir, STALE_AFTER_MS),
          pruneStaleFiles(path.join(cacheDir, "previews"), STALE_AFTER_MS),
          pruneStaleFiles(path.join(publicPath, ".image"), STALE_AFTER_MS),
        ]);
      },
      configResolved(config) {
        isBuild = config.command === "build";
        if (config.cacheDir) {
          cacheDir = path.join(config.cacheDir, "solid-image");
        }
        // The dev server serves the public directory at the root of the site,
        // so processed files have to land there to be reachable.
        if (publicPathOption == null && config.publicDir) {
          publicPath = config.publicDir;
        }
      },
      watchChange(id) {
        const key = path.normalize(id);
        signatures.delete(key);
        infos.delete(key);
      },
      resolveId(id, importer) {
        if (LOCAL_PATH.test(id) && importer) {
          return path.join(path.dirname(importer), id);
        }
        return null;
      },
      async load(id) {
        if (id.startsWith("\0")) {
          return null;
        }
        const { dir, name, ext } = path.parse(id);
        const [actualExtension, condition] = ext.substring(1).split("?");
        // Check if extension is valid
        if (!isValidFileExtension(validInputFileExtensions, actualExtension!)) {
          return null;
        }
        if (!condition) {
          return null;
        }
        const originalPath = `${dir}/${name}.${actualExtension}`;
        const relativePath = `./${name}.${actualExtension}`;
        // Get the true source
        if (condition.startsWith("image-source")) {
          const [info, preview] = await Promise.all([
            readInfo(originalPath),
            readPreview(originalPath),
          ]);
          return getImageSource(
            relativePath,
            info,
            preview,
            outputFormat,
            sizes,
            placeholder.type === "blurhash",
          );
        }
        // Get the transformer file
        if (condition.startsWith("image-transformer")) {
          const { width, transparent } = await readInfo(originalPath);
          return getImageTransformer(
            relativePath,
            getEffectiveFormats(outputFormat, transparent),
            getEffectiveSizes(sizes, width),
          );
        }
        // Image transformer variant
        if (condition.startsWith("image-raw")) {
          const [, , rawFormat, rawSize] = condition.split("-");
          const format = rawFormat as SolidImageFormat;
          const size = +rawSize!;
          const quality = getQuality(format);
          const signature = await readSignature(originalPath);
          const filename = getVariantFilename(signature, format, size, quality);
          const encode = () =>
            limit(() => transformImage(originalPath, format, size, quality).toBuffer());

          // On build the file goes through the bundler, so it picks up `base`,
          // `assetsDir` and the manifest like any other asset.
          if (isBuild) {
            // Nothing is written to the public directory on build, so keep the
            // encoded file in the Vite cache directory. The next build reads it
            // back instead of encoding again.
            const cachePath = path.join(cacheDir, filename);
            let buffer: Buffer;
            if (await fileExists(cachePath)) {
              buffer = await fs.readFile(cachePath);
              await touchFile(cachePath);
            } else {
              buffer = await encode();
              await outputFile(cachePath, buffer);
            }
            const referenceId = this.emitFile({
              type: "asset",
              name: filename,
              source: buffer,
            });
            return `export default import.meta.ROLLUP_FILE_URL_${referenceId};`;
          }

          const basePath = path.join(".image", filename);
          const targetPath = path.join(publicPath, basePath);
          // Encoding is the slow part, so skip it when the file is already there.
          if (await fileExists(targetPath)) {
            await touchFile(targetPath);
          } else {
            await outputFile(targetPath, await encode());
          }
          return `export default "/${basePath}"`;
        }
        // Image transformer variant
        if (condition.startsWith("image-")) {
          const [, format, size] = condition.split("-");

          return getImageVariant(relativePath, format as SolidImageFormat, +size!);
        }
        if (condition.startsWith("image")) {
          return getImageEntryPoint(relativePath);
        }
        return null;
      },
    });
  }

  return plugins;
};
