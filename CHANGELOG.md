# @solidjs/image

## 0.2.0

### Minor Changes

- 3b00d0b: The default output is now WebP and JPEG. The old default listed PNG first, so every browser downloaded PNG, the largest format for photos.

  Formats are now offered smallest first, whatever order `output` lists them in. The `img` falls back to JPEG or PNG, which every browser reads.

  A transparent image gets PNG in place of JPEG, so its transparent pixels are no longer painted black. An opaque image drops PNG when JPEG is also listed.

- f6bdade: Add an opt-in BlurHash preview. Set `placeholder: { type: "blurhash" }` in the plugin and install `blurhash`, which is an optional peer dependency. The number of components is picked per image from its aspect ratio, so there is nothing else to configure.

  The server paints the average color of the image, and the browser decodes the hash into a blur. Remote images can return `{ hash, color }` from `transformURL` and get the same preview.

- 6165dc7: The `img` now carries a `srcset` of the last output format, so a browser that supports none of the `source` formats still picks a sized variant. It used to fall back to the full size original.

  The original image is no longer imported. `src.source` points at the largest variant of the fallback format, so the untouched original never reaches the bundle.

  Processed images go through the bundler on build, so `base`, `assetsDir` and the build manifest now apply to them. The dev server still writes them to the public directory.

  Encoded images are now cached between builds in the Vite cache directory, so a build only encodes images that changed.

  `sizes` now reaches the `img` as well as every `source`, since the `img` carries its own `srcset`.

  `SolidImage` takes an `eager` prop for the image above the fold. It loads right away instead of waiting for the observer, and the server renders it in full so the browser finds it while parsing the page.

  Readers with no JavaScript now get the image. The server renders a `noscript` copy alongside the lazy one.

- 52c7b8c: Local images now ship an inline preview. The plugin emits a downscaled copy as a data URL plus the dominant color, and the component paints it behind the image until it loads. Turn it off with `placeholder: false`.

  `SolidImage` takes a `sizes` prop, which is forwarded to every `source`. Without it the browser assumes the image spans the full viewport width and downloads a larger variant than it needs.

  The `fallback` prop is now optional. Leave it out and the image is revealed as soon as it loads.

  Processed images are cached. The file name now covers the source file, the format, the width and the quality, and an existing file is reused instead of encoded again. Changing the quality no longer serves a stale image.

- 196c88c: Images are no longer enlarged. Sizes wider than the source are dropped and the source width is used instead, so `srcset` only lists real widths.

  Photos are turned upright using their EXIF orientation, and their reported width and height match how they display.

  Animated images keep every frame when the output is WebP. Other formats keep the first frame instead of stacking every frame into one image.

  JPEG files are smaller at the same quality, and WebP and PNG are compressed harder. The extra encoding time is only paid once, since results are cached.

  The build cache now keys on file content instead of modification time, so it still hits after a fresh checkout in CI.

  `publicPath` now defaults to Vite's public directory, so processed images are reachable on the dev server without setting it.

  Every `img` now carries its intrinsic `width` and `height`, and the `noscript` copy uses `loading="lazy"`.

### Patch Changes

- 1d68da6: Images now load. The `img` element receives the source, and the broken `source` element that was rendered without a transformer is gone.

  The shipped stylesheet now matches the rendered markup. Elements are tagged with `data-solid-image` instead of `data-start-image`.

  The default image quality is now 80. It was 0.8, which sharp rejects. The `quality` option is now optional.

## 0.1.0

### Minor Changes

- ff2caaf: Release the initial version of `@solidjs/image`.
