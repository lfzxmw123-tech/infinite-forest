import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"],
});
try {
  for (const query of ["", "?webgl"]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("fonts.googleapis.com"))
        errors.push(m.text());
    });
    await page.goto(`http://localhost:5173/${query}`, {
      waitUntil: "networkidle",
    });
    await page.waitForFunction(
      () => window.forestDebug || !document.getElementById("error").hidden,
      { timeout: 60000 },
    );
    assert.equal(
      await page.locator("#error").isVisible(),
      false,
      await page.locator("#error").textContent(),
    );
    await page.waitForFunction(() => window.forestDebug.stats.pending === 0);
    assert.equal(await page.locator("#enter").isEnabled(), true);
    await page.screenshot({
      path: `artifacts/forest-${query ? "webgl" : "auto"}.png`,
    });
    const initial = await page.evaluate(() => ({
      stats: window.forestDebug.stats,
      position: window.forestDebug.position,
      time: window.forestDebug.time,
    }));
    await page.locator("#enter").click();
    await page.waitForFunction(() => window.forestDebug.locked);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1500);
    await page.keyboard.up("KeyW");
    const moved = await page.evaluate(() => window.forestDebug.position);
    assert.ok(
      Math.hypot(
        moved[0] - initial.position[0],
        moved[2] - initial.position[2],
      ) > 0.2,
      "W moves player",
    );
    const q = await page.evaluate(() =>
      window.forestDebug.controls.camera.quaternion.toArray(),
    );
    await page.mouse.move(200, 150);
    const rotated = await page.evaluate(() =>
      window.forestDebug.controls.camera.quaternion.toArray(),
    );
    assert.notDeepEqual(q, rotated, "Mouse look");
    const ground = await page.evaluate(() => window.forestDebug.position[1]);
    await page.keyboard.press("Space");
    await page.waitForTimeout(180);
    assert.ok(
      (await page.evaluate(() => window.forestDebug.position[1])) >
        ground + 0.1,
      "Jump",
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !window.forestDebug.locked);
    await page.locator("#settings-toggle").click();
    await page.locator('[data-time="0.95"]').click();
    assert.equal(await page.locator("#time-name").textContent(), "夜晚");
    await page.screenshot({
      path: `artifacts/night-${query ? "webgl" : "auto"}.png`,
    });
    await page.locator("#wind").fill("1.5");
    assert.equal(await page.evaluate(() => window.forestDebug.wind), 1.5);
    await page.evaluate(() => window.forestDebug.teleport(800, -600));
    await page.waitForFunction(() => window.forestDebug.stats.pending === 0);
    const streamed = await page.evaluate(() => window.forestDebug.stats);
    assert.equal(streamed.active, 25);
    assert.ok(streamed.recycled >= 25);
    assert.ok(streamed.generated > initial.stats.generated);
    await page.locator("#quality").selectOption("high");
    await page.waitForFunction(
      () =>
        window.forestDebug.stats.active === 49 &&
        window.forestDebug.stats.pending === 0,
    );
    await page.locator("#quality").selectOption("low");
    await page.waitForFunction(() => window.forestDebug.stats.active === 25);
    assert.equal(await page.evaluate(() => window.forestDebug.stats.pool), 24);
    assert.ok(
      (await page.evaluate(() => window.forestDebug.time)) > initial.time,
      "Animation clock advances",
    );
    assert.deepEqual(errors, [], "No browser/renderer errors");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `artifacts/mobile-${query ? "webgl" : "auto"}.png`,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    console.log(
      "PASS browser",
      query || "auto",
      await page.evaluate(() => ({
        renderer: window.forestDebug.renderer,
        stats: window.forestDebug.stats,
        draws: window.forestDebug.renderInfo,
      })),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
