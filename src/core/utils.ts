import type { JSX } from "@solidjs/web";
import type { AspectRatio } from "./aspect-ratio";
import type { SolidImageBlurhashPlaceholder, SolidImagePlaceholder } from "./types";

function kebabify(str: string): string {
  return str
    .replace(/([A-Z])([A-Z])/g, "$1-$2")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/**
 * Converts camelCase style keys to kebab-case.
 * Solid only accepts kebab-case keys when the style object is rendered as a string.
 */
export function shimStyle(style: JSX.CSSProperties): JSX.CSSProperties {
  const keys = Object.keys(style) as (keyof JSX.CSSProperties)[];
  const newStyle: JSX.CSSProperties = {};

  for (let i = 0, len = keys.length; i < len; i += 1) {
    const key = kebabify(keys[i]!);
    newStyle[key as any] = style[keys[i]!];
  }
  return newStyle;
}

/**
 * Style for a box that keeps the given aspect ratio at any width.
 * The height comes from a percentage padding, which is relative to the width.
 */
export function getAspectRatioBoxStyle(ratio: AspectRatio): JSX.CSSProperties {
  return {
    position: "relative",
    "padding-top": `${(ratio.height * 100) / ratio.width}%`,
    width: "100%",
    height: "0",
    overflow: "hidden",
  };
}

/**
 * Style that paints the preview behind the image.
 * The preview is a few pixels wide, so the browser scales it up and blurs it.
 * Without a URL only the color is painted.
 */
export function getPlaceholderStyle(placeholder: {
  color: string;
  url?: string | undefined;
}): JSX.CSSProperties {
  const style: JSX.CSSProperties = {
    "background-color": placeholder.color,
  };

  if (placeholder.url) {
    style["background-image"] = `url("${placeholder.url}")`;
    style["background-size"] = "cover";
    style["background-position"] = "center";
  }

  return style;
}

/** Tells a BlurHash preview apart from an inline image preview. */
export function isBlurhashPlaceholder(
  placeholder: SolidImagePlaceholder | SolidImageBlurhashPlaceholder,
): placeholder is SolidImageBlurhashPlaceholder {
  return "hash" in placeholder;
}

/**
 * Decodes a BlurHash into a PNG data URL of the given size.
 * It draws on a canvas, so call it in the browser only.
 */
export function getBlurhashURL(
  placeholder: SolidImageBlurhashPlaceholder,
  width: number,
  height: number,
): string | undefined {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const image = context.createImageData(width, height);
  image.data.set(placeholder.decode(placeholder.hash, width, height));
  context.putImageData(image, 0, 0);

  return canvas.toDataURL();
}

/** Returns an empty SVG of the given size. */
export function getEmptySVGPlaceholder({ width, height }: AspectRatio): string {
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" version="1.1"/>`;
}

/** Wraps an SVG string in a data URL. */
export function getEncodedSVG(svg: string): string {
  const encodedSVG = encodeURIComponent(svg);
  return `data:image/svg+xml,${encodedSVG}`;
}

/** Encodes the given SVG, or an empty one of that size when none is given. */
export function getEncodedOptionalSVG(ratio: AspectRatio, svg?: string): string {
  return getEncodedSVG(svg || getEmptySVGPlaceholder(ratio));
}

/** Returns a data URL usable as a blank `img` source of the given size. */
export function getEmptyImageURL(ratio: AspectRatio): string {
  return getEncodedOptionalSVG(ratio);
}
