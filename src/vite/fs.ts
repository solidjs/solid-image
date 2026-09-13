import crypto from "node:crypto";
import type { Abortable } from "node:events";
import type { Mode, ObjectEncodingOptions, OpenMode } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Stream } from "node:stream";

export async function removeFile(filePath: string): Promise<void> {
  return await fs.rm(filePath, { recursive: true, force: true });
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);

    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Returns a hash of the file content.
 * It is part of the name of a processed image, so an edited source is written
 * to a new file instead of reusing a stale one.
 * It reads the content rather than the modification time, because a fresh
 * checkout gives every file a new time and would never match the cache.
 */
export async function getFileSignature(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha1").update(content).digest("hex");
}

/** Marks a file as used now, so pruning keeps it. */
export async function touchFile(filePath: string): Promise<void> {
  const now = new Date();
  try {
    await fs.utimes(filePath, now, now);
  } catch {
    // The file is gone, so the next load writes it again.
  }
}

/**
 * Removes the files in a directory that were not used within `maxAge`
 * milliseconds. Subdirectories are left alone, and a missing directory is not
 * an error. Returns how many files were removed.
 */
export async function pruneStaleFiles(
  dir: string,
  maxAge: number,
  now: number = Date.now(),
): Promise<number> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let removed = 0;
  await Promise.all(
    entries
      .filter(entry => entry.isFile())
      .map(async entry => {
        const filePath = path.join(dir, entry.name);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > maxAge) {
            await removeFile(filePath);
            removed += 1;
          }
        } catch {
          // Another build removed it first.
        }
      }),
  );
  return removed;
}

const PATH_FILTER = /[<>:"|?*]/;

export function checkPath(pth: string) {
  if (process.platform === "win32") {
    const pathHasInvalidWinCharacters = PATH_FILTER.test(pth.replace(path.parse(pth).root, ""));

    if (pathHasInvalidWinCharacters) {
      const error = new Error(`Path contains invalid characters: ${pth}`);
      throw error;
    }
  }
}

export async function makeDir(dir: string, mode = 0o777) {
  checkPath(dir);
  return await fs.mkdir(dir, {
    mode,
    recursive: true,
  });
}

export async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function outputFile(
  file: string,
  data:
    | string
    | NodeJS.ArrayBufferView
    | Iterable<string | NodeJS.ArrayBufferView>
    | AsyncIterable<string | NodeJS.ArrayBufferView>
    | Stream,
  encoding?:
    | (ObjectEncodingOptions & {
        mode?: Mode | undefined;
        flag?: OpenMode | undefined;
      } & Abortable)
    | BufferEncoding
    | null,
) {
  const dir = path.dirname(file);
  if (!(await pathExists(dir))) {
    await makeDir(dir);
  }
  return fs.writeFile(file, data, encoding);
}
