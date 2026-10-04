import { createEffect, createSignal } from "solid-js";

export interface LazyRender<T extends HTMLElement> {
  ref: (value: T) => void;
  visible: boolean;
}

export interface LazyRenderOptions {
  refresh?: boolean;
  /** Grows the viewport by this CSS margin, so the host counts as visible before it scrolls in. */
  rootMargin?: string;
}

/**
 * Tracks whether the host element is in the viewport.
 * Set `refresh` to keep watching after the first intersection,
 * so `visible` also turns false when the element leaves the viewport.
 * Set `rootMargin` to count the host as visible while it is still near the viewport.
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

      const observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            if (options?.refresh) {
              setVisible(entry.isIntersecting);
            } else if (entry.isIntersecting) {
              setVisible(true);
              // Stop watching once the host has been seen.
              observer.disconnect();
            }
          }
        },
        // With the document as root, the margin grows this page's viewport. The
        // default root ignores the margin when the page runs inside an iframe.
        { root: document, rootMargin: options?.rootMargin },
      );

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
