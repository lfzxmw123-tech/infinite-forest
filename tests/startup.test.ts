import assert from "node:assert/strict";
import { withTimeout } from "../src/core/startup";
assert.equal(
  await withTimeout(Promise.resolve("ready"), 100, "timeout"),
  "ready",
);
const failed = new Error("GPU unavailable");
await assert.rejects(
  withTimeout(Promise.reject(failed), 100, "timeout"),
  (error) => error === failed,
);
await assert.rejects(
  withTimeout(new Promise<never>(() => {}), 10, "GPU startup timed out"),
  /GPU startup timed out/,
);
console.log(
  "PASS: startup success, preserved initialization errors, timeout for a stalled renderer.",
);
