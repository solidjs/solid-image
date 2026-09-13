import { createEffect, createSignal, onCleanup } from "solid-js";

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

  // We use a reactive ref here so that the component
  // re-renders if the host element changes, therefore
  // re-evaluating our intersection logic
  const [ref, setRef] = createSignal<T | null>(null);

  createEffect(() => {
    // If the host changed, make sure that
    // visibility is set to false
    setVisible(false);
    const shouldRefresh = options?.refresh;

    const current = ref();
    if (!current) {
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (shouldRefresh) {
            setVisible(entry.isIntersecting);
          } else if (entry.isIntersecting) {
            // Host intersected, set visibility to true
            setVisible(true);

            // Stop observing
            observer.disconnect();
          }
        }
      },
      // With the document as root, the margin grows this page's viewport. The
      // default root ignores the margin when the page runs inside an iframe.
      { root: document, rootMargin: options?.rootMargin },
    );

    observer.observe(current);

    onCleanup(() => {
      observer.unobserve(current);
      observer.disconnect();
    });
  });

  return {
    ref(value) {
      return setRef(() => value);
    },
    get visible() {
      return visible();
    },
  };
}
