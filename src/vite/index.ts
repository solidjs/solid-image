import fs from "node:fs/promises";
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
import { fileExists, getFileSignature, outputFile } from "./fs.ts";
import {
  getBlurhashData,
  getImageData,
  getPlaceholderData,
  transformImage,
} from "./transformers.ts";
import xxHash32 from "./xxhash32.ts";

const DEFAULT_INPUT: SolidImageFormat[] = ["png", "jpeg", "webp"];
const DEFAULT_OUTPUT: SolidImageFormat[] = ["png", "jpeg", "webp"];
// sharp takes a quality from 1 to 100.
const DEFAULT_QUALITY = 80;
// Width of the inline preview, in pixels. Small enough to stay under a
// kilobyte once encoded, large enough to show the shape of the image.
const DEFAULT_PLACEHOLDER_SIZE = 20;
// A common BlurHash default. It keeps the broad shape of the image in a hash of
// about 30 characters.
const DEFAULT_BLURHASH_COMPONENT_X = 4;
const DEFAULT_BLURHASH_COMPONENT_Y = 3;

type MaybePromise<T> = T | Promise<T>;

/** Turns on a BlurHash preview instead of the inline image preview. */
export interface BlurhashPlaceholderOptions {
  type: "blurhash";
  /** Horizontal components, from 1 to 9. More keep more detail. Defaults to 4. */
  componentX?: number;
  /** Vertical components, from 1 to 9. More keep more detail. Defaults to 3. */
  componentY?: number;
}

export interface SolidImageOptions {
  /** Handles imports that end with `?image`. */
  local?: {
    /** Output widths in pixels. The height follows the aspect ratio. */
    sizes: number[];
    /** Source formats to process. Other files are left alone. Defaults to png, jpeg and webp. */
    input?: SolidImageFormat[];
    /** Formats to emit. One file is written per format and per size. Defaults to png, jpeg and webp. */
    output?: SolidImageFormat[];
    /** Quality passed to sharp, from 1 to 100. Defaults to 80. */
    quality?: number;
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
  };
  /** Handles imports that start with `image:`. */
  remote?: {
    /** Maps the text after `image:` to a source and its variants. May be async. */
    transformURL(url: string): MaybePromise<{
      src: {
        source: string;
        width: number;
        height: number;
        placeholder?: SolidImagePlaceholder | Omit<SolidImageBlurhashPlaceholder, "decode">;
      };
      variants: SolidImageVariant | SolidImageVariant[];
    }>;
  };
}

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
  | { type: "blurhash"; componentX: number; componentY: number };

function assertComponents(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 9) {
    throw new Error(`BlurHash ${name} must be a whole number from 1 to 9, got ${value}.`);
  }
}

function resolvePlaceholder(
  option: NonNullable<SolidImageOptions["local"]>["placeholder"],
): ResolvedPlaceholder {
  if (option === false) {
    return { type: "none" };
  }
  if (option === undefined || option === true) {
    return { type: "image", size: DEFAULT_PLACEHOLDER_SIZE };
  }
  if (option.type === "blurhash") {
    const componentX = option.componentX ?? DEFAULT_BLURHASH_COMPONENT_X;
    const componentY = option.componentY ?? DEFAULT_BLURHASH_COMPONENT_Y;
    assertComponents("componentX", componentX);
    assertComponents("componentY", componentY);
    return { type: "blurhash", componentX, componentY };
  }
  return { type: "image", size: option.size ?? DEFAULT_PLACEHOLDER_SIZE };
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

async function getPlaceholder(
  imagePath: string,
  placeholder: ResolvedPlaceholder,
): Promise<SolidImagePlaceholder | Omit<SolidImageBlurhashPlaceholder, "decode"> | undefined> {
  switch (placeholder.type) {
    case "none":
      return undefined;
    case "image":
      return await getPlaceholderData(imagePath, placeholder.size);
    case "blurhash": {
      const { encode } = await loadBlurhash();
      return await getBlurhashData(
        imagePath,
        encode,
        placeholder.componentX,
        placeholder.componentY,
      );
    }
  }
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
 * Builds the module that carries the image, its intrinsic size and its preview.
 *
 * `source` points at the largest variant of the fallback format rather than the
 * original file, so the untouched original never reaches the bundle.
 */
async function getImageSource(
  imagePath: string,
  relativePath: string,
  fallback: SolidImageFormat,
  sizes: number[],
  placeholder: ResolvedPlaceholder,
): Promise<string> {
  const [imageData, preview] = await Promise.all([
    getImageData(imagePath),
    getPlaceholder(imagePath, placeholder),
  ]);
  const largestSize = Math.max(...getEffectiveSizes(sizes, imageData.width));
  // A BlurHash is decoded in the browser. The module brings the decoder along,
  // so only apps that turned the BlurHash preview on import the package.
  const isBlurhash = placeholder.type === "blurhash";
  const variantPath = `${relativePath}?image-raw-${fallback}-${largestSize}`;

  return `
import source from ${JSON.stringify(variantPath)};
${isBlurhash ? 'import { decode } from "blurhash";' : ""}
export default {
  width: ${JSON.stringify(imageData.width)},
  height: ${JSON.stringify(imageData.height)},
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
    const quality = options.local.quality ?? DEFAULT_QUALITY;
    const sizes = options.local.sizes;
    const publicPathOption = options.local.publicPath;
    // Replaced by Vite's public directory once the config is resolved.
    let publicPath = publicPathOption ?? "public";
    const placeholder = resolvePlaceholder(options.local.placeholder);
    // The last output format is the least preferred one, so it is the format
    // every browser is expected to read.
    const fallbackFormat = outputFormat[outputFormat.length - 1]!;

    const validInputFileExtensions = getValidFileExtensions(inputFormat);

    let isBuild = false;
    // Replaced by the Vite cache directory once the config is resolved.
    let cacheDir = path.join("node_modules", ".vite", "solid-image");

    plugins.push({
      name: "solid-start:image/local",
      enforce: "pre",
      async buildStart() {
        if (placeholder.type === "blurhash") {
          await loadBlurhash();
        }
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
          return await getImageSource(
            originalPath,
            relativePath,
            fallbackFormat,
            sizes,
            placeholder,
          );
        }
        // Get the transformer file
        if (condition.startsWith("image-transformer")) {
          const { width } = await getImageData(originalPath);
          return getImageTransformer(relativePath, outputFormat, getEffectiveSizes(sizes, width));
        }
        // Image transformer variant
        if (condition.startsWith("image-raw")) {
          const [, , format, size] = condition.split("-");
          // The name covers everything that changes the output, so an edited
          // image or a changed option never reuses a stale file. It leaves out
          // the file path, which differs between checkouts.
          const signature = await getFileSignature(originalPath);
          const hash = xxHash32(`${signature}|${format}|${size}|${quality}`).toString(16);
          const filename = `i-${hash}-${size}.${getOutputFileFromFormat(format as SolidImageFormat)}`;
          const encode = () =>
            transformImage(originalPath, format as SolidImageFormat, +size!, quality).toBuffer();

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
          if (!(await fileExists(targetPath))) {
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
