import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { imagePlugin } from "../vite/index";
import type { SolidImageOptions } from "../vite/index";

// Vite hooks can be a function or an object with a handler.
// These helpers call either shape with a stub plugin context.
function callResolveId(plugin: Plugin, id: string, importer?: string) {
  const hook = plugin.resolveId as any;
  const fn = typeof hook === "function" ? hook : hook.handler;
  return fn.call({} as any, id, importer, {});
}

function callLoad(plugin: Plugin, id: string) {
  const hook = plugin.load as any;
  const fn = typeof hook === "function" ? hook : hook.handler;
  return fn.call({} as any, id, {});
}

function getPlugin(plugins: Plugin[], name: string): Plugin {
  const found = plugins.find(plugin => plugin.name === name);
  if (!found) {
    throw new Error(`Missing plugin: ${name}`);
  }
  return found;
}

describe("imagePlugin", () => {
  it("returns no plugin when no option is given", () => {
    expect(imagePlugin({})).toHaveLength(0);
  });

  it("returns only the remote plugin when only remote is given", () => {
    const plugins = imagePlugin({
      remote: {
        transformURL: () => ({
          src: { source: "/a.jpg", width: 1, height: 1 },
          variants: [],
        }),
      },
    });

    expect(plugins.map(plugin => plugin.name)).toEqual(["solid-start:image/remote"]);
  });

  it("returns only the local plugin when only local is given", () => {
    const plugins = imagePlugin({ local: { sizes: [400], quality: 80 } });

    expect(plugins.map(plugin => plugin.name)).toEqual(["solid-start:image/local"]);
  });

  it("returns both plugins and runs them before other plugins", () => {
    const plugins = imagePlugin({
      local: { sizes: [400], quality: 80 },
      remote: {
        transformURL: () => ({
          src: { source: "/a.jpg", width: 1, height: 1 },
          variants: [],
        }),
      },
    });

    expect(plugins).toHaveLength(2);
    for (const plugin of plugins) {
      expect(plugin.enforce).toBe("pre");
    }
  });
});

describe("remote images", () => {
  const options: SolidImageOptions = {
    remote: {
      transformURL(url) {
        return {
          src: { source: `https://cdn.test/${url}/1200.webp`, width: 1200, height: 900 },
          variants: [
            { path: `https://cdn.test/${url}/800.jpg`, width: 800, type: "image/jpeg" },
            { path: `https://cdn.test/${url}/400.jpg`, width: 400, type: "image/jpeg" },
          ],
        };
      },
    },
  };

  const plugin = getPlugin(imagePlugin(options), "solid-start:image/remote");

  it("resolves an image: id to itself", () => {
    expect(callResolveId(plugin, "image:hero")).toBe("image:hero");
  });

  it("ignores ids that are not image: ids", () => {
    expect(callResolveId(plugin, "./photo.png")).toBe(null);
  });

  it("loads a module that exports the source and a transformer", async () => {
    const code: string = await callLoad(plugin, "image:hero");

    expect(code).toContain('"source":"https://cdn.test/hero/1200.webp"');
    expect(code).toContain('"width":1200');
    expect(code).toContain('"height":900');
    expect(code).toContain("transform()");
  });

  it("passes the part after image: to transformURL", async () => {
    const code: string = await callLoad(plugin, "image:some/nested/name");

    expect(code).toContain("https://cdn.test/some/nested/name/1200.webp");
  });

  it("awaits an async transformURL", async () => {
    const asyncPlugin = getPlugin(
      imagePlugin({
        remote: {
          async transformURL(url) {
            return {
              src: { source: `/${url}.jpg`, width: 10, height: 10 },
              variants: { path: `/${url}-10.jpg`, width: 10, type: "image/jpeg" },
            };
          },
        },
      }),
      "solid-start:image/remote",
    );

    const code: string = await callLoad(asyncPlugin, "image:async");

    expect(code).toContain('"path":"/async-10.jpg"');
  });

  it("ignores ids that are not image: ids on load", async () => {
    expect(await callLoad(plugin, "./photo.png")).toBe(null);
  });
});

describe("local images", () => {
  let dir: string;
  let publicPath: string;
  let imagePath: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "solid-image-vite-"));
    publicPath = path.join(dir, "public");
    imagePath = path.join(dir, "photo.png");

    await sharp({
      create: { width: 64, height: 32, channels: 3, background: "#336699" },
    })
      .png()
      .toFile(imagePath);
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function createLocalPlugin(local?: Partial<SolidImageOptions["local"]>): Plugin {
    return getPlugin(
      imagePlugin({
        local: {
          sizes: [400, 800],
          input: ["png"],
          output: ["webp", "jpeg"],
          quality: 80,
          publicPath,
          ...local,
        } as SolidImageOptions["local"],
      }),
      "solid-start:image/local",
    );
  }

  it("resolves a ?image id next to the importer", () => {
    const plugin = createLocalPlugin();
    const resolved = callResolveId(plugin, "./photo.png?image", path.join(dir, "app.tsx"));

    expect(resolved).toBe(path.join(dir, "photo.png?image"));
  });

  it("ignores an id without an image query", () => {
    const plugin = createLocalPlugin();

    expect(callResolveId(plugin, "./photo.png", path.join(dir, "app.tsx"))).toBe(null);
  });

  it("ignores an id with no importer", () => {
    const plugin = createLocalPlugin();

    expect(callResolveId(plugin, "./photo.png?image", undefined)).toBe(null);
  });

  it("loads an entry point that exports src and transformer", async () => {
    const plugin = createLocalPlugin();
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image"));

    expect(code).toContain('"./photo.png?image-source"');
    expect(code).toContain('"./photo.png?image-transformer"');
    expect(code).toContain("export default { src, transformer };");
  });

  it("loads the source module with the real image size", async () => {
    const plugin = createLocalPlugin();
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-source"));

    expect(code).toContain("width: 64");
    expect(code).toContain("height: 32");
    expect(code).toContain('import source from "./photo.png"');
  });

  it("loads a transformer that imports one variant per format and size", async () => {
    const plugin = createLocalPlugin();
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-transformer"));

    expect(code).toContain('import variant_webp_400 from "./photo.png?image-webp-400"');
    expect(code).toContain('import variant_webp_800 from "./photo.png?image-webp-800"');
    expect(code).toContain('import variant_jpeg_400 from "./photo.png?image-jpeg-400"');
    expect(code).toContain('import variant_jpeg_800 from "./photo.png?image-jpeg-800"');
    expect(code).toContain("export default { transform() { return variants; }};");
  });

  it("loads a variant module with its width and MIME type", async () => {
    const plugin = createLocalPlugin();
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-webp-400"));

    expect(code).toContain("width: 400");
    expect(code).toContain("type: 'image/webp'");
    expect(code).toContain('import source from "./photo.png?image-raw-webp-400"');
  });

  it("emits the resized file and exports its public path", async () => {
    const plugin = createLocalPlugin();
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-400"));

    const match = /export default "(.+)"/.exec(code);
    expect(match).not.toBe(null);

    const publicUrl = match![1]!;
    expect(publicUrl.startsWith("/.image/")).toBe(true);
    expect(publicUrl.endsWith(".webp")).toBe(true);

    const emitted = path.join(publicPath, publicUrl);
    expect(await fs.stat(emitted).then(stat => stat.isFile())).toBe(true);

    const meta = await sharp(emitted).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(400);
  });

  it("uses the jpg extension for jpeg output", async () => {
    const plugin = createLocalPlugin();
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-raw-jpeg-800"));

    expect(code).toContain(".jpg");
  });

  it("gives the same file name for the same image and size", async () => {
    const plugin = createLocalPlugin();
    const first: string = await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-400"));
    const second: string = await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-400"));

    expect(first).toBe(second);
  });

  it("ignores a file extension that is not in the input list", async () => {
    const plugin = createLocalPlugin({ input: ["jpeg"] });

    expect(await callLoad(plugin, path.join(dir, "photo.png?image"))).toBe(null);
  });

  it("ignores a file with no image query", async () => {
    const plugin = createLocalPlugin();

    expect(await callLoad(plugin, path.join(dir, "photo.png"))).toBe(null);
  });

  it("ignores virtual module ids", async () => {
    const plugin = createLocalPlugin();

    expect(await callLoad(plugin, "\0virtual:photo.png?image")).toBe(null);
  });

  it("accepts every extension of an input format", () => {
    const plugin = createLocalPlugin({ input: ["jpeg"] });

    expect(callResolveId(plugin, "./photo.jpg?image", path.join(dir, "app.tsx"))).toBe(
      path.join(dir, "photo.jpg?image"),
    );
  });

  it("emits a file with the default quality when none is given", async () => {
    const plugin = createLocalPlugin({ quality: undefined });
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-raw-jpeg-400"));

    const publicUrl = /export default "(.+)"/.exec(code)![1]!;
    const meta = await sharp(path.join(publicPath, publicUrl)).metadata();

    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(400);
  });

  it("defaults to png, jpeg and webp output when no format is given", async () => {
    const plugin = createLocalPlugin({ input: undefined, output: undefined });
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-transformer"));

    expect(code).toContain("variant_png_400");
    expect(code).toContain("variant_jpeg_400");
    expect(code).toContain("variant_webp_400");
  });
});
