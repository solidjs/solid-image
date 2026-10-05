---
"@solidjs/image": minor
---

Add an opt-in ThumbHash preview. Set `placeholder: { type: "thumbhash" }` in the Vite plugin and install `thumbhash`, which is an optional peer dependency.

ThumbHash previews keep their binary hash as a `Uint8Array`, preserve alpha in the server-side average color, and work for both local and remote images.
