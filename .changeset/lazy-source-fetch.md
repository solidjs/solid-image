---
"@solidjs/image": patch
---

A lazy `SolidImage` no longer renders its `<source>` tags until it is eager or near the viewport, so the browser no longer downloads an offscreen variant before the image scrolls into view.
