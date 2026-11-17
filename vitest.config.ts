import { playwright } from "@vitest/browser-playwright";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Server rendering and the Vite plugin, which both run in Node. The
        // node environment gives this project Solid's server build.
        plugins: [solid()],
        test: {
          name: "node",
          globals: true,
          environment: "node",
          include: ["src/__tests__/*.test.{ts,tsx}"],
        },
      },
      {
        // Client rendering, which needs a real IntersectionObserver and a
        // browser that loads images.
        plugins: [solid()],
        test: {
          name: "browser",
          globals: true,
          include: ["src/__tests__/browser/*.test.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
