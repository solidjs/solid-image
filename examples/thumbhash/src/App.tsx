import { SolidImage } from "@solidjs/image";
import { createSignal, For, onMount, Show } from "solid-js";

import fjord from "../../assets/fjord.jpg?image";
import highlands from "../../assets/highlands.jpg?image";
import sea from "../../assets/sea.jpg?image";
import strawberries from "../../assets/strawberries.jpg?image";
import valley from "../../assets/valley.jpg?image";

const PHOTOS = [
  { image: fjord, alt: "People on a cliff above a long fjord" },
  { image: sea, alt: "Evergreen trees above the sea, with mountains on the far shore" },
  { image: strawberries, alt: "Strawberries in green baskets" },
  { image: highlands, alt: "A narrow road below green cliffs in low cloud" },
  { image: valley, alt: "Granite cliffs above a river lined with pine trees" },
];

function Loading(props: { hold: boolean; show: () => void }) {
  onMount(() => {
    if (!props.hold) {
      props.show();
    }
  });

  return <span class="badge">{props.hold ? "Preview" : "Loading"}</span>;
}

function Gallery(props: { hold: boolean }) {
  return (
    <For each={PHOTOS}>
      {(photo, index) => {
        const placeholder = photo.image.src.placeholder;
        const hash =
          placeholder && "hash" in placeholder && placeholder.hash instanceof Uint8Array
            ? Array.from(placeholder.hash)
                .map(value => value.toString(16).padStart(2, "0"))
                .join("")
            : "";

        return (
          <figure>
            <SolidImage
              {...photo.image}
              alt={photo.alt}
              eager={!props.hold && index() === 0}
              sizes="(max-width: 832px) 100vw, 800px"
              fallback={(visible, show) => (
                <Show when={visible()}>
                  <Loading hold={props.hold} show={show} />
                </Show>
              )}
            />
            <figcaption>
              {photo.alt}. The ThumbHash is <code>{hash}</code>.
            </figcaption>
          </figure>
        );
      }}
    </For>
  );
}

export default function App() {
  const [hold, setHold] = createSignal(false);

  return (
    <main>
      <h1>ThumbHash preview</h1>
      <p>
        Each image carries a compact binary ThumbHash. The browser decodes it into a detailed,
        color-accurate preview while the real image loads. ThumbHash also preserves alpha.
      </p>
      <p>Local images load fast. Keep the previews on screen to see them.</p>
      <label>
        <input type="checkbox" checked={hold()} onChange={event => setHold(event.currentTarget.checked)} />
        Keep the previews on screen
      </label>
      <Show when={hold()} fallback={<Gallery hold={false} />}>
        <Gallery hold />
      </Show>
    </main>
  );
}
