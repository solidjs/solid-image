import { imagePlugin } from "@solidjs/image/vite";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    solid(),
    imagePlugin({
      local: {
        sizes: [480, 800, 1200, 1600],
        // A 20px wide copy of each image, inlined in the page as a data URL.
        placeholder: { size: 20 },
      },
    }),
  ],
});
