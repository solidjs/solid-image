---
"@solidjs/image": minor
---

AVIF now encodes at quality 50 by default, and other formats at 80. AVIF reaches similar visual quality at a lower number, and the old shared default of 80 made AVIF files several times larger. `quality` also accepts an object to set formats one by one.

Cached files now carry a pipeline version, so a plugin update that changes encoding does not reuse old files. Previews are cached on disk like the variants, each image's file and metadata are read once per build, and cached files unused for a week are removed at startup.

GIF is now a supported input and is processed by default. Animated GIFs keep every frame when the output is WebP or GIF.

An eager image is now preloaded from the head and gets a high fetch priority. Lazy images decode asynchronously by default. Props that are set still win.

Image processing is capped at the number of CPU cores at once. Set `concurrency` to change it.
