import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { rgbaToThumbHash, thumbHashToAverageRGBA } from "thumbhash";
import type { Plugin } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getThumbhashData } from "../vite/transformers";
import { imagePlugin } from "../vite/index";

let dir: string;
let imagePath: string;
let transparentPath: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "solid-image-thumbhash-"));
  imagePath = path.join(dir, "photo.png");
  transparentPath = path.join(dir, "transparent.png");

  await sharp({ create: { width: 800, height: 400, channels: 3, background: "#112233" } })
    .png()
    .toFile(imagePath);
  await sharp({
    create: {
      width: 80,
      height: 40,
      channels: 4,
      background: { r: 51, g: 102, b: 153, alpha: 0.5 },
    },
  })
    .png()
    .toFile(transparentPath);
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function callLoad(plugin: Plugin, id: string) {
  const hook = plugin.load as any;
  const fn = typeof hook === "function" ? hook : hook.handler;
  return fn.call({} as any, id, {});
}

function callConfigResolved(plugin: Plugin, cacheDir: string, publicDir: string) {
  const hook = plugin.configResolved as any;
  const fn = typeof hook === "function" ? hook : hook.handler;
  fn.call({} as any, { command: "serve", cacheDir, publicDir } as any);
}

function getPlugin(plugins: Plugin[], name: string): Plugin {
  const found = plugins.find(plugin => plugin.name === name);
  if (!found) throw new Error(`Missing plugin: ${name}`);
  return found;
}

function parseRGBA(color: string): [number, number, number, number] {
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(color);
  if (!match) throw new Error(`Unexpected color: ${color}`);
  return [+match[1]!, +match[2]!, +match[3]!, +match[4]!];
}

describe("ThumbHash placeholder", () => {
  it("encodes an auto-sized sample no larger than 100px", async () => {
    const seen: [number, number][] = [];
    const result = await getThumbhashData(
      imagePath,
      (width, height, pixels) => {
        seen.push([width, height]);
        return rgbaToThumbHash(width, height, pixels);
      },
      thumbHashToAverageRGBA,
    );

    expect(seen).toEqual([[100, 50]]);
    expect(result.hash.length).toBeGreaterThan(5);
    expect(result.hash.every(value => Number.isInteger(value) && value >= 0 && value <= 255)).toBe(true);
  });

  it("keeps alpha in the average server-side color", async () => {
    const result = await getThumbhashData(
      transparentPath,
      rgbaToThumbHash,
      thumbHashToAverageRGBA,
    );
    const [red, green, blue, alpha] = parseRGBA(result.color);

    expect(Math.abs(red - 51)).toBeLessThan(16);
    expect(Math.abs(green - 102)).toBeLessThan(16);
    expect(Math.abs(blue - 153)).toBeLessThan(16);
    expect(alpha).toBeGreaterThan(0.4);
    expect(alpha).toBeLessThan(0.6);
  });

  it("generates a local module with binary hash restoration and the ThumbHash decoder", async () => {
    const publicDir = path.join(dir, "public");
    const plugin = getPlugin(
      imagePlugin({
        local: {
          sizes: [400],
          input: ["png"],
          output: ["webp"],
          publicPath: publicDir,
          placeholder: { type: "thumbhash" },
        },
      }),
      "solid-start:image/local",
    );
    callConfigResolved(plugin, path.join(dir, "cache"), publicDir);

    const code: string = await callLoad(plugin, `${imagePath}?image-source`);

    expect(code).toContain('import { thumbHashToDataURL } from "thumbhash";');
    expect(code).toContain("hash: new Uint8Array(");
    expect(code).toContain("decode: thumbHashToDataURL");
    expect(code).not.toContain('from "blurhash"');
  });

  it("restores a remote Uint8Array and only imports ThumbHash for that preview", async () => {
    const hash = rgbaToThumbHash(1, 1, new Uint8Array([51, 102, 153, 128]));
    const plugin = getPlugin(
      imagePlugin({
        remote: {
          transformURL: () => ({
            src: {
              source: "/photo.png",
              width: 1,
              height: 1,
              placeholder: { hash, color: "rgba(51, 102, 153, 0.5)" },
            },
            variants: [],
          }),
        },
      }),
      "solid-start:image/remote",
    );

    const code: string = await callLoad(plugin, "image:photo");

    expect(code).toContain('import { thumbHashToDataURL } from "thumbhash";');
    expect(code).toContain("hash: new Uint8Array(SRC.placeholder.hash)");
    expect(code).toContain("decode: thumbHashToDataURL");
    expect(code).not.toContain('from "blurhash"');
  });
});
