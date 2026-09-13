import { createEffect, createSignal } from "solid-js";

export interface LazyRender<T extends HTMLElement> {
  ref: (value: T) => void;
  visible: boolean;
}

export interface LazyRenderOptions {
  refresh?: boolean;
}

/**
 * Tracks whether the host element is in the viewport.
 * Set `refresh` to keep watching after the first intersection,
 * so `visible` also turns false when the element leaves the viewport.
 */
export function createLazyRender<T extends HTMLElement>(
  options?: LazyRenderOptions,
): LazyRender<T> {
  const [visible, setVisible] = createSignal(false);

  // The host is a signal, so a new host element starts a new observer.
  const [ref, setRef] = createSignal<T | null>(null);

  createEffect(
    () => ref(),
    current => {
      // A new host starts hidden until it intersects.
      setVisible(false);
      if (!current) {
        return;
      }

      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (options?.refresh) {
            setVisible(entry.isIntersecting);
          } else if (entry.isIntersecting) {
            setVisible(true);
            // Stop watching once the host has been seen.
            observer.disconnect();
          }
        }
      });

      observer.observe(current);

      return () => {
        observer.disconnect();
      };
    },
  );

  return {
    ref(value) {
      setRef(() => value);
    },
    get visible() {
      return visible();
    },
  };
}
