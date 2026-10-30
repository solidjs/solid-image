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

type IntersectionCallback = (entry: IntersectionObserverEntry) => void;

interface SharedObserver {
  observer: IntersectionObserver;
  callbacks: Map<Element, IntersectionCallback>;
}

// One observer per root margin, shared by every host that uses that margin.
// The browser checks each observer on every frame, so a page with hundreds of
// images scrolls faster with one observer than with one per image.
const observers = new Map<string, SharedObserver>();

/**
 * Calls `callback` whenever the element crosses the viewport, grown by
 * `rootMargin`. Returns a function that stops watching the element. It is
 * safe to call more than once.
 */
function observe(
  element: Element,
  rootMargin: string | undefined,
  callback: IntersectionCallback,
): () => void {
  const key = rootMargin ?? "";
  let shared = observers.get(key);
  if (!shared) {
    const callbacks = new Map<Element, IntersectionCallback>();
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          callbacks.get(entry.target)?.(entry);
        }
      },
      // With the document as root, the margin grows this page's viewport. The
      // default root ignores the margin when the page runs inside an iframe.
      { root: document, rootMargin },
    );
    shared = { observer, callbacks };
    observers.set(key, shared);
  }

  const current = shared;
  current.callbacks.set(element, callback);
  current.observer.observe(element);

  let stopped = false;
  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    current.callbacks.delete(element);
    current.observer.unobserve(element);

    // The last host is gone, so the observer is too.
    if (current.callbacks.size === 0) {
      current.observer.disconnect();
      observers.delete(key);
    }
  };
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
    const stop = observe(current, options?.rootMargin, entry => {
      if (shouldRefresh) {
        setVisible(entry.isIntersecting);
      } else if (entry.isIntersecting) {
        // Host intersected, set visibility to true
        setVisible(true);

        // Stop observing
        stop();
      }
    });

    onCleanup(stop);
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
