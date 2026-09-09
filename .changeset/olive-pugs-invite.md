---
"@solidjs/image": minor
---

Local images now ship an inline preview. The plugin emits a downscaled copy as a data URL plus the dominant color, and the component paints it behind the image until it loads. Turn it off with `placeholder: false`.

`SolidImage` takes a `sizes` prop, which is forwarded to every `source`. Without it the browser assumes the image spans the full viewport width and downloads a larger variant than it needs.

The `fallback` prop is now optional. Leave it out and the image is revealed as soon as it loads.

Processed images are cached. The file name now covers the source file, the format, the width and the quality, and an existing file is reused instead of encoded again. Changing the quality no longer serves a stale image.
