/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type DeepcoreState, type DeepcoreDebugApi } from "./game";
import * as C from "./constants";
import { initial, clone, cell, grounded, followCamera, scanner } from "./model";
import { createDebug } from "./debug";
import { generate } from "./world";
import { step, STEP } from "./simulation";
import * as T from "./transactions";
import { buttons, menuRect, controlRect } from "./interface";

// Real engine + raster canvas, with host adapters for file loading and Web Audio.
class NodeAudio {
  state = "running";
  currentTime = 0;
  destination = {};
  async decodeAudioData(data: ArrayBuffer) {
    return {
      length: data.byteLength,
      sampleRate: 22050,
      duration: data.byteLength / 44100,
    };
  }
  async resume() {
    return;
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime() {} },
      connect() {},
      disconnect() {},
    };
  }
  createBufferSource() {
    return { connect() {}, start() {}, stop() {}, disconnect() {} };
  }
  async close() {
    return;
  }
}
const storage = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const path = url.replace(/^\//, "").split("?")[0];
    return new Response(new Uint8Array(await readFile(path)));
  });
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal("AudioContext", NodeAudio);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
});
afterAll(() => vi.unstubAllGlobals());
const debug = createDebug();
function fresh() {
  const s = initial({ images: {}, systems: {} });
  s.screen = "in-mine";
  return s;
}
function run(
  s: DeepcoreState,
  seconds: number,
  h = { left: 0, right: 0, down: 0, up: 0 },
) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(s, h, STEP);
  return s;
}
async function harness(ms = 1000 / 60) {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    clock: new ConstantClock(ms),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();
  const key = (code: string, down = true) =>
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const press = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, false);
  };
  return { engine, key, press, target, canvas };
}
const pose = (
  e: Engine<DeepcoreState, DeepcoreDebugApi>,
  fn: (s: Parameters<DeepcoreDebugApi["reset"]>[0]) => DeepcoreState,
) => e.apply(fn);

describe("engine integration", () => {
  it("loads every genuine asset, navigates all opening menus, drills and thrusts with keyboard actions", async () => {
    const { engine: e, press, key } = await harness();
    expect(Object.keys(e.state.resources.images)).toHaveLength(84);
    expect(Object.keys(e.state.resources.systems)).toHaveLength(12);
    expect(e.debug.version).toBe(C.DEEPCORE_DEBUG_VERSION);
    await press("Enter");
    expect(e.state.screen).toBe("mode-select");
    await press("Enter");
    expect(e.state.screen).toBe("size-select");
    await press("Enter");
    expect(e.state.worldSize).toBe("quick");
    const old = e.state;
    key("KeyS");
    await e.advance(60);
    key("KeyS", false);
    expect(e.debug.snapshot(e.state).depthMeters).toBeGreaterThan(5);
    expect(old.miner.y).toBe(C.SURFACE_Y - C.MINER_H);
    expect(old.grid[1][C.SPAWN_COL].kind).not.toBe("tunnel");
    const y = e.state.miner.y;
    key("Space");
    await e.advance(35);
    key("Space", false);
    expect(e.state.miner.y).toBeLessThan(y);
    expect(e.state.miner.state).toBe("jetpack");
    await press("KeyI");
    expect(e.state.panel).toBe("inventory");
    const f = e.state.miner.fuel;
    await e.advance(20);
    expect(e.state.miner.fuel).toBe(f);
    await press("Escape");
    expect(e.state.panel).toBeNull();
    await press("KeyP");
    expect(e.state.screen).toBe("paused");
    const time = e.state.elapsedSeconds;
    await e.advance(30);
    expect(e.state.elapsedSeconds).toBe(time);
    await press("KeyP");
    expect(e.state.screen).toBe("in-mine");
    await press("KeyM");
    expect(e.state.muted).toBe(true);
    expect(e.diagnostics().every((d) => !d.error)).toBe(true);
    e.destroy();
  }, 20000);
  it("uses matched pointer edges and highlights menu hover at logical coordinates", async () => {
    const { engine: e, target } = await harness();
    await e.advance(1);
    const ptr = (type: string, x: number, y: number) =>
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    ptr("pointerdown", 120, 440);
    await e.advance(1);
    expect(e.state.menuIndex).toBe(1);
    ptr("pointerup", 120, 400);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    ptr("pointerdown", 120, 440);
    ptr("pointerup", 120, 440);
    await e.advance(1);
    expect(e.state.screen).toBe("how-to-play");
    e.destroy();
  });
  it("is independent of frame division, including drill cadence and life-support burn", async () => {
    const a = await harness(1000 / 30),
      b = await harness(1000 / 120);
    for (const h of [a, b]) {
      pose(h.engine, (s) => debug.setScreen(s, "in-mine"));
      pose(h.engine, (s) => debug.setTile(s, C.SPAWN_COL, 1, "rock"));
      pose(h.engine, (s) => debug.setMinerTravel(s, false));
      h.key("KeyS");
    }
    await a.engine.advance(30);
    await b.engine.advance(120);
    expect(a.engine.state.miner.fuel).toBeCloseTo(b.engine.state.miner.fuel, 9);
    expect(a.engine.debug.tileAt(a.engine.state, 4, 1)).toEqual(
      b.engine.debug.tileAt(b.engine.state, 4, 1),
    );
    a.engine.destroy();
    b.engine.destroy();
  }, 20000);
});

describe("panel controls through the engine", () => {
  it("drives actual service, trade, upgrade, inventory and launch controls with matched clicks", async () => {
    const { engine: e, target, press } = await harness();
    pose(e, (s) => T.start(s));
    pose(e, (s) => debug.setCredits(s, 100000));
    const click = async (
      control: Parameters<DeepcoreDebugApi["controlRect"]>[1],
      subject: string | null = null,
    ) => {
      const r = e.debug.controlRect(e.state, control, subject);
      expect(r).not.toBeNull();
      for (const type of ["pointerdown", "pointerup"])
        target.dispatchEvent(
          Object.assign(new Event(type), {
            clientX: r!.x + r!.w / 2,
            clientY: r!.y + r!.h / 2,
            pointerId: 2,
            pointerType: "mouse",
            isPrimary: true,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
          }),
        );
      await e.advance(1);
    };
    pose(e, (s) => debug.setFuel(s, 50));
    pose(e, (s) => debug.setPanel(s, "fuel-depot"));
    await click("buy-fuel");
    expect(e.state.miner.fuel).toBe(75);
    await click("fill-fuel");
    expect(e.state.miner.fuel).toBe(100);
    pose(e, (s) => debug.setHull(s, 40));
    await click("buy-repair");
    await click("repair-full");
    expect(e.state.miner.hull).toBe(100);
    pose(e, (s) => debug.setCargo(s, "ferron", 3));
    pose(e, (s) => debug.setPanel(s, "inventory"));
    await click("drop-ore", "ferron");
    expect(e.state.cargo.ferron).toBe(2);
    pose(e, (s) => debug.setPanel(s, "ore-market"));
    await click("sell");
    expect(e.state.cargo).toEqual({});
    pose(e, (s) => debug.setPanel(s, "upgrade-shop"));
    await click("buy-upgrade", "hull");
    expect(e.state.tiers.hull).toBe(2);
    pose(e, (s) => debug.setPanel(s, "supply-depot"));
    await click("buy-item", "emergency-fuel");
    expect(e.state.items["emergency-fuel"]).toBe(1);
    pose(e, (s) => debug.setFuel(s, 50));
    pose(e, (s) => debug.setPanel(s, "inventory"));
    await click("use-item", "emergency-fuel");
    expect(e.state.miner.fuel).toBe(80);
    pose(e, (s) => debug.setMaterial(s, "resonite", 1));
    pose(e, (s) => debug.setMaterial(s, "cryenite", 1));
    pose(e, (s) => debug.setCoreCarried(s, true));
    pose(e, (s) => debug.setPanel(s, "launch-pad"));
    for (let i = 0; i < C.ROCKET_COMPONENTS.length; i++)
      await click("fabricate");
    expect(e.state.installed).toBe(5);
    expect(e.state.coreTimer).toBeNull();
    await click("launch");
    expect(e.state.launchTime).not.toBeNull();
    await press("Escape");
    expect(e.state.screen).toBe("paused");
    e.destroy();
  }, 20000);
  it("returns to the correct entries and renders all menu and end screens", async () => {
    const { engine: e, press } = await harness();
    pose(e, (s) => debug.clearSave(s));
    await press("Enter");
    await press("ArrowDown");
    await press("Enter");
    expect(e.state.mode).toBe("hardcore");
    await press("Escape");
    expect(e.state.menuIndex).toBe(1);
    await press("Escape");
    expect(e.state.screen).toBe("title");
    await press("ArrowDown");
    await press("Enter");
    expect(e.state.screen).toBe("how-to-play");
    await press("Escape");
    expect(e.state.menuIndex).toBe(1);
    pose(e, (s) => debug.setScreen(s, "game-over"));
    await e.advance(1);
    pose(e, (s) => debug.setScreen(s, "victory"));
    await e.advance(1);
    pose(e, (s) => debug.setScreen(s, "in-mine"));
    pose(e, (s) => debug.setHull(s, 0));
    await e.advance(1);
    expect(e.state.summary?.deathCause).toBe("hull-destroyed");
    e.destroy();
  });
});

describe("world and poses", () => {
  for (const size of C.WORLD_SIZES)
    it(`generates ${size} bands, unique materials and an intact chamber`, () => {
      let s = debug.setWorldSize(fresh(), size);
      s = debug.generateMine(s);
      expect(s.coreRow).toBe(
        Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
      );
      expect(s.grid[1][C.CAVE_MOUTH_COL].kind).toBe("tunnel");
      expect(s.grid[s.coreRow][C.CORE_COL].kind).toBe("core");
      for (const material of C.MATERIALS) {
        const nodes = s.grid.flat().filter((t) => t.material === material);
        expect(nodes).toHaveLength(1);
        expect(nodes[0].band).toBe(C.MATERIAL_BAND[material]);
      }
      for (const band of C.BANDS) {
        const cells = s.grid.flat().filter((t) => t.band === band);
        const share = cells.filter((t) => t.ore).length / cells.length;
        expect(share).toBeGreaterThan(
          C.ORE_DENSITY * (1 - C.DENSITY_TOLERANCE),
        );
        expect(share).toBeLessThan(C.ORE_DENSITY * (1 + C.DENSITY_TOLERANCE));
      }
      expect(
        s.grid
          .slice(1, 4)
          .flat()
          .some((t) => t.ore),
      ).toBe(false);
    });
  it("resizes by preserving old cell bands, removes old chamber, and creates one new chamber", () => {
    let s = debug.setOreTile(fresh(), 5, 200, "cuprite");
    s = debug.setTileHealth(s, 5, 200, 3);
    s = debug.setWorldSize(s, "marathon");
    expect(s.grid[200][5]).toMatchObject({
      band: "rockbed",
      ore: "cuprite",
      health: 3,
    });
    expect(s.grid[500][16].kind).toBe("tunnel");
    expect(s.grid[1000][16].kind).toBe("core");
    s = debug.setWorldSize(s, "quick");
    expect(debug.tileAt(s, 5, 600)).toEqual(cell("bedrock", null));
  });
  it("poses immutably, derives load and reads scanner locks without running a system", () => {
    const s = fresh();
    let n = debug.setCargo(s, "adamite", 5);
    expect(s.cargo).toEqual({});
    expect(debug.snapshot(n).miner.overloaded).toBe(true);
    n = debug.setTier(n, "scanner", 3);
    n = debug.setMaterialTile(n, 4, 3, "resonite");
    expect(scanner(n)).toMatchObject({ locked: true, target: "resonite" });
    const before = debug.snapshot(n);
    expect(debug.snapshot(debug.reconcile(n))).toEqual(before);
    expect(debug.reconcile(debug.reconcile(n))).toEqual(debug.reconcile(n));
    n = debug.setMaterial(n, "resonite", 1);
    expect(scanner(n).locked).toBe(false);
  });
  it("rejects illegal domains and invalid subjects loudly", () => {
    const s = fresh();
    expect(() => debug.setTile(s, -1, 4, "rock")).toThrow();
    expect(() => debug.setTier(s, "fuel", 6)).toThrow();
    expect(() => debug.setCoreTimer(s, 10)).toThrow();
    expect(() => debug.setTileHealth(s, 5, 5, 2)).toThrow();
    expect(() => debug.setMenuIndex(s, 0)).toThrow();
    expect(() => debug.setNextTeleportHeight(s, 9)).toThrow();
    expect(() => debug.setFuel(s, -1)).toThrow();
  });
  it("reset and clear operations preserve preferences and save slot but reset the expedition", () => {
    let s = fresh();
    s.muted = true;
    s.hasSave = true;
    s = debug.setCredits(s, 55);
    s = debug.reset(s);
    expect(s.screen).toBe("title");
    expect(s.credits).toBe(0);
    expect(s.hasSave).toBe(true);
    expect(s.muted).toBe(true);
    expect(debug.findTile(s, "ore")).toBeNull();
    expect(debug.findTile(s, "core")).toEqual({
      col: C.CORE_COL,
      row: s.coreRow,
    });
    s = debug.generateMine(s);
    s = debug.clearMine(s);
    expect(s.grid.flat().some((t) => t.ore || t.material)).toBe(false);
    expect(s.grid[s.coreRow][C.CORE_COL].kind).toBe("core");
  });
});

describe("movement, drilling and hazards", () => {
  it("hits persistent health, banks ore, never banks beyond slot cap, and honors faculty gates", () => {
    let s = fresh();
    s = debug.setOreTile(s, 4, 1, "ferron");
    s = debug.setMinerTravel(s, false);
    run(s, 0.25, { left: 0, right: 0, down: 1, up: 0 });
    expect(s.grid[1][4].health).toBe(2);
    expect(s.miner.y).toBe(8);
    const fuel = s.miner.fuel;
    s = debug.setMinerDrill(s, false);
    run(s, 0.25, { left: 0, right: 0, down: 1, up: 0 });
    expect(s.grid[1][4].health).toBe(2);
    expect(s.miner.fuel).toBe(fuel);
    s = debug.setMinerDrill(s, true);
    run(s, 0.25, { left: 0, right: 0, down: 1, up: 0 });
    expect(s.cargo.ferron).toBe(1);
    s = debug.setCargo(s, "ferron", C.CARGO_TIERS[0]);
    s = debug.setOreTile(s, 4, 1, "marlite");
    run(s, 0.5, { left: 0, right: 0, down: 1, up: 0 });
    expect(s.cargo.marlite).toBeUndefined();
    expect(s.grid[1][4].kind).toBe("tunnel");
  });
  it("moves laterally to a wall before starting a side cut, and cannot drill in flight", () => {
    let s = fresh();
    s = debug.setTile(s, 5, 1, "rock");
    s = debug.setMinerPosition(
      s,
      5 * C.TILE - C.MINER_W,
      1 * C.TILE - C.MINER_H,
    );
    s = debug.setTile(s, 4, 1, "rock");
    run(s, 0.25, { left: 0, right: 1, down: 0, up: 0 });
    expect(s.grid[1][5].health).toBe(4); // wall lies in row 1; standing on surface cannot side-drill downward
    s = debug.setMinerPosition(
      s,
      5 * C.TILE - C.MINER_W,
      2 * C.TILE - C.MINER_H,
    );
    s = debug.setTile(s, 4, 2, "rock");
    s = debug.setMinerTravel(s, false);
    run(s, 0.25, { left: 0, right: 1, down: 0, up: 0 });
    expect(s.grid[1][5].health).toBe(2);
    s = debug.setMinerPosition(s, 100, -500);
    s = debug.setMinerVelocity(s, 0, 100);
    run(s, 0.25, { left: 0, right: 0, down: 1, up: 0 });
    expect(s.miner.drilling).toBeNull();
  });
  it("applies weight to ascent and terminal speed; overload never lifts off", () => {
    let s = fresh();
    s = debug.setCargo(s, "adamite", 10);
    s = debug.setTile(s, 4, 1, "rock");
    const y = s.miner.y;
    run(s, 1, { left: 0, right: 0, down: 0, up: 1 });
    expect(s.miner.y).toBe(y);
    expect(s.miner.fuel).toBeLessThan(100);
    s = debug.clearCargo(s);
    run(s, 0.5, { left: 0, right: 0, down: 0, up: 1 });
    expect(s.miner.y).toBeLessThan(0);
  });
  it("integrates gravity, collisions and hard landing damage", () => {
    let s = fresh();
    s = debug.setTile(s, 4, 1, "rock");
    s = debug.setMinerPosition(s, s.miner.x, -900);
    run(s, 2);
    expect(grounded(s)).toBe(true);
    expect(s.miner.hull).toBeCloseTo(75);
    expect(s.pendingCues).toContain(C.CUES.impact);
  });
  it("gas scales damage by depth, shoves only a traveling miner and arms delayed notice", () => {
    let s = fresh();
    s = debug.setMinerPosition(s, 4 * C.TILE, 126 * C.TILE - 72);
    s = debug.setMinerTravel(s, false);
    s = debug.setHull(s, 1000);
    s = debug.setTile(s, 4, 126, "gas");
    s = debug.setTileHealth(s, 4, 126, 1);
    run(s, 0.125, { left: 0, right: 0, down: 1, up: 0 });
    expect(s.miner.hull).toBeLessThan(1000);
    expect(s.notice).toMatchObject({ hazard: "gas", shown: false });
    run(s, C.NOTICE_DELAY + 0.1);
    expect(s.notice?.shown).toBe(true);
    expect(s.miner.vy).toBe(0);
    run(s, C.NOTICE_FADE);
    expect(s.notice).toBeNull();
  });
  it("radiators reduce lava drill lumps but not gas damage", () => {
    let s = fresh();
    s = debug.setMinerTravel(s, false);
    s = debug.setMinerPosition(s, 4 * C.TILE, 300 * C.TILE - 72);
    s = debug.setTier(s, "radiator", 5);
    s = debug.setTile(s, 4, 300, "lava");
    s = debug.setTileHealth(s, 4, 300, 1);
    run(s, 0.125, { left: 0, right: 0, down: 1, up: 0 });
    expect(s.miner.hull).toBeCloseTo(
      100 - C.LAVA_DRILL_DEEPSTONE * (1 - C.RADIATOR_TIERS[4]),
    );
    expect(s.notice?.hazard).toBe("lava");
  });
  it("charges lava contact once per second, not once per adjacent cell", () => {
    let s = fresh();
    s = debug.setMinerTravel(s, false);
    s = debug.setMinerPosition(
      s,
      5 * C.TILE - C.MINER_W / 2,
      300 * C.TILE - C.MINER_H,
    );
    s = debug.setTile(s, 4, 300, "lava");
    s = debug.setTile(s, 5, 300, "lava");
    run(s, 1);
    expect(s.miner.hull).toBeCloseTo(C.HULL_TIERS[0] - C.LAVA_CONTACT_DPS);
  });
  it("reconciles grounded after a position pose without retaining a phantom drill floor", () => {
    let s = fresh();
    s = debug.setTile(s, 4, 1, "rock");
    s = debug.setTile(s, 4, 2, "rock");
    run(s, 0.25, { left: 0, right: 0, down: 1, up: 0 });
    expect(grounded(s)).toBe(true);
    s = debug.setMinerPosition(s, 300, -500);
    const n = debug.reconcile(s);
    expect(debug.snapshot(n).miner.grounded).toBe(false);
    expect(n.miner.y).toBe(-500);
  });
  it("checks empty hull even with inventory open; fuel death and Hardcore delete saves immediately", () => {
    let s = fresh();
    s = debug.setPanel(s, "inventory");
    s = debug.setHull(s, 0);
    run(s, STEP);
    expect(s.screen).toBe("game-over");
    expect(s.summary?.deathCause).toBe("hull-destroyed");
    s = fresh();
    s.mode = "hardcore";
    T.save(s);
    s = debug.setMinerPosition(s, 100, 100);
    s = debug.setFuel(s, 0);
    run(s, STEP);
    expect(s.screen).toBe("game-over");
    expect(s.hasSave).toBe(false);
  });
  it("extracts one unstable Sample without destroying the Core and detonates across overlays", () => {
    let s = fresh();
    s = debug.setMinerPosition(
      s,
      C.CORE_COL * C.TILE,
      s.coreRow * C.TILE - C.MINER_H,
    );
    s = debug.setMinerTravel(s, false);
    run(s, 0.125, { left: 0, right: 0, down: 1, up: 0 });
    expect(s.satchel.coreSample).toBe(true);
    expect(s.grid[s.coreRow][C.CORE_COL].kind).toBe("core");
    s = debug.setCoreTimer(s, 0.1);
    s = debug.setPanel(s, "inventory");
    run(s, 0.1);
    expect(s.summary?.deathCause).toBe("core-detonation");
  });
  it("jettison keeps the clock and ground detonation is location-aware", () => {
    let s = fresh();
    s = debug.setCoreCarried(s, true);
    s = debug.jettison(s);
    expect(s.coreTimer).toBe(C.CORE_TIMER);
    s = debug.setCoreTimer(s, 0.1);
    s = debug.setMinerPosition(s, 2000, -100);
    run(s, 0.1);
    expect(s.screen).toBe("in-mine");
    expect(s.coreTimer).toBeNull();
  });
  it("camera lead ramps and unwinds without a ceiling", () => {
    const s = fresh();
    s.miner.y = -1500;
    s.miner.vy = 100;
    followCamera(s, C.CAM_LEAD_RAMP);
    expect(s.camera.lead).toBe(C.CAM_LEAD_MAX);
    expect(s.camera.y).toBeLessThan(0);
    s.miner.vy = 0;
    followCamera(s, C.CAM_LEAD_RAMP / C.CAM_UNWIND_MULT);
    expect(s.camera.lead).toBe(0);
  });
});

describe("economy, field supplies, persistence and victory", () => {
  it("prices cargo and clamps paid service to missing capacity and available Credits", () => {
    let s = fresh();
    s = debug.setCargo(s, "aurite", 2);
    s = debug.sell(s);
    expect(s.credits).toBe(4920);
    expect(s.creditsEarned).toBe(4920);
    s = debug.setFuel(s, 70);
    s = debug.buyFuel(s);
    expect(s.miner.fuel).toBe(95);
    s = debug.fillFuel(s);
    expect(s.miner.fuel).toBe(100);
    s = debug.setHull(s, 50);
    s = debug.setCredits(s, 10);
    s = debug.repairFull(s);
    expect(s.miner.hull).toBe(55);
    expect(s.credits).toBe(0);
  });
  it("upgrades only one rung and adds the capacity delta rather than refilling", () => {
    let s = fresh();
    s = debug.setFuel(s, 30);
    s = debug.setCredits(s, 500);
    s = debug.buyUpgrade(s, "fuel");
    expect(s.miner.fuel).toBe(105);
    expect(s.tiers.fuel).toBe(2);
    expect(s.credits).toBe(200);
    s = debug.buyUpgrade(s, "fuel");
    expect(s.tiers.fuel).toBe(2);
  });
  it("explosives lose ore, clear stone and detonate gas but preserve material nodes", () => {
    let s = fresh();
    s = debug.setMinerPosition(s, 4 * C.TILE, 4 * C.TILE);
    s = debug.setHull(s, 1000);
    s = debug.setItemCount(s, "dynamite", 1);
    s = debug.setOreTile(s, 4, 4, "ferron");
    s = debug.setTile(s, 5, 4, "stone");
    s = debug.setMaterialTile(s, 3, 4, "resonite");
    s = debug.setTile(s, 4, 5, "gas");
    s = debug.useItem(s, "dynamite");
    expect(s.grid[4][4].kind).toBe("tunnel");
    expect(s.grid[4][5].kind).toBe("tunnel");
    expect(s.grid[4][3].kind).toBe("material");
    expect(s.cargo).toEqual({});
    expect(s.miner.hull).toBeLessThan(1000);
    expect(s.items.dynamite).toBe(0);
  });
  it("teleport outcomes are consumed independently and ordinary physics owns the landing", () => {
    let s = fresh();
    s = debug.setItemCount(s, "quantum-teleporter", 2);
    s = debug.setNextTeleportHeight(s, 7);
    s = debug.setNextTeleportSpeed(s, 600);
    s = debug.useItem(s, "quantum-teleporter");
    expect(s.miner.y).toBe(C.SURFACE_Y - C.MINER_H - 7 * C.TILE);
    expect(s.miner.vy).toBe(600);
    expect(s.nextTeleportHeight).toBeNull();
    expect(s.nextTeleportSpeed).toBeNull();
    s = debug.setItemCount(s, "matter-transmitter", 1);
    s = debug.useItem(s, "matter-transmitter");
    expect(s.miner.y).toBe(C.SURFACE_Y - C.MINER_H);
    expect(s.miner.vy).toBe(0);
  });
  it("buys and uses repair and fuel supplies only when their effect changes something", () => {
    let s = fresh();
    s = debug.setCredits(s, 10000);
    s = debug.buyItem(s, "nanobots");
    s = debug.useItem(s, "nanobots");
    expect(s.items.nanobots).toBe(1);
    s = debug.setHull(s, 60);
    s = debug.useItem(s, "nanobots");
    expect(s.miner.hull).toBe(80);
    s = debug.setItemCount(s, "emergency-fuel", 1);
    s = debug.setFuel(s, 90);
    s = debug.useItem(s, "emergency-fuel");
    expect(s.miner.fuel).toBe(100);
    expect(s.items["emergency-fuel"]).toBe(0);
  });
  it("saves the actual mine and restores surface holdings, refusing live Samples", () => {
    let s = fresh();
    generate(s);
    s = debug.setOreTile(s, 5, 5, "adamite");
    s = debug.setCredits(s, 340);
    s = debug.setCargo(s, "marlite", 2);
    s = debug.save(s);
    expect(s.hasSave).toBe(true);
    const r = T.restore(initial(s.resources));
    expect(r.grid[5][5].ore).toBe("adamite");
    expect(r.credits).toBe(340);
    expect(r.cargo.marlite).toBe(2);
    s = debug.setCoreCarried(s, true);
    s = debug.setCredits(s, 999);
    s = debug.save(s);
    expect(T.restore(s).credits).toBe(340);
  });
  it("fabricates all components in order, consumes exact materials and wins only through launch", () => {
    let s = fresh();
    s = debug.setCredits(s, C.ROCKET_TOTAL_CREDITS);
    s = debug.fabricate(s);
    s = debug.fabricate(s);
    const balance = s.credits;
    s = debug.fabricate(s);
    expect(s.credits).toBe(balance);
    s = debug.setMaterial(s, "resonite", 1);
    s = debug.fabricate(s);
    s = debug.setMaterial(s, "cryenite", 1);
    s = debug.fabricate(s);
    s = debug.setCoreCarried(s, true);
    s = debug.fabricate(s);
    expect(s.installed).toBe(5);
    expect(s.credits).toBe(0);
    expect(s.coreTimer).toBeNull();
    s = debug.launch(s);
    run(s, 3);
    expect(s.screen).toBe("victory");
    expect(s.hasSave).toBe(false);
    expect(s.summary?.componentsInstalled).toBe(5);
  });
  it("reports only drawn controls, and gives every panel a keyboard/pointer hit region", () => {
    let s = fresh();
    expect(menuRect(s, 0)).toBeNull();
    expect(controlRect(s, "sell", null)).toBeNull();
    for (const p of C.PANELS) {
      s = debug.setPanel(s, p);
      expect(buttons(s).length).toBeGreaterThan(3);
    }
    s = debug.setPanel(s, "fuel-depot");
    expect(controlRect(s, "buy-fuel", null)).not.toBeNull();
    s = debug.setScreen(s, "title");
    expect(menuRect(s, 0)).not.toBeNull();
    expect(buttons(s)).toHaveLength(0);
  });
  it("readings never mutate and reset leaves no latent drill or teleport result", () => {
    let s = fresh();
    s = debug.setNextTeleportHeight(s, 5);
    s = debug.setItemCount(s, "dynamite", 2);
    s = debug.setCargo(s, "cuprite", 3);
    const n = clone(s);
    debug.snapshot(s);
    debug.tileAt(s, 4, 1);
    debug.findTile(s, "tunnel");
    expect(s).toEqual(n);
    s = debug.clearCargo(s);
    s = debug.clearItems(s);
    s = debug.reset(s);
    expect(s.nextTeleportHeight).toBeNull();
    expect(s.hitClock).toBe(0);
    expect(s.items.dynamite).toBe(0);
  });
});
