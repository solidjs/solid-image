import { describe, expect, it } from "vitest";
import { createLimit } from "../vite/limit";

// Resolves after a short, varied delay so tasks overlap.
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("createLimit", () => {
  it("never runs more tasks at once than the limit", async () => {
    const limit = createLimit(2);
    let active = 0;
    let highest = 0;

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        limit(async () => {
          active += 1;
          highest = Math.max(highest, active);
          await wait(5 + (index % 3));
          active -= 1;
        }),
      ),
    );

    expect(highest).toBe(2);
  });

  it("returns each task's result", async () => {
    const limit = createLimit(1);

    const results = await Promise.all([1, 2, 3].map(value => limit(async () => value * 10)));

    expect(results).toEqual([10, 20, 30]);
  });

  it("passes a failure to its caller and keeps running later tasks", async () => {
    const limit = createLimit(1);

    const failed = limit(async () => {
      throw new Error("broken image");
    });
    const next = limit(async () => "still runs");

    await expect(failed).rejects.toThrow("broken image");
    await expect(next).resolves.toBe("still runs");
  });

  it("frees the slot when a task throws before returning a promise", async () => {
    const limit = createLimit(1);

    const failed = limit((() => {
      throw new Error("thrown early");
    }) as () => Promise<never>);

    await expect(failed).rejects.toThrow("thrown early");
    await expect(limit(async () => "free")).resolves.toBe("free");
  });
});
