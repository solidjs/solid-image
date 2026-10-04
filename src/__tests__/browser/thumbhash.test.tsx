import { onMount, Show } from "solid-js";
import { render } from "solid-js/web";
import { rgbaToThumbHash, thumbHashToDataURL } from "thumbhash";
import { afterEach, describe, expect, it } from "vitest";
import { SolidImage } from "../../core/index";
import "../../core/styles.css";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.innerHTML = "";
  window.scrollTo(0, 0);
});

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
  onMount(() => props.show());
  return <div>Loading...</div>;
}

describe("ThumbHash preview in the browser", () => {
  it("decodes the binary hash and removes the preview after the image loads", async () => {
    const hash = rgbaToThumbHash(
      2,
      1,
      new Uint8Array([51, 102, 153, 128, 102, 153, 204, 128]),
    );
    const calls: Uint8Array[] = [];

    const { host, scrollIntoView } = mount(() => (
      <SolidImage
        src={{
          source: PIXEL,
          width: 1600,
          height: 900,
          options: {},
          placeholder: {
            hash,
            color: "rgba(51, 102, 153, 0.5)",
            decode: (value: Uint8Array) => {
              calls.push(value);
              return thumbHashToDataURL(value);
            },
          },
        }}
        alt="pixel"
        fallback={(visible, show) => (
          <Show when={visible()}>
            <Placeholder show={show} />
          </Show>
        )}
      />
    ));

    const box = host.querySelector<HTMLElement>('[data-solid-image="aspect-ratio"]')!;

    await expect.poll(() => box.style.backgroundImage).toContain("data:image/png");
    expect(box.style.backgroundColor).toBe("rgba(51, 102, 153, 0.5)");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(hash);

    scrollIntoView();
    await expect.poll(() => findImage(host)?.style.opacity).toBe("1");

    expect(box.style.backgroundImage).toBe("");
    expect(box.style.backgroundColor).toBe("");
  });
});
