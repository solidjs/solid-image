---
"@solidjs/image": patch
---

- The dev server encodes a variant when the browser first requests it, instead of encoding every format and size before the page can load.
- Each variant and preview is encoded once when the client and server environments ask for it at the same time. Cache files are written atomically, so a parallel build never reads a partial file.
- Previews of large photos are computed several times faster. The dominant color is read from a 400px copy, so it can differ by one step from the color computed by earlier versions.
- Lazy images share one `IntersectionObserver` per `rootMargin`, so pages with many images scroll with less work per frame.
