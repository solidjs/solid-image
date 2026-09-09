---
"@solidjs/image": patch
---

Images now load. The `img` element receives the source, and the broken `source` element that was rendered without a transformer is gone.

The shipped stylesheet now matches the rendered markup. Elements are tagged with `data-solid-image` instead of `data-start-image`.

The default image quality is now 80. It was 0.8, which sharp rejects. The `quality` option is now optional.
