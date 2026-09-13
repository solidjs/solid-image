import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { outputFile } from "../vite/fs";

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
