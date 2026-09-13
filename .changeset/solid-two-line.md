---
"@solidjs/image": major
---

Support Solid 2.0. This release line needs `solid-js` and `@solidjs/web` 2.0 or newer, and apps compile it with `@solidjs/vite-plugin`. Solid 1.x stays on the 0.x line of this package.

The eager image preload now goes through Solid's `useHead`, so it reaches the page head on the server and in the browser.
