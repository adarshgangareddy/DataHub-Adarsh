// Tiny per-key async mutex. Used so that MQTT messages and API calls touching the same
// device are processed one at a time (no read-modify-write races on the device row).

const tails = new Map();

export function withLock(key, fn) {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => {});
  tails.set(key, tail);
  tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
