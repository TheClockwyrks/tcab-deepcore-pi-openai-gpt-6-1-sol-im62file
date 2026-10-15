/* global console, document, KeyboardEvent */
// One-time Playwright capture. The harness is injected only into its own page.
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error(e));
await page.route("**/capture", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<html><body style="margin:0;background:#101c29"><canvas id="capture" style="width:1280px;height:720px;display:block"></canvas></body></html>',
  }),
);
await page.goto("http://localhost:5173/capture");
await page.evaluate(async () => {
  const { game, BACKGROUND } = await import("/src/game.ts");
  const { createEngine, ConstantClock } =
    await import("/.vendor/engine/@clockwyrks/simple-2d/dist/index.js");
  const engine = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 30),
  });
  await engine.initialize();
  globalThis.captureEngine = engine;
});
await mkdir("showcase", { recursive: true });
await page.evaluate(async () => {
  const e = globalThis.captureEngine,
    d = e.debug;
  e.apply((s) => d.setScreen(s, "in-mine"));
  e.apply((s) => d.generateMine(s));
  for (const track of ["hull", "fuel", "drill", "cargo", "jetpack", "scanner"])
    e.apply((s) =>
      d.setTier(s, track, track === "fuel" ? 5 : track === "scanner" ? 2 : 3),
    );
  e.apply((s) => d.setFuel(s, 410));
  e.apply((s) => d.setHull(s, 220));
  e.apply((s) => d.setCredits(s, 2840));
  e.apply((s) => d.setCargo(s, "argenite", 4));
  e.apply((s) => d.setCargo(s, "cuprite", 3));
  // A real shaft in the generated rockbed. All subsequent motion is held input.
  for (let r = 129; r < 140; r++) e.apply((s) => d.setTile(s, 16, r, "tunnel"));
  for (let c = 12; c < 20; c++) e.apply((s) => d.setTile(s, c, 138, "tunnel"));
  for (let r = 140; r < 146; r++)
    e.apply((s) => d.setOreTile(s, 16, r, r % 2 ? "argenite" : "cuprite"));
  for (const [c, r, ore] of [
    [13, 141, "cobaltine"],
    [14, 142, "argenite"],
    [18, 140, "verdite"],
    [19, 141, "cuprite"],
    [21, 144, "voltite"],
  ])
    e.apply((s) => d.setOreTile(s, c, r, ore));
  e.apply((s) => d.setMaterialTile(s, 20, 142, "resonite"));
  e.apply((s) => d.setTile(s, 14, 144, "gas"));
  e.apply((s) => d.setMinerPosition(s, 16 * 80 + 12, 140 * 80 - 72));
  e.apply((s) => d.setMinerVelocity(s, 0, 0));
  await e.advance(1);
  e.startRecording();
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
  await e.advance(27);
});
await page.locator("canvas").screenshot({ path: "showcase/rockbed.png" });
await page.evaluate(async () => {
  const e = globalThis.captureEngine;
  await e.advance(33);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS" }));
  document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
  await e.advance(70);
  document.dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
  await e.advance(30);
});
const recording = await page.evaluate(() =>
  globalThis.captureEngine.stopRecording(),
);
await writeFile(
  "showcase/descent.json.gz",
  gzipSync(JSON.stringify(recording), { level: 9 }),
);
await page.evaluate(async () => {
  const e = globalThis.captureEngine,
    d = e.debug;
  e.apply((s) => d.reset(s));
  e.apply((s) => d.generateMine(s));
  e.apply((s) => d.setScreen(s, "in-mine"));
  e.apply((s) => d.setRocketInstalled(s, 3));
  e.apply((s) => d.setMinerPosition(s, 1500, 8));
  await e.advance(1);
});
await page.locator("canvas").screenshot({ path: "showcase/surface.png" });
await page.evaluate(async () => {
  const e = globalThis.captureEngine,
    d = e.debug;
  e.apply((s) => d.setTier(s, "fuel", 5));
  e.apply((s) => d.setFuel(s, 450));
  e.apply((s) => d.setTier(s, "hull", 5));
  e.apply((s) => d.setHull(s, 380));
  e.apply((s) => d.setMinerPosition(s, 16 * 80 + 12, 395 * 80 - 72));
  e.apply((s) => d.setMinerVelocity(s, 0, 0));
  for (let r = 389; r < 395; r++) e.apply((s) => d.setTile(s, 16, r, "tunnel"));
  for (let c = 12; c < 20; c++) e.apply((s) => d.setTile(s, c, 393, "tunnel"));
  for (const [c, r] of [
    [18, 395],
    [19, 395],
    [18, 396],
    [19, 396],
    [20, 396],
    [21, 396],
  ])
    e.apply((s) => d.setTile(s, c, r, "lava"));
  e.apply((s) => d.setCoreCarried(s, true));
  e.apply((s) => d.setCoreTimer(s, 63));
  e.apply((s) => d.setOreTile(s, 15, 395, "aurite"));
  e.apply((s) => d.setOreTile(s, 17, 394, "pyronium"));
  await e.advance(1);
});
await page.locator("canvas").screenshot({ path: "showcase/core-run.png" });
console.log("Captured", recording.frames.length, "frames.");
await browser.close();
