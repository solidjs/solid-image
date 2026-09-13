---
"@solidjs/image": minor
---

Images are no longer enlarged. Sizes wider than the source are dropped and the source width is used instead, so `srcset` only lists real widths.

Photos are turned upright using their EXIF orientation, and their reported width and height match how they display.

Animated images keep every frame when the output is WebP. Other formats keep the first frame instead of stacking every frame into one image.

JPEG files are smaller at the same quality, and WebP and PNG are compressed harder. The extra encoding time is only paid once, since results are cached.

The build cache now keys on file content instead of modification time, so it still hits after a fresh checkout in CI.

`publicPath` now defaults to Vite's public directory, so processed images are reachable on the dev server without setting it.

Every `img` now carries its intrinsic `width` and `height`, and the `noscript` copy uses `loading="lazy"`.
