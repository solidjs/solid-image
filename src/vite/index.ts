import path from "node:path";
import type { Plugin } from "vite";
import { getFilesFromFormat, getMIMEFromFormat, getOutputFileFromFormat } from "../core/transformer.ts";
import type { SolidImageFile, SolidImageFormat, SolidImageVariant } from "../core/types.ts";
import { outputFile } from "./fs.ts";
import { getImageData, transformImage } from "./transformers.ts";
import xxHash32 from "./xxhash32.ts";

const DEFAULT_INPUT: SolidImageFormat[] = ["png", "jpeg", "webp"];
const DEFAULT_OUTPUT: SolidImageFormat[] = ["png", "jpeg", "webp"];
// sharp takes a quality from 1 to 100.
const DEFAULT_QUALITY = 80;

type MaybePromise<T> = T | Promise<T>;

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
    /** Directory the processed files are written to. Defaults to `dist`. */
    publicPath?: string;
  };
  /** Handles imports that start with `image:`. */
  remote?: {
    /** Maps the text after `image:` to a source and its variants. May be async. */
    transformURL(url: string): MaybePromise<{
      src: {
        source: string;
        width: number;
        height: number;
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

/**
 * Builds the module that carries the image and its intrinsic size.
 *
 * `source` points at the largest variant of the fallback format rather than the
 * original file, so the untouched original never reaches the bundle.
 */
async function getImageSource(
  imagePath: string,
  relativePath: string,
  fallback: SolidImageFormat,
  largestSize: number,
): Promise<string> {
  const imageData = await getImageData(imagePath);
  const variantPath = `${relativePath}?image-raw-${fallback}-${largestSize}`;

  return `
import source from ${JSON.stringify(variantPath)};
export default {
  width: ${JSON.stringify(imageData.width)},
  height: ${JSON.stringify(imageData.height)},
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

          return `const VARIANTS = ${JSON.stringify(result.variants)};
export default {
  src: ${JSON.stringify(result.src)},
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
    const publicPath = options.local.publicPath ?? "dist";
    // The last output format is the least preferred one, so it is the format
    // every browser is expected to read.
    const fallbackFormat = outputFormat[outputFormat.length - 1]!;
    const largestSize = Math.max(...sizes);

    const validInputFileExtensions = getValidFileExtensions(inputFormat);

    let isBuild = false;

    plugins.push({
      name: "solid-start:image/local",
      enforce: "pre",
      configResolved(config) {
        isBuild = config.command === "build";
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
          return await getImageSource(originalPath, relativePath, fallbackFormat, largestSize);
        }
        // Get the transformer file
        if (condition.startsWith("image-transformer")) {
          return getImageTransformer(relativePath, outputFormat, sizes);
        }
        // Image transformer variant
        if (condition.startsWith("image-raw")) {
          const [, , format, size] = condition.split("-");
          const hash = xxHash32(originalPath).toString(16);
          const filename = `i-${hash}-${size}.${getOutputFileFromFormat(format as SolidImageFormat)}`;
          const image = transformImage(originalPath, format as SolidImageFormat, +size!, quality);
          const buffer = await image.toBuffer();

          // On build the file goes through the bundler, so it picks up `base`,
          // `assetsDir` and the manifest like any other asset.
          if (isBuild) {
            const referenceId = this.emitFile({
              type: "asset",
              name: filename,
              source: buffer,
            });
            return `export default import.meta.ROLLUP_FILE_URL_${referenceId};`;
          }

          const basePath = path.join(".image", filename);
          const targetPath = path.join(publicPath, basePath);
          await outputFile(targetPath, buffer);
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
