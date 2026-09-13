import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { outputFile, pruneStaleFiles, touchFile } from "../vite/fs";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "solid-image-fs-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("outputFile", () => {
  it("writes a file into an existing directory", async () => {
    const file = path.join(dir, "a.txt");
    await outputFile(file, "hello");

    expect(await fs.readFile(file, "utf8")).toBe("hello");
  });

  it("creates the parent directories when they are missing", async () => {
    const file = path.join(dir, "deep", "nested", "a.txt");
    await outputFile(file, "hello");

    expect(await fs.readFile(file, "utf8")).toBe("hello");
  });

  it("writes binary data", async () => {
    const file = path.join(dir, "a.bin");
    await outputFile(file, Buffer.from([1, 2, 3]));

    expect([...(await fs.readFile(file))]).toEqual([1, 2, 3]);
  });

  it("overwrites an existing file", async () => {
    const file = path.join(dir, "a.txt");
    await outputFile(file, "first");
    await outputFile(file, "second");

    expect(await fs.readFile(file, "utf8")).toBe("second");
  });
});

describe("touchFile", () => {
  it("marks the file as used now", async () => {
    const file = path.join(dir, "a.txt");
    await fs.writeFile(file, "a");
    const past = new Date(2001, 0, 1);
    await fs.utimes(file, past, past);

    await touchFile(file);

    expect((await fs.stat(file)).mtimeMs).toBeGreaterThan(past.getTime());
  });

  it("does not throw for a missing file", async () => {
    await expect(touchFile(path.join(dir, "missing.txt"))).resolves.toBeUndefined();
  });
});

describe("pruneStaleFiles", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("removes files older than the limit and keeps the rest", async () => {
    const old = path.join(dir, "old.webp");
    const recent = path.join(dir, "recent.webp");
    await fs.writeFile(old, "o");
    await fs.writeFile(recent, "r");
    const tenDaysAgo = new Date(Date.now() - 10 * DAY);
    await fs.utimes(old, tenDaysAgo, tenDaysAgo);

    expect(await pruneStaleFiles(dir, 7 * DAY)).toBe(1);

    await expect(fs.stat(old)).rejects.toThrow();
    expect((await fs.stat(recent)).isFile()).toBe(true);
  });

  it("leaves subdirectories alone", async () => {
    const nested = path.join(dir, "previews");
    await fs.mkdir(nested);
    const tenDaysAgo = new Date(Date.now() - 10 * DAY);
    await fs.utimes(nested, tenDaysAgo, tenDaysAgo);

    await pruneStaleFiles(dir, 7 * DAY);

    expect((await fs.stat(nested)).isDirectory()).toBe(true);
  });

  it("returns 0 for a missing directory", async () => {
    expect(await pruneStaleFiles(path.join(dir, "missing"), 7 * DAY)).toBe(0);
  });
});
