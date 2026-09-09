import type { JSX } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { ClientOnly } from "./client-only.tsx";
import { createLazyRender } from "./create-lazy-render.ts";
import {
  createImageVariants,
  mergeImageVariantsByType,
  mergeImageVariantsToSrcSet,
} from "./transformer.ts";
import type { SolidImageSource, SolidImageTransformer, SolidImageVariant } from "./types.ts";
import { getAspectRatioBoxStyle, getEmptyImageURL } from "./utils.ts";

import "./styles.css";

export interface SolidImageProps<T> {
  /** The image, its intrinsic size and any options the transformer needs. */
  src: SolidImageSource<T>;
  /** Alternative text for the image. */
  alt: string;
  /** Produces the responsive variants of the source. */
  transformer?: SolidImageTransformer<T>;

  /** Called once the image has loaded and the placeholder is hidden. */
  onLoad?: () => void;
  /**
   * Placeholder shown while the image loads. It only renders on the client,
   * and only after the container enters the viewport.
   *
   * `visible` is true while the placeholder should be shown.
   * Call `onLoad` once the placeholder has mounted. The image is only
   * revealed after that call, so a fast image never skips the placeholder.
   */
  fallback: (visible: () => boolean, onLoad: () => void) => JSX.Element;

  crossOrigin?: JSX.HTMLCrossorigin | undefined;
  fetchPriority?: "high" | "low" | "auto" | undefined;
  decoding?: "sync" | "async" | "auto" | undefined;
}

interface SolidImageSourcesProps<T> extends SolidImageProps<T> {
  variants: SolidImageVariant[];
}

function SolidImageSources<T>(props: SolidImageSourcesProps<T>): JSX.Element {
  const mergedVariants = createMemo(() => {
    const types = mergeImageVariantsByType(props.variants);

    const values: [type: string, srcset: string][] = [];

    for (const [key, variants] of types) {
      values.push([key, mergeImageVariantsToSrcSet(variants)]);
    }

    return values;
  });

  return (
    <For each={mergedVariants()}>{([type, srcset]) => <source type={type} srcset={srcset} />}</For>
  );
}

/**
 * Renders a responsive image inside a box that keeps its aspect ratio.
 * The image loads once the box enters the viewport, and the placeholder
 * is shown until then.
 */
export function SolidImage<T>(props: SolidImageProps<T>): JSX.Element {
  const [showPlaceholder, setShowPlaceholder] = createSignal(true);
  const laze = createLazyRender<HTMLDivElement>();
  const [defer, setDefer] = createSignal(true);

  function onPlaceholderLoad() {
    setDefer(false);
  }

  const width = createMemo(() => props.src.width);
  const height = createMemo(() => props.src.height);

  return (
    <div ref={laze.ref} data-solid-image="container">
      <div
        data-solid-image="aspect-ratio"
        style={getAspectRatioBoxStyle({
          width: width(),
          height: height(),
        })}
      >
        <picture data-solid-image="picture">
          <Show when={props.transformer}>
            {cb => <SolidImageSources variants={createImageVariants(props.src, cb())} {...props} />}
          </Show>
          <ClientOnly
            fallback={
              // The image must not load before it scrolls into view, so the
              // server renders a blank placeholder of the same size instead.
              <img
                data-solid-image="image"
                src={getEmptyImageURL({
                  width: width(),
                  height: height(),
                })}
                alt={props.alt}
                crossOrigin={props.crossOrigin}
                fetchpriority={props.fetchPriority}
                decoding={props.decoding}
              />
            }
          >
            <Show when={laze.visible}>
              <img
                data-solid-image="image"
                src={props.src.source}
                alt={props.alt}
                onLoad={() => {
                  if (!defer()) {
                    setShowPlaceholder(false);
                    props.onLoad?.();
                  }
                }}
                style={{
                  opacity: showPlaceholder() ? 0 : 1,
                }}
                crossOrigin={props.crossOrigin}
                fetchpriority={props.fetchPriority}
                decoding={props.decoding}
              />
            </Show>
          </ClientOnly>
        </picture>
      </div>
      <div data-solid-image="blocker">
        <ClientOnly>
          <Show when={laze.visible}>{props.fallback(showPlaceholder, onPlaceholderLoad)}</Show>
        </ClientOnly>
      </div>
    </div>
  );
}

export * from "./types";
