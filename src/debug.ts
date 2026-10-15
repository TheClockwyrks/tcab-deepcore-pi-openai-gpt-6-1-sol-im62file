import * as C from "./constants";
import {
  BUILDING_RECTS,
  bandAt,
  cell,
  clone,
  depth,
  grounded,
  initial,
  jet,
  loadKg,
  maxFuel,
  maxHull,
  minerCell,
  scanner,
  slotCap,
  slots,
  tile,
  type StateView,
  type DeepcoreState,
} from "./model";
import { controlRect, menuItems, menuRect, type Control } from "./interface";
import { generate, resize } from "./world";
import * as T from "./transactions";
function valid(ok: boolean, message: string): void {
  if (!ok) throw new RangeError(message);
}
function number(
  n: number,
  min = -Infinity,
  max = Infinity,
  integer = false,
): void {
  valid(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
    "Value outside defined domain",
  );
}
function choice<T extends string>(v: T, values: readonly T[]): void {
  valid(values.includes(v), "Unknown identifier");
}
function pose(s: StateView, f: (n: DeepcoreState) => void): DeepcoreState {
  const n = clone(s);
  f(n);
  return n;
}
function address(s: StateView, c: number, r: number): void {
  number(c, 0, C.WORLD_COLS - 1, true);
  number(r, 1, s.coreRow, true);
}
function ore(id: C.OreId): void {
  choice(
    id,
    C.MINERALS.map((m) => m.id),
  );
}
export function snapshot(s: StateView) {
  const load = loadKg(s),
    lift = jet(s).liftLimitKg,
    drilling = s.miner.drilling;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      ...s.miner,
      ...minerCell(s),
      grounded: grounded(s),
      maxFuel: maxFuel(s),
      maxHull: maxHull(s),
      overloaded: load >= lift,
      drilling: drilling
        ? {
            ...drilling,
            progress:
              1 -
              (tile(s, drilling.col, drilling.row).health ?? 1) /
                (tile(s, drilling.col, drilling.row).maxHealth ?? 1),
          }
        : null,
    },
    cargo: {
      slotsUsed: slots(s),
      slotCap: slotCap(s),
      loadKg: load,
      liftLimitKg: lift,
      ore: Object.fromEntries(
        Object.entries(s.cargo).filter(([, n]) => (n ?? 0) > 0),
      ),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? { hazard: s.notice.hazard, shown: s.notice.shown }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
export function createDebug() {
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    snapshot,
    tileAt: (s: StateView, col: number, row: number) => ({
      ...tile(s, col, row),
    }),
    findTile(s: StateView, kind: C.TileKind) {
      choice(kind, C.TILE_KINDS);
      let best: { col: number; row: number } | null = null;
      let dist = Infinity;
      const mc = minerCell(s);
      for (let r = 0; r < s.grid.length; r++)
        for (let c = 0; c < C.WORLD_COLS; c++)
          if (tile(s, c, r).kind === kind) {
            const d = Math.hypot(c - mc.col, r - mc.row);
            if (d < dist) {
              dist = d;
              best = { col: c, row: r };
            }
          }
      return best;
    },
    buildings: (_s: StateView) => BUILDING_RECTS.map((b) => ({ ...b })),
    menuItemRect: menuRect,
    controlRect: (s: StateView, c: Control, subject: string | null) => {
      choice(c, [
        "drop-ore",
        "use-item",
        "jettison",
        "sell",
        "buy-fuel",
        "fill-fuel",
        "buy-repair",
        "repair-full",
        "buy-upgrade",
        "buy-item",
        "fabricate",
        "launch",
        "dismiss-notice",
        "inventory",
        "pause",
        "mute",
      ]);
      if (c === "drop-ore") ore(subject as C.OreId);
      else if (c === "use-item" || c === "buy-item")
        choice(subject as C.ItemId, C.ITEM_IDS);
      else if (c === "buy-upgrade") choice(subject as C.TrackName, C.TRACKS);
      else valid(subject === null, "This control takes no subject");
      return controlRect(s, c, subject);
    },
    reset: (s: StateView) => ({
      ...initial(s.resources as DeepcoreState["resources"], s.hasSave),
      muted: s.muted,
    }),
    reconcile: (s: StateView) => clone(s),
    generateMine: (s: StateView) => pose(s, generate),
    clearMine: (s: StateView) =>
      pose(s, (n) => {
        for (let r = 1; r < n.coreRow; r++)
          for (let c = 1; c < C.WORLD_COLS - 1; c++)
            n.grid[r][c] = cell("tunnel", n.grid[r][c].band);
      }),
    clearCargo: (s: StateView) =>
      pose(s, (n) => {
        n.cargo = {};
      }),
    clearItems: (s: StateView) =>
      pose(s, (n) => {
        for (const id of C.ITEM_IDS) n.items[id] = 0;
      }),
    setTile: (s: StateView, col: number, row: number, kind: C.TileKind) =>
      pose(s, (n) => {
        address(s, col, row);
        choice(kind, [
          "rock",
          "gas",
          "lava",
          "stone",
          "bedrock",
          "tunnel",
          "core",
        ]);
        n.grid[row][col] = cell(kind, bandAt(row, s.coreRow));
      }),
    setOreTile: (s: StateView, col: number, row: number, id: C.OreId) =>
      pose(s, (n) => {
        address(s, col, row);
        ore(id);
        n.grid[row][col] = cell("ore", bandAt(row, s.coreRow), id);
      }),
    setMaterialTile: (
      s: StateView,
      col: number,
      row: number,
      id: C.MaterialId,
    ) =>
      pose(s, (n) => {
        address(s, col, row);
        choice(id, C.MATERIALS);
        n.grid[row][col] = cell("material", bandAt(row, s.coreRow), null, id);
      }),
    setTileHealth: (s: StateView, col: number, row: number, health: number) =>
      pose(s, (n) => {
        address(s, col, row);
        const t = tile(s, col, row);
        valid(t.health !== null, "Cell is not minable");
        number(health, Number.MIN_VALUE, t.maxHealth!);
        n.grid[row][col] = { ...t, health };
      }),
    placeCoreSample: (s: StateView, col: number, row: number) =>
      pose(s, (n) => {
        address(s, col, row);
        valid(
          s.coreTimer === null && tile(s, col, row).kind === "tunnel",
          "Requires open cell and no live Sample",
        );
        n.coreTimer = C.CORE_TIMER;
        n.coreGround = { col, row };
      }),
    setMinerPosition: (s: StateView, x: number, y: number) =>
      pose(s, (n) => {
        number(x);
        number(y);
        n.miner.x = x;
        n.miner.y = y;
      }),
    setMinerVelocity: (s: StateView, vx: number, vy: number) =>
      pose(s, (n) => {
        number(vx);
        number(vy);
        n.miner.vx = vx;
        n.miner.vy = vy;
      }),
    setFacing: (s: StateView, facing: C.Facing) =>
      pose(s, (n) => {
        choice(facing, C.FACINGS);
        n.miner.facing = facing;
      }),
    setFuel: (s: StateView, value: number) =>
      pose(s, (n) => {
        number(value, 0);
        n.miner.fuel = value;
      }),
    setHull: (s: StateView, value: number) =>
      pose(s, (n) => {
        number(value, 0);
        n.miner.hull = value;
      }),
    setMinerTravel: (s: StateView, enabled: boolean) =>
      pose(s, (n) => {
        valid(typeof enabled === "boolean", "Expected boolean");
        n.miner.travel = enabled;
      }),
    setMinerDrill: (s: StateView, enabled: boolean) =>
      pose(s, (n) => {
        valid(typeof enabled === "boolean", "Expected boolean");
        n.miner.drill = enabled;
      }),
    setScreen: (s: StateView, screen: C.ScreenName) =>
      pose(s, (n) => {
        choice(screen, C.SCREENS);
        n.screen = screen;
      }),
    setPanel: (s: StateView, panel: C.PanelId | null) =>
      pose(s, (n) => {
        if (panel !== null) choice(panel, C.PANELS);
        n.panel = panel;
      }),
    setMenuIndex: (s: StateView, index: number) =>
      pose(s, (n) => {
        number(index, 0, menuItems(s).length - 1, true);
        n.menuIndex = index;
      }),
    setMode: (s: StateView, mode: C.Mode) =>
      pose(s, (n) => {
        choice(mode, C.MODES);
        n.mode = mode;
      }),
    setWorldSize: (s: StateView, size: C.WorldSize) =>
      pose(s, (n) => {
        choice(size, C.WORLD_SIZES);
        resize(n, size);
      }),
    setCredits: (s: StateView, value: number) =>
      pose(s, (n) => {
        number(value, 0);
        n.credits = value;
      }),
    setTier: (s: StateView, track: C.TrackName, tier: number) =>
      pose(s, (n) => {
        choice(track, C.TRACKS);
        number(tier, 1, C.MAX_TIER[track], true);
        n.tiers[track] = tier;
        n.miner.fuel = Math.min(n.miner.fuel, maxFuel(n));
        n.miner.hull = Math.min(n.miner.hull, maxHull(n));
      }),
    setCargo: (s: StateView, id: C.OreId, count: number) =>
      pose(s, (n) => {
        ore(id);
        number(count, 0, Infinity, true);
        if (count) n.cargo[id] = count;
        else delete n.cargo[id];
      }),
    setMaterial: (s: StateView, id: C.MaterialId, count: number) =>
      pose(s, (n) => {
        choice(id, C.MATERIALS);
        number(count, 0, Infinity, true);
        n.satchel[id] = count;
      }),
    setCoreCarried: (s: StateView, carried: boolean) =>
      pose(s, (n) => {
        valid(typeof carried === "boolean", "Expected boolean");
        if (carried) {
          valid(s.coreTimer === null, "Sample already live");
          n.satchel.coreSample = true;
          n.coreTimer = C.CORE_TIMER;
        } else if (s.satchel.coreSample) {
          n.satchel.coreSample = false;
          n.coreTimer = null;
        }
      }),
    setCoreTimer: (s: StateView, seconds: number) =>
      pose(s, (n) => {
        valid(s.coreTimer !== null, "No live Sample");
        number(seconds, Number.MIN_VALUE);
        n.coreTimer = seconds;
      }),
    setItemCount: (s: StateView, id: C.ItemId, count: number) =>
      pose(s, (n) => {
        choice(id, C.ITEM_IDS);
        number(count, 0, Infinity, true);
        n.items[id] = count;
      }),
    setRocketInstalled: (s: StateView, count: number) =>
      pose(s, (n) => {
        number(count, 0, C.ROCKET_COMPONENTS.length, true);
        n.installed = count;
      }),
    setNoticeFired: (s: StateView, hazard: C.NoticeHazard, fired: boolean) =>
      pose(s, (n) => {
        choice(hazard, C.NOTICE_HAZARDS);
        valid(typeof fired === "boolean", "Expected boolean");
        n.noticesFired[hazard] = fired;
      }),
    setCameraLead: (s: StateView, lead: number) =>
      pose(s, (n) => {
        number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
        n.camera.lead = lead;
      }),
    setElapsed: (s: StateView, seconds: number) =>
      pose(s, (n) => {
        number(seconds, 0);
        n.elapsedSeconds = seconds;
      }),
    clearSave: (s: StateView) => pose(s, T.clearSave),
    setNextTeleportHeight: (s: StateView, tiles: number | null) =>
      pose(s, (n) => {
        if (tiles !== null)
          number(
            tiles,
            C.TELEPORT_HEIGHT_TILES_MIN,
            C.TELEPORT_HEIGHT_TILES_MAX,
            true,
          );
        n.nextTeleportHeight = tiles;
      }),
    setNextTeleportSpeed: (s: StateView, speed: number | null) =>
      pose(s, (n) => {
        if (speed !== null)
          number(speed, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
        n.nextTeleportSpeed = speed;
      }),
    dropOre: (s: StateView, id: C.OreId) =>
      pose(s, (n) => {
        ore(id);
        T.dropOre(n, id);
      }),
    sell: (s: StateView) => pose(s, T.sell),
    buyFuel: (s: StateView) => pose(s, (n) => T.service(n, "fuel", false)),
    fillFuel: (s: StateView) => pose(s, (n) => T.service(n, "fuel", true)),
    buyRepair: (s: StateView) => pose(s, (n) => T.service(n, "hull", false)),
    repairFull: (s: StateView) => pose(s, (n) => T.service(n, "hull", true)),
    buyUpgrade: (s: StateView, track: C.TrackName) =>
      pose(s, (n) => {
        choice(track, C.TRACKS);
        T.buyUpgrade(n, track);
      }),
    buyItem: (s: StateView, id: C.ItemId) =>
      pose(s, (n) => {
        choice(id, C.ITEM_IDS);
        T.buyItem(n, id);
      }),
    useItem: (s: StateView, id: C.ItemId) =>
      pose(s, (n) => {
        choice(id, C.ITEM_IDS);
        T.useItem(n, id);
      }),
    jettison: (s: StateView) => pose(s, T.jettison),
    fabricate: (s: StateView) => pose(s, T.fabricate),
    launch: (s: StateView) => pose(s, T.launch),
    save: (s: StateView) => pose(s, T.save),
    dismissNotice: (s: StateView) =>
      pose(s, (n) => {
        n.notice = null;
      }),
  };
}
export type DeepcoreDebugApi = ReturnType<typeof createDebug>;
