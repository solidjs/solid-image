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
| `eager` | `boolean` | no | Loads the image right away, preloads it from the head and gives it a high fetch priority. |
| `sizes` | `string` | no | Value of the `sizes` attribute, such as `50vw`. |
| `rootMargin` | `string` | no | How far outside the viewport a lazy image starts loading, as a CSS margin. Defaults to `500px`. |
| `onLoad` | `() => void` | no | Called once the image has loaded and the placeholder is hidden. |
| `onError` | `() => void` | no | Called when the image fails to load. |
| `errorFallback` | `() => JSX.Element` | no | Shown when the image fails to load. |
| `crossOrigin` | `JSX.HTMLCrossorigin` | no | Forwarded to the `<img>`. |
| `fetchPriority` | `"high" \| "low" \| "auto"` | no | Forwarded to the `<img>`. Defaults to `high` for an eager image. |
| `decoding` | `"sync" \| "async" \| "auto"` | no | Forwarded to the `<img>`. Defaults to `async` for a lazy image. |

The `fallback` callback takes two arguments.

- `visible` is a signal. It is `true` while the placeholder should be shown, and `false` once the image has loaded.
- `onLoad` tells the component your placeholder is on screen. Call it once the placeholder has mounted. It can come before or after the image loads. The image is only revealed once both have happened, so an image that loads instantly never skips the placeholder.

The `fallback` renders on the client only, and only after the container scrolls into view. Leave it out and the image is revealed as soon as it loads.

### When the image fails

Pass `onError` to hear about it, and `errorFallback` to show something in its place.

```tsx
<SolidImage {...example} alt="example" errorFallback={() => <p>Could not load the image.</p>} fallback={...} />
```

- The loading placeholder is removed, and the broken image stays hidden.
- The preview stays behind the error fallback.
- `errorFallback` renders on the client only.

### Loading ahead of the scroll

A lazy image starts loading once it is within 500px of the viewport, so it is often ready by the time it scrolls in. Change the distance with `rootMargin`, which takes a CSS margin such as `1000px` or `50%`.

```tsx
<SolidImage {...example} alt="example" rootMargin="1000px" fallback={...} />
```

The margin is read once, when the component is created.

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

An eager image is also preloaded with a `<link rel="preload">` in the head, so the browser starts fetching it before it reaches the image. The link names the preferred format, and a browser that cannot read that format skips it. Solid adds the link when the server renders a page with a `<head>`.

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

Handles imports ending in `?image`, and single file imports ending in `image-url`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `sizes` | `number[]` | required | Output widths in pixels. Height follows the aspect ratio. |
| `quality` | `number \| { [format]: number }` | 50 for AVIF, 80 for the rest | Quality passed to sharp, from 1 to 100. A number applies to every format. PNG and GIF ignore it. |
| `input` | `SolidImageFormat[]` | `["png", "jpeg", "webp", "gif"]` | Source formats to process. Other files are left alone. |
| `output` | `SolidImageFormat[]` | `["webp", "jpeg"]` | Formats to emit. They are offered smallest first, whatever the order here. |
| `publicPath` | `string` | Vite's `publicDir` | Directory the dev server writes processed files to. |
| `placeholder` | `boolean \| { size?: number } \| { type: "blurhash" }` | `true` | Preview shown while the image loads. See [BlurHash preview](#blurhash-preview). |
| `concurrency` | `number` | CPU cores | Most images processed at the same time. |

- One file is emitted per output format and per size. `output: ["webp", "jpeg"]` with `sizes: [480, 800]` gives four files per image.
- Formats are offered in this order: AVIF, WebP, TIFF, JPEG, PNG. The browser takes the first one it reads, and the `<img>` falls back to the last.
- A transparent image gets PNG in place of JPEG, since JPEG would paint the transparent pixels black.
- An opaque image drops PNG when JPEG is also listed, since JPEG is far smaller for photos. List PNG without JPEG to keep it.
- Sizes wider than the source are dropped and replaced by the source width. An image is never enlarged.
- Photos are turned upright using their EXIF orientation.
- Animated images keep every frame in WebP and GIF. Other formats keep the first frame. Animated GIFs are processed by default, and usually come out much smaller as WebP.
- JPEG uses mozjpeg and WebP uses its highest effort. PNG is lossless, so `quality` does not apply to it.
- On build the files go through the bundler as assets, so `base`, `assetsDir` and the build manifest apply to them. Nothing is written to `publicPath`.
- On the dev server the files are written to `<publicPath>/.image/i-<hash>-<width>.<ext>` and served from `/.image/...`.
- `publicPath` defaults to Vite's public directory, which the dev server serves at the root of the site. Add `.image` to `.gitignore`.
- The `<img>` falls back to the largest size of the last output format. The original file is never imported, so it does not reach the bundle.
- The hash covers the content of the source file, the format, the width and the quality. It leaves out the path and the modification time, so a fresh checkout in CI still hits the cache.
- An image is encoded once and reused. The dev server reuses the file in `publicPath`. A build reuses its copy in the Vite cache directory.
- Previews are cached the same way, so a build or a dev server restart does not compute them again.
- The cache key also carries a pipeline version. A plugin update that changes how images are encoded writes new files instead of reusing old ones.
- Cached files unused for a week are removed when the dev server or a build starts.
- Every variant of an image shares one read of the file and its metadata within a build.
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
- The number of components is picked per image from its aspect ratio, about 12 in total. The long side gets more, so portraits and landscapes keep even detail.
- The server paints the average color of the image. The browser decodes the hash into a 32px wide canvas and paints it over that color.
- Only apps that turn it on import `blurhash`. The component itself never does.

#### Single file URL

Some places take one file instead of a responsive image, such as an `og:image` tag, a CSS background or a canvas. Import the image with `?image-url` to get the URL of one file.

```ts
import url from "./photo.jpg?image-url";
import thumbnail from "./photo.jpg?width=400&format=webp&image-url";
```

- `width` defaults to the largest of `sizes`. The file is never wider than the source.
- `format` defaults to the format the `<img>` falls back to.
- The file goes through the same pipeline and cache as the other variants.
- Put `image-url` last, so the shipped types match the import.

#### `options.remote`

Handles imports starting with `image:`.

| Option | Type | Description |
| --- | --- | --- |
| `transformURL` | `(url: string) => MaybePromise<{ src, variants }>` | Maps the text after `image:` to a source and its variants. |

`src` is `{ source, width, height }`, and may carry a `placeholder`. Return `{ url, color }` for an image preview, or `{ hash, color }` for a BlurHash. The plugin adds the decoder for a hash. `variants` is one `SolidImageVariant` or an array of them.

## How it works

1. `SolidImage` renders a padding based aspect ratio box, so the layout is stable before the image arrives.
2. The box is painted with the preview and its color, when the source carries a placeholder. An image preview is a few pixels wide, so the browser scales it up into a blur. A BlurHash is decoded in the browser, and the server paints its average color until then.
3. An `IntersectionObserver` watches the container. Nothing loads until it comes within `rootMargin` of the viewport.
4. Once near, the `<img>` and your placeholder render. The image starts transparent.
5. Your placeholder calls `onLoad` to say it is on screen.
6. The image loads, and is decoded before it is shown, so a large image does not stall the fade.
7. Once both steps are done, in either order, the placeholder is hidden, the image fades in over the preview, and the `onLoad` prop fires. The fade is skipped for readers who ask for reduced motion.
8. If the image fails, the placeholder is removed, `onError` fires, and `errorFallback` renders over the preview.
9. On the server a lazy `<img>` carries a blank SVG of the same size, so nothing is fetched before the image is in view. An eager `<img>` renders in full. The placeholder and the loading logic are client only.
10. The server also renders a `<noscript>` copy of the image, so a reader with no JavaScript sees it. Browsers never load the content of a `<noscript>` element, so it costs nothing otherwise.

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

The [examples](./examples) folder has demo apps for the image and BlurHash previews.

The suite is split into two Vitest projects.

- `node` covers server rendering through `renderToString`. It also calls the Vite plugin hooks directly, with real images processed by sharp.
- `browser` runs in headless Chromium through Vitest browser mode. It covers the client path, where a real `IntersectionObserver` decides when the image loads.

## License

MIT
