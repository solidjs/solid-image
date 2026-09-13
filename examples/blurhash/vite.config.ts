import { imagePlugin } from "@solidjs/image/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

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
