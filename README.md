# `@solidjs/image`

Optimized image components and Vite tooling for [Solid](https://solidjs.com).

- `SolidImage` renders a responsive `<picture>` that reserves the aspect ratio, so the page does not shift while the image loads.
- The image loads once it scrolls into view.
- Your placeholder shows until the image is ready.
- The Vite plugin resizes and reformats local images at build time.
- Remote images go through your own URL mapping, so a CDN can serve the variants.

## Install

```bash
npm i @solidjs/image
```

Requirements:

- `solid-js` 1.9.9 or newer, and Vite 8 or newer. Both are peer dependencies.
- Node 24 or newer for the Vite plugin. It uses [`sharp`](https://sharp.pixelplumbing.com) to process images.

## Setup

### 1. Add the Vite plugin

```ts
// vite.config.ts
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { imagePlugin } from "@solidjs/image/vite";

export default defineConfig({
  plugins: [
    solid(),
    imagePlugin({
      local: {
        input: ["jpeg", "png"],
        output: ["webp", "jpeg"],
        sizes: [480, 800, 1200],
        quality: 80,
        publicPath: "public",
      },
    }),
  ],
});
```

`imagePlugin` returns an array of plugins. Spread it or nest it, Vite accepts both.

### 2. Add the ambient types

TypeScript does not know about imports such as `./photo.png?image` and `image:hero`. Reference the shipped declarations once:

```ts
// env.d.ts
/// <reference types="@solidjs/image/env" />
```

### 3. Import the styles

```ts
import "@solidjs/image/style.css";
```

This positions the picture, the image and the placeholder inside the aspect ratio box. Import it once, in your app entry.

## Usage

### Local image

Import the image with the `?image` query. You get the `src` and `transformer` props.

```tsx
import { SolidImage } from "@solidjs/image";
import { onMount, Show } from "solid-js";

import example from "../images/example.jpg?image";

function Placeholder(props: { show: () => void }) {
  onMount(() => props.show());

  return <div>Loading...</div>;
}

export default function App() {
  return (
    <SolidImage
      {...example}
      alt="example"
      fallback={(visible, show) => (
        <Show when={visible()}>
          <Placeholder show={show} />
        </Show>
      )}
    />
  );
}
```

### Remote image

Import `image:` followed by any string. The plugin passes that string to `transformURL`.

```tsx
import example from "image:foobar";

<SolidImage {...example} alt="example" fallback={() => <div>Loading...</div>} />;
```

```ts
imagePlugin({
  remote: {
    transformURL(url) {
      return {
        src: {
          source: `https://cdn.example.com/${url}/1200.webp`,
          width: 1200,
          height: 900,
        },
        variants: [
          { path: `https://cdn.example.com/${url}/800.webp`, width: 800, type: "image/webp" },
          { path: `https://cdn.example.com/${url}/400.webp`, width: 400, type: "image/webp" },
        ],
      };
    },
  },
});
```

`transformURL` may be async, so it can call a CDN API.

### Without the plugin

The component works on its own. Pass `src` and an optional `transformer`:

```tsx
<SolidImage
  src={{ source: "/hero.jpg", width: 1600, height: 900, options: {} }}
  alt="hero"
  transformer={{
    transform: source => [
      { path: `/cdn/${source.source}?w=400`, width: 400, type: "image/webp" },
      { path: `/cdn/${source.source}?w=800`, width: 800, type: "image/webp" },
    ],
  }}
  fallback={() => <div>Loading...</div>}
/>
```

## API

### `<SolidImage />`

| Prop | Type | Required | Description |
| --- | --- | --- | --- |
| `src` | `SolidImageSource<T>` | yes | The image, its intrinsic size and any options your transformer needs. |
| `alt` | `string` | yes | Alternative text. |
| `fallback` | `(visible: () => boolean, onLoad: () => void) => JSX.Element` | yes | Placeholder shown while the image loads. |
| `transformer` | `SolidImageTransformer<T>` | no | Produces the responsive variants for `src`. |
| `onLoad` | `() => void` | no | Called once the image has loaded and the placeholder is hidden. |
| `crossOrigin` | `JSX.HTMLCrossorigin` | no | Forwarded to the `<img>`. |
| `fetchPriority` | `"high" \| "low" \| "auto"` | no | Forwarded to the `<img>`. |
| `decoding` | `"sync" \| "async" \| "auto"` | no | Forwarded to the `<img>`. |

The `fallback` callback takes two arguments.

- `visible` is a signal. It is `true` while the placeholder should be shown, and `false` once the image has loaded.
- `onLoad` tells the component your placeholder is on screen. Call it once the placeholder has mounted. The image is only revealed after that call, so an image that loads instantly never skips the placeholder.

The `fallback` renders on the client only, and only after the container scrolls into view.

### Types

```ts
interface SolidImageSource<T> {
  source: string;
  width: number;
  height: number;
  options: T;
}

interface SolidImageVariant {
  path: string;
  width: number;
  type: SolidImageMIME;
}

interface SolidImageTransformer<T> {
  transform: (source: SolidImageSource<T>) => SolidImageVariant | SolidImageVariant[];
}
```

- `SolidImageMIME` is `"image/avif" | "image/jpeg" | "image/png" | "image/webp" | "image/tiff"`.
- `SolidImageFormat` is `"avif" | "jpeg" | "png" | "webp" | "tiff"`.
- `SolidImageFile` is every file extension that maps to a format, such as `"jpg"`, `"jfif"` and `"tif"`.

Notes on the shape:

- `width` and `height` are the intrinsic pixel size. They only reserve the aspect ratio box, so any pair with the right ratio works.
- Variants are grouped by `type`, and each group becomes one `<source>` with a merged `srcset`.
- The browser takes the first `<source>` it supports, so order your output formats from most to least preferred.
- Without a transformer no `<source>` is rendered, and the browser loads `src.source`.

### `imagePlugin(options)`

```ts
import { imagePlugin } from "@solidjs/image/vite";
```

Both option groups are optional. Passing neither returns no plugin.

#### `options.local`

Handles imports ending in `?image`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `sizes` | `number[]` | required | Output widths in pixels. Height follows the aspect ratio. |
| `quality` | `number` | `80` | Quality passed to sharp, from 1 to 100. |
| `input` | `SolidImageFormat[]` | `["png", "jpeg", "webp"]` | Source formats to process. Other files are left alone. |
| `output` | `SolidImageFormat[]` | `["png", "jpeg", "webp"]` | Formats to emit. |
| `publicPath` | `string` | `"dist"` | Directory the processed files are written to. |

- One file is emitted per output format and per size. `output: ["webp", "jpeg"]` with `sizes: [480, 800]` gives four files per image.
- Files are written to `<publicPath>/.image/i-<hash>-<width>.<ext>`, and the module exports the URL `/.image/i-<hash>-<width>.<ext>`. The hash is an xxHash32 of the source path.
- `publicPath` should be served at the root of your site. Add `.image` to `.gitignore` when it sits inside a checked in directory such as `public`.

#### `options.remote`

Handles imports starting with `image:`.

| Option | Type | Description |
| --- | --- | --- |
| `transformURL` | `(url: string) => MaybePromise<{ src, variants }>` | Maps the text after `image:` to a source and its variants. |

`src` is `{ source, width, height }`. `variants` is one `SolidImageVariant` or an array of them.

## How it works

1. `SolidImage` renders a padding based aspect ratio box, so the layout is stable before the image arrives.
2. An `IntersectionObserver` watches the container. Nothing loads until it enters the viewport.
3. Once visible, the `<img>` and your placeholder render. The image starts transparent.
4. Your placeholder calls `onLoad` to say it is on screen.
5. When the image finishes loading after that call, the placeholder is hidden, the image fades in, and the `onLoad` prop fires.
6. On the server the `<img>` carries a blank SVG of the same size, so nothing is fetched before the image is in view. The placeholder and the loading logic are client only.

Every rendered element carries a `data-solid-image` attribute you can style. The values are `container`, `aspect-ratio`, `picture`, `image` and `blocker`. The shipped stylesheet uses the same attribute.

## Development

```bash
pnpm install
pnpm exec playwright install chromium # once, for the browser tests
pnpm build        # bundle with tsdown
pnpm test         # run every test once
pnpm test:node    # server rendering and Vite plugin only
pnpm test:browser # browser tests only
pnpm test:watch
pnpm changeset    # add a changeset before opening a pull request
```

The suite is split into two Vitest projects.

- `node` covers server rendering through `renderToString`. It also calls the Vite plugin hooks directly, with real images processed by sharp.
- `browser` runs in headless Chromium through Vitest browser mode. It covers the client path, where a real `IntersectionObserver` decides when the image loads.

## License

MIT
