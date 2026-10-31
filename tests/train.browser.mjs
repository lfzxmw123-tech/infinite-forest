import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
});
try {
  for (const query of ["?webgl", ""]) {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://localhost:5173/${query}`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(
      () =>
        window.forestDebug?.train || !document.getElementById("error").hidden,
      { timeout: 45000 },
    );
    assert.ok(await page.locator("#error").isHidden());
    await page.waitForFunction(
      () => !document.getElementById("train-enter").disabled,
    );
    await page.locator("#train-enter").click();
    await page.waitForFunction(() => window.forestDebug.train.active);
    await page.keyboard.press("KeyR");
    await page.waitForFunction(
      () => window.forestDebug.train.physics.speed > 0.3,
    );
    await page.screenshot({
      path: `artifacts/train-${query ? "webgl" : "auto"}-cab.png`,
    });
    for (const mode of ["window", "follow", "cab"]) {
      await page.locator('[data-train="camera"]').click();
      await page.waitForFunction(
        (mode) => window.forestDebug.train.cameras.mode === mode,
        mode,
      );
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: `artifacts/train-${query ? "webgl" : "auto"}-${mode}.png`,
      });
    }
    await page.locator('[data-train="horn"]').click();
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () => window.forestDebug.train.physics.speed === 0,
    );
    const stats = await page.evaluate(() => window.forestDebug.train.stats());
    assert.equal(stats.railway.active, 9);
    assert.equal(stats.cars, 4);
    await page.locator('[data-train="exit"]').click();
    await page.waitForFunction(() => !window.forestDebug.train.active);
    assert.ok(await page.locator("#train-panel").isHidden());
    await page.locator("#resume").click();
    await page.waitForFunction(() => window.forestDebug.locked);
    assert.equal(
      await page.evaluate(() => window.forestDebug.controls.suspended),
      false,
    );
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    console.log("PASS train browser", query || "auto", stats);
    await page.close();
  }
} finally {
  await browser.close();
}
