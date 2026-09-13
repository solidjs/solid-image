# `@solidjs/image`

Optimized image components and Vite tooling for [Solid](https://solidjs.com).

- `SolidImage` renders a responsive `<picture>` that reserves the aspect ratio, so the page does not shift while the image loads.
- The image loads once it scrolls into view. Mark the image above the fold as `eager` and it loads right away.
- A tiny preview of the image is inlined in the page and painted behind it, so there is something to look at from the first frame.
- Readers with no JavaScript still get the image.
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
- [`blurhash`](https://github.com/woltapp/blurhash) 2 or newer, only for the BlurHash preview. It is an optional peer dependency.

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
        placeholder: { size: 20 },
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
| `fallback` | `(visible: () => boolean, onLoad: () => void) => JSX.Element` | no | Placeholder shown while the image loads. |
| `transformer` | `SolidImageTransformer<T>` | no | Produces the responsive variants for `src`. |
| `eager` | `boolean` | no | Loads the image right away instead of waiting for it to scroll into view. |
| `sizes` | `string` | no | Value of the `sizes` attribute, such as `50vw`. |
| `onLoad` | `() => void` | no | Called once the image has loaded and the placeholder is hidden. |
| `crossOrigin` | `JSX.HTMLCrossorigin` | no | Forwarded to the `<img>`. |
| `fetchPriority` | `"high" \| "low" \| "auto"` | no | Forwarded to the `<img>`. |
| `decoding` | `"sync" \| "async" \| "auto"` | no | Forwarded to the `<img>`. |

The `fallback` callback takes two arguments.

- `visible` is a signal. It is `true` while the placeholder should be shown, and `false` once the image has loaded.
- `onLoad` tells the component your placeholder is on screen. Call it once the placeholder has mounted. The image is only revealed after that call, so an image that loads instantly never skips the placeholder.

The `fallback` renders on the client only, and only after the container scrolls into view. Leave it out and the image is revealed as soon as it loads.

### Picking the right variant

Width descriptors do not tell the browser how wide the image will be on the page. It assumes the full viewport width and downloads a larger variant than it needs. Pass `sizes` whenever the image is not full width.

```tsx
<SolidImage {...example} alt="example" sizes="(max-width: 600px) 100vw, 50vw" fallback={...} />
```

### Above the fold

Lazy loading costs time for the first image on the page, because nothing starts until the observer reports. Mark that one image as `eager`.

```tsx
<SolidImage {...example} alt="example" eager fetchPriority="high" fallback={...} />
```

The server then renders the real image instead of a blank placeholder, so the browser finds it while it parses the page. Leave every other image lazy.

### Types

```ts
interface SolidImageSource<T> {
  source: string;
  width: number;
  height: number;
  options: T;
}

interface SolidImagePlaceholder {
  url: string;
  color: string;
}

interface SolidImageBlurhashPlaceholder {
  hash: string;
  color: string;
  decode: (hash: string, width: number, height: number) => Uint8ClampedArray;
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
- The `<img>` carries the last group as its own `srcset`, for a browser that supports none of the formats above it. Make that group the most widely supported format.
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
| `publicPath` | `string` | Vite's `publicDir` | Directory the dev server writes processed files to. |
| `placeholder` | `boolean \| { size?: number } \| { type: "blurhash" }` | `true` | Preview shown while the image loads. See [BlurHash preview](#blurhash-preview). |

- One file is emitted per output format and per size. `output: ["webp", "jpeg"]` with `sizes: [480, 800]` gives four files per image.
- Sizes wider than the source are dropped and replaced by the source width. An image is never enlarged.
- Photos are turned upright using their EXIF orientation.
- Animated images keep every frame in WebP. Other formats keep the first frame.
- JPEG uses mozjpeg and WebP uses its highest effort. PNG is lossless, so `quality` does not apply to it.
- On build the files go through the bundler as assets, so `base`, `assetsDir` and the build manifest apply to them. Nothing is written to `publicPath`.
- On the dev server the files are written to `<publicPath>/.image/i-<hash>-<width>.<ext>` and served from `/.image/...`.
- `publicPath` defaults to Vite's public directory, which the dev server serves at the root of the site. Add `.image` to `.gitignore`.
- The `<img>` falls back to the largest size of the last output format. The original file is never imported, so it does not reach the bundle.
- The hash covers the content of the source file, the format, the width and the quality. It leaves out the path and the modification time, so a fresh checkout in CI still hits the cache.
- An image is encoded once and reused. The dev server reuses the file in `publicPath`. A build reuses its copy in the Vite cache directory.
- Editing an image or changing an option produces a new name, so a stale file is never served.

#### BlurHash preview

The default preview is a 20px image inlined as a data URL. A [BlurHash](https://blurha.sh) is a string of about 30 characters that the browser decodes into a blur. Turn it on in the plugin:

```bash
npm i blurhash
```

```ts
imagePlugin({
  local: {
    sizes: [480, 800, 1200],
    placeholder: { type: "blurhash" },
  },
});
```

- `blurhash` is an optional peer dependency. Install it yourself. The plugin fails at startup with install steps when it is missing.
- `componentX` and `componentY` set how much detail the hash keeps. Each goes from 1 to 9, and the defaults are 4 and 3.
- The server paints the average color of the image. The browser decodes the hash into a 32px wide canvas and paints it over that color.
- Only apps that turn it on import `blurhash`. The component itself never does.

#### `options.remote`

Handles imports starting with `image:`.

| Option | Type | Description |
| --- | --- | --- |
| `transformURL` | `(url: string) => MaybePromise<{ src, variants }>` | Maps the text after `image:` to a source and its variants. |

`src` is `{ source, width, height }`, and may carry a `placeholder`. Return `{ url, color }` for an image preview, or `{ hash, color }` for a BlurHash. The plugin adds the decoder for a hash. `variants` is one `SolidImageVariant` or an array of them.

## How it works

1. `SolidImage` renders a padding based aspect ratio box, so the layout is stable before the image arrives.
2. The box is painted with the preview and its color, when the source carries a placeholder. An image preview is a few pixels wide, so the browser scales it up into a blur. A BlurHash is decoded in the browser, and the server paints its average color until then.
3. An `IntersectionObserver` watches the container. Nothing loads until it enters the viewport.
4. Once visible, the `<img>` and your placeholder render. The image starts transparent.
5. Your placeholder calls `onLoad` to say it is on screen.
6. When the image finishes loading after that call, the placeholder is hidden, the image fades in over the preview, and the `onLoad` prop fires.
7. On the server a lazy `<img>` carries a blank SVG of the same size, so nothing is fetched before the image is in view. An eager `<img>` renders in full. The placeholder and the loading logic are client only.
8. The server also renders a `<noscript>` copy of the image, so a reader with no JavaScript sees it. Browsers never load the content of a `<noscript>` element, so it costs nothing otherwise.

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
