/**
 * Returns a function that runs at most `limit` tasks at the same time.
 * Later tasks wait for a free slot. Encoding an image holds a lot of memory, so
 * starting every job at once can run a large site out of it.
 */
export function createLimit(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: (() => void)[] = [];

  function next(): void {
    if (active >= limit) {
      return;
    }
    const start = queue.shift();
    if (start) {
      active += 1;
      start();
    }
  }

  return task =>
    new Promise((resolve, reject) => {
      queue.push(() => {
        // Starting from a resolved promise also catches a task that throws
        // before it returns its promise.
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            next();
          });
      });
      next();
    });
}
