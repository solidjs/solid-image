---
"@solidjs/image": minor
---

The `img` now carries a `srcset` of the last output format, so a browser that supports none of the `source` formats still picks a sized variant. It used to fall back to the full size original.

The original image is no longer imported. `src.source` points at the largest variant of the fallback format, so the untouched original never reaches the bundle.

Processed images go through the bundler on build, so `base`, `assetsDir` and the build manifest now apply to them. The dev server still writes them to the public directory.

`SolidImage` takes an `eager` prop for the image above the fold. It loads right away instead of waiting for the observer, and the server renders it in full so the browser finds it while parsing the page.

Readers with no JavaScript now get the image. The server renders a `noscript` copy alongside the lazy one.
