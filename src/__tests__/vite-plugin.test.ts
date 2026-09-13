import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getEffectiveSizes, imagePlugin } from "../vite/index";
import type { SolidImageOptions } from "../vite/index";

// Vite hooks can be a function or an object with a handler.
// These helpers call either shape with a stub plugin context.
function callResolveId(plugin: Plugin, id: string, importer?: string) {
  const hook = plugin.resolveId as any;
  const fn = typeof hook === "function" ? hook : hook.handler;
  return fn.call({} as any, id, importer, {});
}

function callLoad(plugin: Plugin, id: string, context: unknown = {}) {
  const hook = plugin.load as any;
  const fn = typeof hook === "function" ? hook : hook.handler;
  return fn.call(context as any, id, {});
}

function callConfigResolved(
  plugin: Plugin,
  command: "build" | "serve",
  cacheDir?: string,
  publicDir?: string,
) {
  const hook = plugin.configResolved as any;
  const fn = typeof hook === "function" ? hook : hook.handler;
  fn.call({} as any, { command, cacheDir, publicDir } as any);
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
      create: { width: 1200, height: 600, channels: 3, background: "#336699" },
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

    expect(code).toContain("width: 1200");
    expect(code).toContain("height: 600");
  });

  it("points the source at the largest variant of the fallback format", async () => {
    const plugin = createLocalPlugin({ output: ["webp", "jpeg"], sizes: [400, 800] });
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-source"));

    // jpeg is last in the output list, so it is the format every browser reads.
    expect(code).toContain('import source from "./photo.png?image-raw-jpeg-800"');
    expect(code).not.toContain('import source from "./photo.png"');
  });

  it("inlines a placeholder preview and the dominant color", async () => {
    const plugin = createLocalPlugin();
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-source"));

    const placeholder = JSON.parse(/placeholder: (\{.+\}),/.exec(code)![1]!);

    expect(placeholder.url.startsWith("data:image/webp;base64,")).toBe(true);

    // sharp picks the dominant color from a quantized histogram, so it lands
    // near the fill color rather than exactly on it.
    expect(placeholder.color).toMatch(/^#[0-9a-f]{6}$/);
    const channels = [1, 3, 5].map(at => parseInt(placeholder.color.slice(at, at + 2), 16));
    for (const [index, expected] of [0x33, 0x66, 0x99].entries()) {
      expect(Math.abs(channels[index]! - expected)).toBeLessThan(16);
    }

    const preview = Buffer.from(placeholder.url.split(",")[1]!, "base64");
    const meta = await sharp(preview).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(20);
    expect(preview.byteLength).toBeLessThan(1024);
  });

  it("uses the configured placeholder size", async () => {
    const plugin = createLocalPlugin({ placeholder: { size: 8 } });
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-source"));

    const placeholder = JSON.parse(/placeholder: (\{.+\}),/.exec(code)![1]!);
    const meta = await sharp(Buffer.from(placeholder.url.split(",")[1]!, "base64")).metadata();

    expect(meta.width).toBe(8);
  });

  it("skips the placeholder when it is turned off", async () => {
    const plugin = createLocalPlugin({ placeholder: false });
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-source"));

    expect(code).toContain("placeholder: undefined");
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

  it("emits the file through the bundler on build", async () => {
    const plugin = createLocalPlugin();
    callConfigResolved(plugin, "build", path.join(dir, "cache"));

    const emitFile = vi.fn((_asset: { type: string; name: string; source: Buffer }) => "abc123");
    const code: string = await callLoad(
      plugin,
      path.join(dir, "photo.png?image-raw-webp-400"),
      { emitFile },
    );

    // Going through the bundler is what makes `base`, `assetsDir` and the
    // manifest apply to these files.
    expect(code).toBe("export default import.meta.ROLLUP_FILE_URL_abc123;");
    expect(emitFile).toHaveBeenCalledTimes(1);

    const emitted = emitFile.mock.calls[0]![0];
    expect(emitted.type).toBe("asset");
    expect(emitted.name).toMatch(/^i-[0-9a-f]+-400\.webp$/);

    const meta = await sharp(emitted.source).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(400);
  });

  it("reuses the encoded file from the cache on the next build", async () => {
    const cacheDir = path.join(dir, "build-cache");
    const plugin = createLocalPlugin();
    callConfigResolved(plugin, "build", cacheDir);

    const first = vi.fn((_asset: { name: string; source: Buffer }) => "first");
    await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-400"), { emitFile: first });

    // The plugin keeps its files in a folder of its own inside the Vite cache directory.
    const cachePath = path.join(cacheDir, "solid-image", first.mock.calls[0]![0].name);
    await fs.writeFile(cachePath, "cached bytes");

    const second = vi.fn((_asset: { name: string; source: Buffer }) => "second");
    await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-400"), { emitFile: second });

    // The second build emitted the cached bytes, so nothing was encoded again.
    expect(second.mock.calls[0]![0].source.toString()).toBe("cached bytes");
  });

  it("does not write to the public directory on build", async () => {
    const buildPublicPath = path.join(dir, "build-public");
    const plugin = createLocalPlugin({ publicPath: buildPublicPath });
    callConfigResolved(plugin, "build", path.join(dir, "cache"));

    await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-400"), {
      emitFile: () => "abc123",
    });

    await expect(fs.stat(buildPublicPath)).rejects.toThrow();
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

  it("reuses the file it already emitted instead of encoding again", async () => {
    const plugin = createLocalPlugin();
    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-800"));
    const emitted = path.join(publicPath, /export default "(.+)"/.exec(code)![1]!);

    const before = await fs.stat(emitted);
    await fs.writeFile(emitted, "not an image");
    await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-800"));
    const after = await fs.readFile(emitted, "utf8");

    // The plugin left the file alone, so nothing was encoded a second time.
    expect(after).toBe("not an image");

    await fs.rm(emitted);
    await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-800"));

    expect((await fs.stat(emitted)).size).toBe(before.size);
  });

  it("gives a different file name when the quality changes", async () => {
    const first: string = await callLoad(
      createLocalPlugin({ quality: 80 }),
      path.join(dir, "photo.png?image-raw-webp-400"),
    );
    const second: string = await callLoad(
      createLocalPlugin({ quality: 20 }),
      path.join(dir, "photo.png?image-raw-webp-400"),
    );

    expect(first).not.toBe(second);
  });

  it("gives a different file name when the source image changes", async () => {
    const editedPath = path.join(dir, "edited.png");
    await sharp({ create: { width: 64, height: 32, channels: 3, background: "#336699" } })
      .png()
      .toFile(editedPath);

    const plugin = createLocalPlugin();
    const first: string = await callLoad(plugin, path.join(dir, "edited.png?image-raw-webp-400"));

    await sharp({ create: { width: 64, height: 32, channels: 3, background: "#993366" } })
      .png()
      .toFile(editedPath);

    const second: string = await callLoad(plugin, path.join(dir, "edited.png?image-raw-webp-400"));

    expect(first).not.toBe(second);
  });

  it("drops sizes wider than the source and adds the source width", async () => {
    const smallPath = path.join(dir, "small.png");
    await sharp({ create: { width: 600, height: 300, channels: 3, background: "#336699" } })
      .png()
      .toFile(smallPath);

    const plugin = createLocalPlugin({ output: ["webp"], sizes: [400, 800, 1200] });
    const code: string = await callLoad(plugin, path.join(dir, "small.png?image-transformer"));

    expect(code).toContain('"./small.png?image-webp-400"');
    expect(code).toContain('"./small.png?image-webp-600"');
    expect(code).not.toContain("image-webp-800");
    expect(code).not.toContain("image-webp-1200");
  });

  it("points the source at the source width when every size is too wide", async () => {
    const smallPath = path.join(dir, "tiny.png");
    await sharp({ create: { width: 300, height: 150, channels: 3, background: "#336699" } })
      .png()
      .toFile(smallPath);

    const plugin = createLocalPlugin({ output: ["jpeg"], sizes: [800, 1200] });
    const code: string = await callLoad(plugin, path.join(dir, "tiny.png?image-source"));

    expect(code).toContain('import source from "./tiny.png?image-raw-jpeg-300"');
  });

  it("gives the same file name to the same content at another path and time", async () => {
    const copyPath = path.join(dir, "copy.png");
    await fs.copyFile(path.join(dir, "photo.png"), copyPath);
    // A fresh checkout gives every file a new modification time.
    await fs.utimes(copyPath, new Date(2001, 0, 1), new Date(2001, 0, 1));

    const plugin = createLocalPlugin();
    const original: string = await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-400"));
    const copy: string = await callLoad(plugin, path.join(dir, "copy.png?image-raw-webp-400"));

    expect(copy).toBe(original);
  });

  it("writes to Vite's public directory when no publicPath is given", async () => {
    const publicDir = path.join(dir, "vite-public");
    const plugin = createLocalPlugin({ publicPath: undefined });
    callConfigResolved(plugin, "serve", path.join(dir, "cache"), publicDir);

    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-400"));
    const publicUrl = /export default "(.+)"/.exec(code)![1]!;

    expect((await fs.stat(path.join(publicDir, publicUrl))).isFile()).toBe(true);
  });

  it("keeps an explicit publicPath over Vite's public directory", async () => {
    const publicDir = path.join(dir, "ignored-public");
    const plugin = createLocalPlugin();
    callConfigResolved(plugin, "serve", path.join(dir, "cache"), publicDir);

    const code: string = await callLoad(plugin, path.join(dir, "photo.png?image-raw-webp-400"));
    const publicUrl = /export default "(.+)"/.exec(code)![1]!;

    expect((await fs.stat(path.join(publicPath, publicUrl))).isFile()).toBe(true);
    await expect(fs.stat(publicDir)).rejects.toThrow();
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

describe("getEffectiveSizes", () => {
  it("keeps every size that fits inside the source", () => {
    expect(getEffectiveSizes([400, 800], 1200)).toEqual([400, 800]);
  });

  it("replaces sizes wider than the source with the source width", () => {
    expect(getEffectiveSizes([400, 800, 1200], 600)).toEqual([400, 600]);
  });

  it("keeps a size equal to the source width once", () => {
    expect(getEffectiveSizes([600, 1200], 600)).toEqual([600]);
  });

  it("keeps the sizes as given when the source width is unknown", () => {
    expect(getEffectiveSizes([400, 400, 800], 0)).toEqual([400, 800]);
  });
});
