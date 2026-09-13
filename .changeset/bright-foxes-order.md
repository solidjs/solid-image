---
"@solidjs/image": minor
---

The default output is now WebP and JPEG. The old default listed PNG first, so every browser downloaded PNG, the largest format for photos.

Formats are now offered smallest first, whatever order `output` lists them in. The `img` falls back to JPEG or PNG, which every browser reads.

A transparent image gets PNG in place of JPEG, so its transparent pixels are no longer painted black. An opaque image drops PNG when JPEG is also listed.
