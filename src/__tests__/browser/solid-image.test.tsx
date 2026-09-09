import { onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolidImage } from "../../core/index";
import "../../core/styles.css";

// A 1x1 transparent PNG, so the browser can really load an image offline.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  document.body.innerHTML = "";
  window.scrollTo(0, 0);
});

/**
 * Mounts the component below the fold, inside a page that scrolls.
 * `scrollIntoView` then moves it into the viewport.
 */
function mount(ui: () => ReturnType<typeof SolidImage>) {
  const page = document.createElement("div");
  const spacer = document.createElement("div");
  spacer.style.height = "200vh";
  const host = document.createElement("div");
  host.style.width = "320px";

  page.append(spacer, host);
  document.body.append(page);

  disposers.push(render(ui, host));

  return { host, scrollIntoView: () => host.scrollIntoView() };
}

function findImage(host: HTMLElement) {
  return host.querySelector<HTMLImageElement>('img[data-solid-image="image"]');
}

function Placeholder(props: { show: () => void }) {
  onMount(() => {
    props.show();
  });

  return <div data-test="placeholder">Loading...</div>;
}

describe("SolidImage in the browser", () => {
  it("does not render the image before it scrolls into view", async () => {
    const { host } = mount(() => (
      <SolidImage
        src={{ source: PIXEL, width: 100, height: 100, options: {} }}
        alt="pixel"
        fallback={(visible, show) => (
          <Show when={visible()}>
            <Placeholder show={show} />
          </Show>
        )}
      />
    ));

    // Give the observer a chance to report, then confirm nothing rendered.
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(findImage(host)).toBe(null);
    expect(host.querySelector('[data-test="placeholder"]')).toBe(null);
  });

  it("renders the image with its source once it scrolls into view", async () => {
    const { host, scrollIntoView } = mount(() => (
      <SolidImage
        src={{ source: PIXEL, width: 100, height: 100, options: {} }}
        alt="pixel"
        fallback={(visible, show) => (
          <Show when={visible()}>
            <Placeholder show={show} />
          </Show>
        )}
      />
    ));

    scrollIntoView();

    await expect.poll(() => findImage(host)?.getAttribute("src")).toBe(PIXEL);
    expect(findImage(host)!.alt).toBe("pixel");
  });

  it("shows the placeholder, then reveals the loaded image", async () => {
    const onLoad = vi.fn();
    let visibleOnMount: boolean | undefined;

    const { host, scrollIntoView } = mount(() => (
      <SolidImage
        src={{ source: PIXEL, width: 100, height: 100, options: {} }}
        alt="pixel"
        onLoad={onLoad}
        fallback={(visible, show) => (
          <Show when={visible()}>
            <Placeholder
              show={() => {
                // The image loads in a few milliseconds, so record the state
                // here instead of polling for a placeholder that is already gone.
                visibleOnMount = visible();
                show();
              }}
            />
          </Show>
        )}
      />
    ));

    scrollIntoView();

    await expect.poll(() => findImage(host)?.style.opacity).toBe("1");

    expect(visibleOnMount).toBe(true);
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-test="placeholder"]')).toBe(null);
  });

  it("keeps the image hidden while the placeholder has not mounted", async () => {
    const { host, scrollIntoView } = mount(() => (
      <SolidImage
        src={{ source: PIXEL, width: 100, height: 100, options: {} }}
        alt="pixel"
        // This placeholder never calls show, so the image must stay hidden.
        fallback={() => <div data-test="placeholder">Loading...</div>}
      />
    ));

    scrollIntoView();

    await expect.poll(() => findImage(host)).not.toBe(null);
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(findImage(host)!.style.opacity).toBe("0");
  });

  it("renders one source per MIME type from the transformer", async () => {
    const { host, scrollIntoView } = mount(() => (
      <SolidImage
        src={{ source: PIXEL, width: 1600, height: 900, options: {} }}
        alt="pixel"
        transformer={{
          transform: () => [
            { path: PIXEL, width: 400, type: "image/webp" },
            { path: PIXEL, width: 800, type: "image/webp" },
            { path: PIXEL, width: 400, type: "image/png" },
          ],
        }}
        fallback={(visible, show) => (
          <Show when={visible()}>
            <Placeholder show={show} />
          </Show>
        )}
      />
    ));

    scrollIntoView();

    await expect.poll(() => findImage(host)).not.toBe(null);

    const sources = [...host.querySelectorAll("source")];
    expect(sources).toHaveLength(2);
    expect(sources.map(source => source.type)).toEqual(["image/webp", "image/png"]);
    expect(sources[0]!.srcset).toBe(`${PIXEL} 400w,${PIXEL} 800w`);
  });

  it("loads an eager image without waiting for it to scroll into view", async () => {
    const { host } = mount(() => (
      <SolidImage
        src={{ source: PIXEL, width: 100, height: 100, options: {} }}
        alt="pixel"
        eager
        fallback={(visible, show) => (
          <Show when={visible()}>
            <Placeholder show={show} />
          </Show>
        )}
      />
    ));

    // Never scrolled into view, so only `eager` can render this.
    await expect.poll(() => findImage(host)?.getAttribute("src")).toBe(PIXEL);
    await expect.poll(() => findImage(host)?.style.opacity).toBe("1");
  });

  it("gives the img a srcset the browser can pick from", async () => {
    const { host, scrollIntoView } = mount(() => (
      <SolidImage
        src={{ source: PIXEL, width: 1600, height: 900, options: {} }}
        alt="pixel"
        transformer={{
          transform: () => [
            { path: PIXEL, width: 400, type: "image/webp" },
            { path: PIXEL, width: 400, type: "image/jpeg" },
            { path: PIXEL, width: 800, type: "image/jpeg" },
          ],
        }}
        fallback={(visible, show) => (
          <Show when={visible()}>
            <Placeholder show={show} />
          </Show>
        )}
      />
    ));

    scrollIntoView();

    await expect.poll(() => findImage(host)).not.toBe(null);

    expect(findImage(host)!.srcset).toBe(`${PIXEL} 400w,${PIXEL} 800w`);
  });

  it("reserves the aspect ratio before the image loads", () => {
    const { host } = mount(() => (
      <SolidImage
        src={{ source: PIXEL, width: 1600, height: 900, options: {} }}
        alt="pixel"
        fallback={() => <div>Loading...</div>}
      />
    ));

    const box = host.querySelector<HTMLElement>('[data-solid-image="aspect-ratio"]')!;

    // 320px wide at 16:9.
    expect(box.getBoundingClientRect().height).toBeCloseTo(180, 0);
  });

  it("applies the shipped stylesheet to the rendered elements", () => {
    const { host } = mount(() => (
      <SolidImage
        src={{ source: PIXEL, width: 100, height: 100, options: {} }}
        alt="pixel"
        fallback={() => <div>Loading...</div>}
      />
    ));

    const picture = host.querySelector<HTMLElement>('[data-solid-image="picture"]')!;

    expect(getComputedStyle(picture).position).toBe("absolute");
  });
});
