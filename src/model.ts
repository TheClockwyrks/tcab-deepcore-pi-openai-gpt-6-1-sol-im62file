import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
  maxHealth: number | null;
}
export interface Effect {
  id: number;
  name: string;
  x: number;
  y: number;
  age: number;
  tint?: string;
}
export const ROCK_TINT: Record<C.BandName, string> = {
  topsoil: "#bc9173",
  rockbed: "#9cb5c0",
  deepstone: "#798ba3",
  coreshell: "#c48682",
};
export const MINERAL_TINT = Object.fromEntries(
  C.MINERALS.map((m, i) => [
    m.id,
    [
      "#cc8067",
      "#ddd1ac",
      "#e8a053",
      "#dbe7e9",
      "#5ea7de",
      "#8de6d3",
      "#c2b3f1",
      "#ff9c54",
      "#ed6e69",
      "#cef0ef",
      "#67edb0",
      "#ff9fce",
      "#ffda77",
    ][i],
  ]),
) as Record<C.OreId, string>;
export interface Resources {
  images: Record<string, ImageBitmap>;
  systems: Record<string, ParticleSystem>;
}
export interface DeepcoreState {
  resources: Resources;
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  coreTimer: number | null;
  coreGround: { col: number; row: number } | null;
  camera: { x: number; y: number; lead: number };
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
    drilling: {
      col: number;
      row: number;
      dir: "down" | "left" | "right";
    } | null;
  };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  installed: number;
  notice: { hazard: C.NoticeHazard; shown: boolean; age: number } | null;
  noticesFired: Record<C.NoticeHazard, boolean>;
  summary: {
    deepestDepthMeters: number;
    creditsEarned: number;
    elapsedSeconds: number;
    mode: C.Mode;
    componentsInstalled: number;
    deathCause: C.DeathCause | null;
  } | null;
  grid: Cell[][];
  accumulator: number;
  hitClock: number;
  hurt: number;
  animTime: number;
  effects: Effect[];
  effectId: number;
  pendingCues: C.CueName[];
  shake: number;
  note: string;
  noteTime: number;
  pointerDown: Record<number, string>;
  panelIndex: number;
  launchTime: number | null;
}
export type StateView = DeepReadonly<DeepcoreState>;
export const clamp = (n: number, a: number, b: number): number =>
  Math.max(a, Math.min(b, n));
export const mineral = (id: C.OreId): C.Mineral =>
  C.MINERALS.find((m) => m.id === id)!;
export const maxFuel = (s: StateView): number => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: StateView): number => C.HULL_TIERS[s.tiers.hull - 1];
export const slotCap = (s: StateView): number =>
  C.CARGO_TIERS[s.tiers.cargo - 1];
export const slots = (s: StateView): number =>
  Object.values(s.cargo).reduce((a, b) => a + (b ?? 0), 0);
export const loadKg = (s: StateView): number =>
  C.MINERALS.reduce((a, m) => a + (s.cargo[m.id] ?? 0) * m.weightKg, 0);
export const jet = (s: StateView): C.JetpackTier =>
  C.JETPACK_TIERS[s.tiers.jetpack - 1];
export const depth = (s: StateView): number =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export const minerCell = (s: StateView): { col: number; row: number } => ({
  col: clamp(
    Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
    0,
    C.WORLD_COLS - 1,
  ),
  row: clamp(Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE), 0, s.coreRow),
});
export function bandAt(row: number, coreRow: number): C.BandName | null {
  return row < 1 || row >= coreRow
    ? null
    : C.BANDS[Math.min(3, Math.floor((4 * (row - 1)) / (coreRow - 1)))];
}
export function cell(
  kind: C.TileKind,
  band: C.BandName | null,
  ore: C.OreId | null = null,
  material: C.MaterialId | null = null,
): Cell {
  const health =
    band && ["rock", "ore", "material", "gas", "lava"].includes(kind)
      ? C.BAND_HEALTH[band]
      : null;
  return { kind, band, ore, material, health, maxHealth: health };
}
export function tile(
  s: StateView,
  col: number,
  row: number,
): DeepReadonly<Cell> {
  return s.grid[row]?.[col] ?? cell("bedrock", null);
}
export const solid = (s: StateView, c: number, r: number): boolean =>
  r >= 1 && tile(s, c, r).kind !== "tunnel";
export function grounded(s: StateView): boolean {
  const m = s.miner;
  const feet = m.y + C.MINER_H;
  const cut = m.drilling;
  if (
    cut?.dir === "down" &&
    Math.floor((m.x + C.MINER_W / 2) / C.TILE) === cut.col
  ) {
    const target = tile(s, cut.col, cut.row);
    if (target.health !== null && target.maxHealth !== null) {
      const progress = clamp(
        1 -
          (target.health -
            (s.hitClock / C.DRILL_HIT_INTERVAL) *
              C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]) /
            target.maxHealth,
        0,
        1,
      );
      if (Math.abs(feet - (cut.row + progress) * C.TILE) < 0.2) return true;
    }
  }
  const row = Math.floor((feet + 0.1) / C.TILE);
  return (
    Math.abs(feet - row * C.TILE) < 0.2 &&
    [
      Math.floor((m.x + 1) / C.TILE),
      Math.floor((m.x + C.MINER_W - 1) / C.TILE),
    ].some((c) => solid(s, c, row))
  );
}
export function clone(s: StateView): DeepcoreState {
  return {
    ...s,
    resources: s.resources as Resources,
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    camera: { ...s.camera },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    noticesFired: { ...s.noticesFired },
    notice: s.notice ? { ...s.notice } : null,
    summary: s.summary ? { ...s.summary } : null,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    grid: s.grid.map((r) => [...r] as Cell[]),
    effects: s.effects.map((e) => ({ ...e })),
    pendingCues: [...s.pendingCues],
    pointerDown: { ...s.pointerDown },
  };
}
export const BUILDING_RECTS = C.BUILDINGS.map((id, i) => ({
  id,
  x: 120 + i * 330,
  y: C.SURFACE_Y - 160,
  w: 240,
  h: 160,
}));
export function emptyGrid(coreRow: number): Cell[][] {
  return Array.from({ length: coreRow + 1 }, (_, r) =>
    Array.from({ length: C.WORLD_COLS }, (_, c) =>
      cell(
        r === 0
          ? "tunnel"
          : c === 0 || c === C.WORLD_COLS - 1 || r === coreRow
            ? r === coreRow && c === C.CORE_COL
              ? "core"
              : "bedrock"
            : "tunnel",
        bandAt(r, coreRow),
      ),
    ),
  );
}
export function initial(resources: Resources, hasSave = false): DeepcoreState {
  const coreRow = C.STANDARD_ROWS;
  const s: DeepcoreState = {
    resources,
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow,
    menuIndex: 0,
    muted: false,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    coreTimer: null,
    coreGround: null,
    camera: { x: 0, y: 0, lead: 0 },
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      drilling: null,
    },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as Record<
      C.TrackName,
      number
    >,
    items: Object.fromEntries(C.ITEM_IDS.map((t) => [t, 0])) as Record<
      C.ItemId,
      number
    >,
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    installed: 0,
    notice: null,
    noticesFired: { gas: false, lava: false },
    summary: null,
    grid: emptyGrid(coreRow),
    accumulator: 0,
    hitClock: 0,
    hurt: 0,
    animTime: 0,
    effects: [],
    effectId: 0,
    pendingCues: [],
    shake: 0,
    note: "",
    noteTime: 0,
    pointerDown: {},
    panelIndex: 0,
    launchTime: null,
  };
  followCamera(s, 0);
  return s;
}
export function followCamera(s: DeepcoreState, dt: number): void {
  const target =
    Math.abs(s.miner.vy) <= C.CAM_STILL_SPEED
      ? 0
      : Math.sign(s.miner.vy) * C.CAM_LEAD_MAX;
  const rate =
    (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) *
    (s.camera.lead * target <= 0 || Math.abs(target) < Math.abs(s.camera.lead)
      ? C.CAM_UNWIND_MULT
      : 1);
  s.camera.lead += clamp(target - s.camera.lead, -rate * dt, rate * dt);
  s.camera.x = clamp(
    s.miner.x + C.MINER_W / 2 - C.VIEW_W / 2,
    0,
    C.WORLD_W - C.VIEW_W,
  );
  s.camera.y = Math.min(
    s.miner.y + C.MINER_H / 2 - C.VIEW_H / 2 + s.camera.lead,
    (s.coreRow + 1) * C.TILE - C.VIEW_H,
  );
}
export function scanner(s: StateView): {
  locked: boolean;
  target: C.MaterialId | null;
  dirX: number;
  dirY: number;
  distanceTiles: number | null;
} {
  let nearest: {
    id: C.MaterialId;
    dx: number;
    dy: number;
    dist: number;
  } | null = null;
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1];
  const mc = minerCell(s);
  if (range)
    for (let r = 1; r < s.grid.length; r++)
      for (let c = 1; c < C.WORLD_COLS - 1; c++) {
        const t = tile(s, c, r);
        if (t.material && !s.satchel[t.material]) {
          const dx = c - mc.col,
            dy = r - mc.row,
            dist = Math.hypot(dx, dy);
          if (dist <= range && (!nearest || dist < nearest.dist))
            nearest = { id: t.material, dx, dy, dist };
        }
      }
  return nearest
    ? {
        locked: true,
        target: nearest.id,
        dirX: nearest.dist ? nearest.dx / nearest.dist : 0,
        dirY: nearest.dist ? nearest.dy / nearest.dist : 0,
        distanceTiles: nearest.dist,
      }
    : { locked: false, target: null, dirX: 0, dirY: 0, distanceTiles: null };
}
export function effect(
  s: DeepcoreState,
  name: string,
  x: number,
  y: number,
  tint?: string,
): void {
  s.effects.push({
    id: ++s.effectId,
    name,
    x,
    y,
    age: 0,
    ...(tint ? { tint } : {}),
  });
}
export function note(s: DeepcoreState, text: string): void {
  s.note = text;
  s.noteTime = 4;
}
