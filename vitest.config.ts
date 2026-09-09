import { playwright } from "@vitest/browser-playwright";
import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

// vite-plugin-solid automatically injects @testing-library/jest-dom into
// setupFiles when it detects the module in pnpm's store. Because the image
// package does not depend on jest-dom, the import fails at runtime.
// Strip the injected entry so vitest never tries to load it.
const stripJestDomSetup: Plugin = {
  name: "strip-jest-dom-setup",
  config(config) {
    const files = config.test?.setupFiles;
    if (Array.isArray(files)) {
      config.test!.setupFiles = files.filter(
        f => typeof f !== "string" || !f.includes("jest-dom"),
      );
    }
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        // Server rendering and the Vite plugin, which both run in Node.
        plugins: [solid({ ssr: true }), stripJestDomSetup],
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
        plugins: [solid(), stripJestDomSetup],
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
