import { imagePlugin } from "@solidjs/image/vite";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    solid(),
    imagePlugin({
      local: {
        sizes: [480, 800, 1200, 1600],
        // A short hash per image that the browser decodes into a blur.
        // It needs the `blurhash` package installed.
        placeholder: { type: "blurhash" },
      },
    }),
  ],
});
