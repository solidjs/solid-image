import { createRoot } from "solid-js";
import { renderToString } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { ClientOnly, createClientSignal } from "../core/client-only";
import { createLazyRender } from "../core/create-lazy-render";
import { SolidImage } from "../core/index";

// ---------------------------------------------------------------------------
// createLazyRender
// ---------------------------------------------------------------------------
describe("createLazyRender", () => {
  it("starts with visible = false", () => {
    let visible: boolean | undefined;

    createRoot(dispose => {
      const laze = createLazyRender<HTMLDivElement>();
      visible = laze.visible;
      dispose();
    });

    expect(visible).toBe(false);
  });

  it("exposes a callable ref setter", () => {
    createRoot(dispose => {
      const laze = createLazyRender<HTMLDivElement>();
      expect(typeof laze.ref).toBe("function");
      dispose();
    });
  });

  it("returns correct shape with refresh option", () => {
    createRoot(dispose => {
      const laze = createLazyRender<HTMLDivElement>({ refresh: true });
      expect(typeof laze.ref).toBe("function");
      expect(laze.visible).toBe(false);
      dispose();
    });
  });
});

// ---------------------------------------------------------------------------
// createClientSignal  (server context -- isServer is true in Node)
// ---------------------------------------------------------------------------
describe("createClientSignal", () => {
  it("returns a function that resolves to false on the server", () => {
    const signal = createClientSignal();
    expect(typeof signal).toBe("function");
    expect(signal()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ClientOnly  (server context)
// ---------------------------------------------------------------------------
describe("ClientOnly", () => {
  it("renders the fallback in a server environment", () => {
    const html = renderToString(() => (
      <ClientOnly fallback={<span data-test="fallback">loading</span>}>
        <span data-test="child">client content</span>
      </ClientOnly>
    ));

    expect(html).toContain("loading");
    expect(html).not.toContain("client content");
  });

  it("renders the fallback element when no children are given", () => {
    const html = renderToString(() => <ClientOnly fallback={<div>placeholder</div>} />);

    expect(html).toContain("placeholder");
  });
});

// ---------------------------------------------------------------------------
// SolidImage SSR regression
// ---------------------------------------------------------------------------
describe("SolidImage SSR", () => {
  it("does not throw ReferenceError: document is not defined", () => {
    expect(() => {
      renderToString(() => (
        <SolidImage
          src={{ source: "/test.jpg", width: 100, height: 100, options: {} }}
          alt="test"
          fallback={() => <div>loading</div>}
        />
      ));
    }).not.toThrow();
  });

  it("produces HTML containing the image container", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/test.jpg", width: 100, height: 100, options: {} }}
        alt="test"
        fallback={() => <div>loading</div>}
      />
    ));

    expect(html).toContain('data-solid-image="container"');
  });

  it("renders no <source> when there is no transformer", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 800, height: 600, options: {} }}
        alt="hero image"
        fallback={() => <span>placeholder</span>}
      />
    ));

    expect(html).not.toContain("<source");
    expect(html).toContain('alt="hero image"');
  });

  it("does not request the image on the server", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 800, height: 600, options: {} }}
        alt="hero image"
        fallback={() => <span>placeholder</span>}
      />
    ));

    // The server placeholder is a blank SVG of the same size, so the browser
    // does not fetch the image before it scrolls into view.
    expect(html).toContain("data:image/svg+xml,");
    expect(html).toContain(encodeURIComponent('width="800"'));

    // The real image is only offered to readers with no JavaScript, and a
    // browser never loads the content of a noscript element.
    const outsideNoscript = html.replace(/<noscript[^>]*>.*?<\/noscript>/gs, "");
    expect(outsideNoscript).not.toContain("hero.png");
  });

  it("renders one <source> per MIME type with a srcset", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 1600, height: 900, options: {} }}
        alt="hero"
        transformer={{
          transform: () => [
            { path: "/hero-400.webp", width: 400, type: "image/webp" },
            { path: "/hero-800.webp", width: 800, type: "image/webp" },
            { path: "/hero-400.jpg", width: 400, type: "image/jpeg" },
          ],
        }}
        fallback={() => <div>loading</div>}
      />
    ));

    expect(html).toContain('type="image/webp" srcset="/hero-400.webp 400w,/hero-800.webp 800w"');
    expect(html).toContain('type="image/jpeg" srcset="/hero-400.jpg 400w"');
  });

  it("reserves the aspect ratio box from the source size", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 1600, height: 900, options: {} }}
        alt="hero"
        fallback={() => <div>loading</div>}
      />
    ));

    expect(html).toContain("padding-top:56.25%");
  });

  it("forwards crossOrigin, fetchPriority and decoding to the img", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 100, height: 100, options: {} }}
        alt="hero"
        crossOrigin="anonymous"
        fetchPriority="high"
        decoding="async"
        fallback={() => <div>loading</div>}
      />
    ));

    expect(html).toContain('crossorigin="anonymous"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('decoding="async"');
  });

  it("does not render the fallback on the server", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 100, height: 100, options: {} }}
        alt="hero"
        fallback={() => <div>loading</div>}
      />
    ));

    expect(html).not.toContain("loading");
  });

  it("gives the img a srcset from the least preferred format", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 1600, height: 900, options: {} }}
        alt="hero"
        eager
        transformer={{
          transform: () => [
            { path: "/hero-400.webp", width: 400, type: "image/webp" },
            { path: "/hero-400.jpg", width: 400, type: "image/jpeg" },
            { path: "/hero-800.jpg", width: 800, type: "image/jpeg" },
          ],
        }}
        fallback={() => <div>loading</div>}
      />
    ));

    // Without this the browser falls back to the full size original.
    expect(html).toContain('srcset="/hero-400.jpg 400w,/hero-800.jpg 800w" alt="hero"');
  });

  it("gives the img no srcset when there is no transformer", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 100, height: 100, options: {} }}
        alt="hero"
        eager
        fallback={() => <div>loading</div>}
      />
    ));

    expect(html).not.toContain("srcset=");
  });

  it("renders the real image on the server when it is eager", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 100, height: 100, options: {} }}
        alt="hero"
        eager
        fetchPriority="high"
        fallback={() => <div>loading</div>}
      />
    ));

    const outsideNoscript = html.replace(/<noscript[^>]*>.*?<\/noscript>/gs, "");

    // The browser finds the image while it parses the page, instead of waiting
    // for the observer to report.
    expect(outsideNoscript).toContain('src="/hero.png"');
    expect(outsideNoscript).not.toContain("data:image/svg+xml,");
    expect(outsideNoscript).toContain('fetchpriority="high"');
  });

  it("offers the image to readers with no JavaScript", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 1600, height: 900, options: {} }}
        alt="hero"
        transformer={{
          transform: () => [{ path: "/hero-400.jpg", width: 400, type: "image/jpeg" }],
        }}
        fallback={() => <div>loading</div>}
      />
    ));

    const noscript = /<noscript[^>]*>(.*?)<\/noscript>/s.exec(html)![1]!;

    expect(noscript).toContain('src="/hero.png"');
    expect(noscript).toContain('srcset="/hero-400.jpg 400w"');
    expect(noscript).toContain('alt="hero"');
  });

  it("marks the container, aspect ratio box, picture and blocker elements", () => {
    const html = renderToString(() => (
      <SolidImage
        src={{ source: "/hero.png", width: 100, height: 100, options: {} }}
        alt="hero"
        fallback={() => <div>loading</div>}
      />
    ));

    for (const part of ["container", "aspect-ratio", "picture", "image", "blocker"]) {
      expect(html).toContain(`data-solid-image="${part}"`);
    }
  });
});
