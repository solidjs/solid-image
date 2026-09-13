---
"@solidjs/image": minor
---

`onError` is called when the image fails to load, and `errorFallback` renders in its place. The loading placeholder used to stay on screen forever.

A placeholder can now call `onLoad` after the image has loaded. The image used to stay hidden in that case.

Lazy images start loading once they are within 500px of the viewport. Change the distance with the `rootMargin` prop.

The image is decoded before it fades in, and the fade is skipped for readers who ask for reduced motion.

Import `./photo.jpg?image-url` to get the URL of one file. Add `width` and `format` to pick the file, as in `./photo.jpg?width=400&format=webp&image-url`.
