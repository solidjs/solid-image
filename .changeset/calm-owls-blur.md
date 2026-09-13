---
"@solidjs/image": minor
---

Add an opt-in BlurHash preview. Set `placeholder: { type: "blurhash" }` in the plugin and install `blurhash`, which is an optional peer dependency. The number of components is picked per image from its aspect ratio, so there is nothing else to configure.

The server paints the average color of the image, and the browser decodes the hash into a blur. Remote images can return `{ hash, color }` from `transformURL` and get the same preview.
