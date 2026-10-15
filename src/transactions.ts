import * as C from "./constants";
import {
  cell,
  clone,
  depth,
  effect,
  initial,
  maxFuel,
  maxHull,
  minerCell,
  note,
  tile,
  type DeepcoreState,
  type StateView,
} from "./model";
import { generate, resize } from "./world";
const SAVE_KEY = "deepcore.expedition.v1";
interface SavedExpedition {
  format: 1;
  data: Pick<
    DeepcoreState,
    | "mode"
    | "worldSize"
    | "credits"
    | "tiers"
    | "installed"
    | "items"
    | "cargo"
    | "satchel"
    | "noticesFired"
  >;
  fuel: number;
  hull: number;
  palette: DeepcoreState["grid"][number];
  indices: number[][];
}
export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}
export function clearSave(s: DeepcoreState): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
  s.hasSave = false;
}
export function save(s: DeepcoreState): void {
  if (s.coreTimer !== null) {
    note(s, "SAVE REFUSED — unstable Core Sample");
    return;
  }
  try {
    // Terrain is palette-indexed, so even a Marathon save stays far below browser quotas.
    const palette: DeepcoreState["grid"][number] = [],
      lookup = new Map<string, number>();
    const indices = s.grid.map((row) =>
      row.map((t) => {
        const key = JSON.stringify(t);
        let id = lookup.get(key);
        if (id === undefined) {
          id = palette.length;
          palette.push({ ...t });
          lookup.set(key, id);
        }
        return id;
      }),
    );
    const {
      mode,
      worldSize,
      credits,
      tiers,
      installed,
      items,
      cargo,
      satchel,
      noticesFired,
    } = s;
    const payload: SavedExpedition = {
      format: 1,
      data: {
        mode,
        worldSize,
        credits,
        tiers,
        installed,
        items,
        cargo,
        satchel,
        noticesFired,
      },
      fuel: s.miner.fuel,
      hull: s.miner.hull,
      palette,
      indices,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    s.hasSave = true;
    note(s, "EXPEDITION SAVED — return here before your next descent");
  } catch {
    note(s, "Storage unavailable — expedition not saved");
  }
}
export function restore(s: StateView): DeepcoreState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as SavedExpedition;
      if (
        p.format !== 1 ||
        !Array.isArray(p.indices) ||
        !Array.isArray(p.palette) ||
        !C.WORLD_SIZES.includes(p.data.worldSize)
      )
        throw new Error("Invalid save");
      const n = initial(s.resources as DeepcoreState["resources"], true);
      Object.assign(n, p.data);
      n.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[n.worldSize]);
      if (
        p.indices.length !== n.coreRow + 1 ||
        p.indices.some((r) => r.length !== C.WORLD_COLS)
      )
        throw new Error("Invalid grid");
      n.grid = p.indices.map((row) =>
        row.map((id) => {
          if (!p.palette[id]) throw new Error("Invalid cell");
          return { ...p.palette[id] };
        }),
      );
      n.miner.fuel = p.fuel;
      n.miner.hull = p.hull;
      n.screen = "in-mine";
      n.muted = s.muted;
      return n;
    }
  } catch {
    /* An unreadable save cannot prevent playing. */
  }
  return clone(s);
}
export function start(s: StateView): DeepcoreState {
  const n = initial(s.resources as DeepcoreState["resources"]);
  n.mode = s.mode;
  resize(n, s.worldSize);
  generate(n);
  n.screen = "in-mine";
  n.muted = s.muted;
  clearSave(n);
  return n;
}
export function finish(s: DeepcoreState, cause: C.DeathCause | null): void {
  if (s.screen === "game-over" || s.screen === "victory") return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
  s.panel = null;
  s.menuIndex = 0;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  s.notice = null;
  if (cause === "fuel-out" && !s.miner.drilling) s.miner.state = "fuel-out";
  if (cause) {
    s.screen = "game-over";
    s.pendingCues.push(C.CUES.death);
    effect(
      s,
      "death-burst",
      s.miner.x + C.MINER_W / 2,
      s.miner.y + C.MINER_H / 2,
    );
    s.cargo = {};
    if (s.mode === "hardcore") clearSave(s);
  } else {
    s.screen = "victory";
    clearSave(s);
  }
}
export function checkDeath(s: DeepcoreState): void {
  if (s.screen !== "in-mine" && s.screen !== "paused") return;
  if (s.miner.hull <= 0) finish(s, "hull-destroyed");
  else if (s.miner.fuel <= 0 && depth(s) > 0) finish(s, "fuel-out");
}
function confirm(s: DeepcoreState, text: string): void {
  note(s, text);
  s.pendingCues.push(C.CUES.fabricate);
}
export function dropOre(s: DeepcoreState, id: C.OreId): void {
  if ((s.cargo[id] ?? 0) > 0) {
    s.cargo[id]!--;
    if (!s.cargo[id]) delete s.cargo[id];
  }
}
export function sell(s: DeepcoreState): void {
  const value = C.MINERALS.reduce(
    (v, m) => v + (s.cargo[m.id] ?? 0) * m.value,
    0,
  );
  s.credits += value;
  s.creditsEarned += value;
  s.cargo = {};
  confirm(s, `SOLD — ${value} Credits banked`);
}
export function service(
  s: DeepcoreState,
  kind: "fuel" | "hull",
  full: boolean,
): void {
  const maximum = kind === "fuel" ? maxFuel(s) : maxHull(s);
  const price = kind === "fuel" ? C.FUEL_PRICE : C.REPAIR_PRICE;
  const increment =
    kind === "fuel" ? C.FUEL_BUY_INCREMENT : C.REPAIR_BUY_INCREMENT;
  const missing = Math.max(0, maximum - s.miner[kind]);
  const amount = full
    ? Math.min(missing, s.credits / price)
    : Math.min(missing, increment);
  if (amount <= 0 || s.credits < amount * price) {
    note(s, "No service available — check Credits and capacity");
    return;
  }
  s.credits -= amount * price;
  s.miner[kind] += amount;
  confirm(s, `${kind.toUpperCase()} +${amount.toFixed(0)}`);
}
export function buyUpgrade(s: DeepcoreState, track: C.TrackName): void {
  const tier = s.tiers[track],
    cost = C.UPGRADE_PRICES[tier - 1];
  if (tier >= C.MAX_TIER[track] || s.credits < cost) {
    note(s, "Upgrade unavailable — insufficient Credits or maximum tier");
    return;
  }
  const f = maxFuel(s),
    h = maxHull(s);
  s.credits -= cost;
  s.tiers[track]++;
  s.miner.fuel += maxFuel(s) - f;
  s.miner.hull += maxHull(s) - h;
  confirm(s, `${track.toUpperCase()} upgraded to tier ${tier + 1}`);
}
export function buyItem(s: DeepcoreState, id: C.ItemId): void {
  const item = C.ITEMS.find((i) => i.id === id)!;
  if (s.credits < item.price) {
    note(s, "Not enough Credits");
    return;
  }
  s.credits -= item.price;
  s.items[id]++;
  confirm(s, `${item.name} added to supplies`);
}
export function damage(
  s: DeepcoreState,
  amount: number,
  hazard?: C.NoticeHazard,
): void {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, shown: false, age: 0 };
  }
}
export function gasBlast(s: DeepcoreState, col: number, row: number): void {
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  effect(s, "gas-explosion", x, y);
  s.pendingCues.push(C.CUES.gasExplosion);
  s.shake = 14;
  const dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y,
    dist = Math.hypot(dx, dy);
  if (dist <= C.GAS_BLAST_TILES * C.TILE) {
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, (row - 1) / (s.coreRow - 1) - 0.25)) /
          0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (dist || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (dist || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function useItem(s: DeepcoreState, id: C.ItemId): void {
  if (!s.items[id]) {
    note(s, "No supply held");
    return;
  }
  const mc = minerCell(s);
  if (id === "nanobots" || id === "emergency-fuel") {
    const key = id === "nanobots" ? "hull" : "fuel",
      max = key === "hull" ? maxHull(s) : maxFuel(s),
      gain = key === "hull" ? C.NANOBOT_HULL : C.EMERGENCY_FUEL;
    if (s.miner[key] >= max) {
      note(s, "Already at capacity");
      return;
    }
    s.miner[key] = Math.min(max, s.miner[key] + gain);
    effect(
      s,
      "material-shimmer",
      s.miner.x + C.MINER_W / 2,
      s.miner.y + C.MINER_H / 2,
    );
  } else if (id === "quantum-teleporter" || id === "matter-transmitter") {
    const height =
      id === "quantum-teleporter"
        ? (s.nextTeleportHeight ??
          C.TELEPORT_HEIGHT_TILES_MIN +
            Math.floor(
              Math.random() *
                (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN + 1),
            ))
        : 0;
    const speed =
      id === "quantum-teleporter"
        ? (s.nextTeleportSpeed ??
          C.TELEPORT_SPEED_MIN +
            Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN))
        : 0;
    if (
      !height &&
      s.miner.y === C.SURFACE_Y - C.MINER_H &&
      s.miner.vx === 0 &&
      s.miner.vy === 0
    ) {
      note(s, "Already at camp");
      return;
    }
    s.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
    s.miner.y = C.SURFACE_Y - C.MINER_H - height * C.TILE;
    s.miner.vx = 0;
    s.miner.vy = speed;
    s.miner.drilling = null;
    if (id === "quantum-teleporter") {
      s.nextTeleportHeight = null;
      s.nextTeleportSpeed = null;
    }
    effect(s, "core-extract", s.miner.x, s.miner.y);
  } else {
    const radius =
      id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
    let changed = false;
    for (let row = mc.row - radius; row <= mc.row + radius; row++)
      for (let col = mc.col - radius; col <= mc.col + radius; col++) {
        const t = tile(s, col, row);
        if (
          row < 1 ||
          row >= s.coreRow ||
          col < 1 ||
          col >= C.WORLD_COLS - 1 ||
          ["bedrock", "material", "core", "tunnel"].includes(t.kind)
        )
          continue;
        changed = true;
        s.grid[row][col] = cell("tunnel", t.band);
        if (t.kind === "gas") gasBlast(s, col, row);
      }
    if (!changed) {
      note(s, "No breakable terrain in blast range");
      return;
    }
    effect(s, "gas-explosion", s.miner.x, s.miner.y);
    s.pendingCues.push(C.CUES.gasExplosion);
    s.shake = 12;
    s.miner.drilling = null;
  }
  s.items[id]--;
  confirm(s, "SUPPLY USED");
  checkDeath(s);
}
export function jettison(s: DeepcoreState): void {
  if (s.satchel.coreSample) {
    s.satchel.coreSample = false;
    s.coreGround = minerCell(s);
    note(s, "SAMPLE JETTISONED — move clear of the blast");
  } else note(s, "No Core Sample carried");
}
export function fabricate(s: DeepcoreState): void {
  const comp = C.ROCKET_COMPONENTS[s.installed];
  if (!comp) {
    note(s, "Rocket is launch-ready");
    return;
  }
  const held =
    comp.material === null ||
    (comp.material === "core-sample"
      ? s.satchel.coreSample
      : s.satchel[comp.material] > 0);
  if (!held || s.credits < comp.credits) {
    note(s, "Fabrication requires Credits and the listed material");
    return;
  }
  s.credits -= comp.credits;
  if (comp.material === "core-sample") {
    s.satchel.coreSample = false;
    s.coreTimer = null;
  } else if (comp.material) s.satchel[comp.material]--;
  s.installed++;
  confirm(s, `${comp.name} INSTALLED`);
}
export function launch(s: DeepcoreState): void {
  if (s.installed !== C.ROCKET_COMPONENTS.length) {
    note(s, "Complete all five rocket components first");
    return;
  }
  s.launchTime = 0;
  s.screen = "in-mine";
  s.menuIndex = 0;
  s.panel = null;
  s.pendingCues.push(C.CUES.launch);
  const b = C.BUILDINGS.indexOf("launch-pad");
  effect(s, "launch-exhaust", 120 + b * 330 + 120, C.SURFACE_Y);
  clearSave(s);
}
