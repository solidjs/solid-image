# `@solidjs/image`

Optimized image components and Vite tooling for [Solid](https://solidjs.com).

- `SolidImage` renders a responsive `<picture>` that reserves the image's aspect ratio, so the page does not shift while the image loads.
- The image only loads once it scrolls into view, using `IntersectionObserver`.
- A tiny preview of the image is inlined in the page and painted behind it, so there is something to look at from the first frame.
- Your own placeholder is rendered while the image loads, and fades out when the image is ready.
- The Vite plugin turns a local image import into a set of resized and reformatted files at build time.
- Remote images go through your own URL mapping, so a CDN can serve the variants instead.

## Install

```bash
npm i @solidjs/image
```

```bash
pnpm add @solidjs/image
```

```bash
yarn add @solidjs/image
```

The package needs `solid-js` 1.9.9 or newer and Vite 8 or newer as peer dependencies. Node 24 or newer is required for the Vite plugin, which uses [`sharp`](https://sharp.pixelplumbing.com) to process images.

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

`imagePlugin` returns an array of Vite plugins, so spread it or nest it in the `plugins` array. Both are accepted by Vite.

### 2. Add the ambient types

The plugin resolves imports that TypeScript does not know about, such as `./photo.png?image` and `image:hero`. Reference the shipped declarations once in your project:

```ts
// env.d.ts
/// <reference types="@solidjs/image/env" />
```

### 3. Import the styles

```ts
import "@solidjs/image/style.css";
```

The stylesheet positions the picture, the image and the placeholder inside the aspect ratio box. Import it once, in your app entry.

## Usage

### Local image

Import the image with the `?image` query. The import gives you the `src` and the `transformer` props.

```tsx
import { SolidImage } from "@solidjs/image";
import { type JSX, onMount, Show } from "solid-js";

import example from "../images/example.jpg?image";

function Placeholder(props: { show: () => void }): JSX.Element {
  onMount(() => {
    props.show();
  });

  return <div>Loading...</div>;
}

export default function App(): JSX.Element {
  return (
    <div style={{ width: "50vw" }}>
      <SolidImage
        {...example}
        alt="example"
        fallback={(visible, show) => (
          <Show when={visible()}>
            <Placeholder show={show} />
          </Show>
        )}
      />
    </div>
  );
}
```

### Remote image

Import `image:` followed by any string. The plugin passes that string to your `transformURL` function.

```tsx
import { SolidImage } from "@solidjs/image";

import example from "image:foobar";

export default function App() {
  return <SolidImage {...example} alt="example" fallback={() => <div>Loading...</div>} />;
}
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

`transformURL` may be async, so you can call a CDN API while the module is loaded.

### Without the plugin

The component does not depend on the plugin. Pass `src` and an optional `transformer` yourself:

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
| `src` | `SolidImageSource<T>` | yes | The image source, its intrinsic size and any options your transformer needs. |
| `alt` | `string` | yes | Alternative text for the image. |
| `fallback` | `(visible: () => boolean, onLoad: () => void) => JSX.Element` | no | Placeholder shown while the image loads. See below. |
| `transformer` | `SolidImageTransformer<T>` | no | Produces the responsive variants for `src`. |
| `sizes` | `string` | no | Value of the `sizes` attribute, such as `50vw`. |
| `onLoad` | `() => void` | no | Called once the image has loaded and the placeholder is hidden. |
| `crossOrigin` | `JSX.HTMLCrossorigin` | no | Forwarded to the `<img>`. |
| `fetchPriority` | `"high" \| "low" \| "auto"` | no | Forwarded to the `<img>`. |
| `decoding` | `"sync" \| "async" \| "auto"` | no | Forwarded to the `<img>`. |

The `fallback` callback receives two arguments.

- `visible` is a signal that is `true` while the placeholder should be shown. It turns `false` once the image has loaded.
- `onLoad` tells the component that your placeholder is on screen. Call it once your placeholder has mounted. The image is only revealed after this call, so the placeholder is never skipped by an image that loads instantly.

The `fallback` only renders on the client, and only after the container has scrolled into view. Leave it out and the image is revealed as soon as it loads.

### Picking the right variant

Width descriptors alone do not tell the browser how wide the image will be on the page, so it assumes the full viewport width and downloads a larger variant than it needs. Pass `sizes` whenever the image is not full width.

```tsx
<SolidImage {...example} alt="example" sizes="(max-width: 600px) 100vw, 50vw" fallback={...} />
```

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
- `SolidImageFile` is every file extension that maps to a format, such as `"jpg"`, `"jpeg"`, `"jfif"`, `"pjpeg"`, `"pjp"`, `"tif"` and `"tiff"`.

`width` and `height` on the source are the intrinsic pixel size. They are only used to reserve the aspect ratio box, so any pair with the right ratio works.

Variants are grouped by `type` and merged into one `srcset` per group. The browser picks the first `<source>` whose type it supports, then picks a width from the `srcset`. Order your output formats from most to least preferred.

The transformer is optional. Without one, no `<source>` is rendered and the browser loads `src.source` directly.

### `imagePlugin(options)`

```ts
import { imagePlugin } from "@solidjs/image/vite";
```

#### `options.local`

Handles imports ending in `?image`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `sizes` | `number[]` | required | Output widths in pixels. Height follows the aspect ratio. |
| `quality` | `number` | `80` | Quality passed to sharp, from 1 to 100. |
| `input` | `SolidImageFormat[]` | `["png", "jpeg", "webp"]` | Source formats the plugin will process. Other files are left alone. |
| `output` | `SolidImageFormat[]` | `["png", "jpeg", "webp"]` | Formats to emit. |
| `publicPath` | `string` | `"dist"` | Directory the processed files are written to. |
| `placeholder` | `boolean \| { size?: number }` | `true` | Inline preview of the image. Set a `size` in pixels, or `false` to skip it. |

One file is emitted per output format and per size, so `output: ["webp", "jpeg"]` with `sizes: [480, 800]` gives four files per image.

Files are written to `<publicPath>/.image/i-<hash>-<width>.<ext>`. The module exports the public URL `/.image/i-<hash>-<width>.<ext>`, so `publicPath` should be a directory that is served at the root of your site. Add `.image` to `.gitignore` if it lives inside a checked in directory such as `public`.

The hash covers the source path, the size and modification time of the source file, the format, the width and the quality. A file that already exists is left alone, so images are encoded once and reused on later builds and dev server restarts. Editing an image or changing an option produces a new name, so a stale file is never served.

#### `options.remote`

Handles imports starting with `image:`.

| Option | Type | Description |
| --- | --- | --- |
| `transformURL` | `(url: string) => MaybePromise<{ src, variants }>` | Maps the text after `image:` to a source and its variants. |

`src` is `{ source, width, height }`, and may carry a `placeholder` of `{ url, color }`. `variants` is one `SolidImageVariant` or an array of them.

Both option groups are optional. Passing neither returns no plugin.

## How it works

1. `SolidImage` renders a container with a padding based aspect ratio box, so the layout is stable before the image arrives.
2. The box is painted with the inline preview and the dominant color of the image, when the source carries a placeholder. The preview is a few pixels wide, so the browser scales it up into a blur.
3. An `IntersectionObserver` watches the container. Nothing loads until it enters the viewport.
4. Once visible, the `<img>` and your placeholder are rendered. The image starts fully transparent.
5. Your placeholder calls `onLoad` to say it is on screen. When the image finishes loading after that, the placeholder is hidden, the image fades in over the preview, and the `onLoad` prop is called.
6. On the server, the `<img>` renders with a blank SVG of the same size, so the browser does not fetch the image before it is in view. The placeholder and the loading logic are client only.

The rendered elements carry a `data-solid-image` attribute you can style. The values are `container`, `aspect-ratio`, `picture`, `image` and `blocker`. The shipped stylesheet uses the same attribute.

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

- `node` covers server rendering through `renderToString`, and calls the Vite plugin hooks directly with real images processed by sharp.
- `browser` runs in headless Chromium through Vitest browser mode. It covers the client path, where a real `IntersectionObserver` decides when the image loads and the browser really loads it.

## License

MIT
