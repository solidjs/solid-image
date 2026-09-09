import type { JSX } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { ClientOnly } from "./client-only.tsx";
import { createLazyRender } from "./create-lazy-render.ts";
import {
  createImageVariants,
  mergeImageVariantsByType,
  mergeImageVariantsToSrcSet,
} from "./transformer.ts";
import type { SolidImageSource, SolidImageTransformer } from "./types.ts";
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

  /**
   * Loads the image right away instead of waiting for it to scroll into view.
   *
   * The server renders the real image, so the browser finds it while it parses
   * the page. Use it for the image above the fold and leave the rest lazy.
   */
  eager?: boolean;

  crossOrigin?: JSX.HTMLCrossorigin | undefined;
  fetchPriority?: "high" | "low" | "auto" | undefined;
  decoding?: "sync" | "async" | "auto" | undefined;
}

/** A MIME type and the `srcset` built from every variant of that type. */
type VariantGroup = [type: string, srcset: string];

interface SolidImageSourcesProps {
  groups: VariantGroup[];
}

function SolidImageSources(props: SolidImageSourcesProps): JSX.Element {
  return <For each={props.groups}>{([type, srcset]) => <source type={type} srcset={srcset} />}</For>;
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

  const groups = createMemo<VariantGroup[]>(() => {
    const transformer = props.transformer;
    if (!transformer) {
      return [];
    }

    const types = mergeImageVariantsByType(createImageVariants(props.src, transformer));

    const values: VariantGroup[] = [];
    for (const [type, variants] of types) {
      values.push([type, mergeImageVariantsToSrcSet(variants)]);
    }

    return values;
  });

  // The browser takes the first `source` it supports and only reaches the `img`
  // when it supports none of them. Give the `img` the last group, which is the
  // least preferred format and so the most widely supported one.
  const fallbackSrcSet = createMemo(() => {
    const values = groups();
    return values.length > 0 ? values[values.length - 1]![1] : undefined;
  });

  const visible = createMemo(() => props.eager || laze.visible);

  const serverSrc = createMemo(() =>
    props.eager
      ? props.src.source
      : getEmptyImageURL({
          width: width(),
          height: height(),
        }),
  );

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
          <SolidImageSources groups={groups()} />
          <ClientOnly
            fallback={
              // An eager image is rendered in full, so the browser finds it
              // while it parses the page. A lazy image gets a blank placeholder
              // of the same size and loads nothing.
              <img
                data-solid-image="image"
                src={serverSrc()}
                srcset={props.eager ? fallbackSrcSet() : undefined}
                alt={props.alt}
                crossOrigin={props.crossOrigin}
                fetchpriority={props.fetchPriority}
                decoding={props.decoding}
              />
            }
          >
            <Show when={visible()}>
              <img
                data-solid-image="image"
                src={props.src.source}
                srcset={fallbackSrcSet()}
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
        {/* Readers with no JavaScript never run the loading logic, so the
            server gives them a plain image they can see. */}
        <ClientOnly
          fallback={
            <noscript>
              <img
                data-solid-image="image"
                src={props.src.source}
                srcset={fallbackSrcSet()}
                alt={props.alt}
                crossOrigin={props.crossOrigin}
                decoding={props.decoding}
              />
            </noscript>
          }
        />
      </div>
      <div data-solid-image="blocker">
        <ClientOnly>
          <Show when={visible()}>{props.fallback(showPlaceholder, onPlaceholderLoad)}</Show>
        </ClientOnly>
      </div>
    </div>
  );
}

export * from "./types";
