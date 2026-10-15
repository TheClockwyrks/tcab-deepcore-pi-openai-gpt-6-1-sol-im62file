import * as C from "./constants";
import {
  MINERAL_TINT,
  ROCK_TINT,
  cell,
  clamp,
  depth,
  effect,
  followCamera,
  grounded,
  jet,
  loadKg,
  note,
  slotCap,
  slots,
  solid,
  tile,
  type DeepcoreState,
} from "./model";
import { checkDeath, damage, finish, gasBlast } from "./transactions";
export interface Held {
  left: number;
  right: number;
  down: number;
  up: number;
}
export const STEP = 1 / 120;
function breakCell(s: DeepcoreState, col: number, row: number): void {
  const t = tile(s, col, row);
  s.grid[row][col] = cell("tunnel", t.band);
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  if (t.ore) {
    if (slots(s) < slotCap(s)) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      s.pendingCues.push(C.CUES.orePickup);
      effect(s, "ore-sparkle", x, y, MINERAL_TINT[t.ore]);
    } else note(s, "cargo full — ore lost");
  }
  if (t.material) {
    s.satchel[t.material]++;
    s.pendingCues.push(C.CUES.materialChime);
    effect(
      s,
      "material-shimmer",
      x,
      y,
      t.material === "resonite" ? "#a6f4b3" : "#8fd7ff",
    );
    note(s, `${t.material.toUpperCase()} secured`);
  }
  if (t.kind === "gas") gasBlast(s, col, row);
  if (t.kind === "lava") {
    damage(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    s.pendingCues.push(C.CUES.lavaSizzle);
    effect(s, "lava-embers", x, y);
  }
}
function drill(s: DeepcoreState, h: Held, dt: number): boolean {
  const m = s.miner;
  const onGround = grounded(s);
  const old = m.drilling;
  let target: typeof m.drilling = null;
  if (m.drill && m.fuel > 0 && !h.up && onGround) {
    if (h.down) {
      target =
        old?.dir === "down"
          ? { ...old }
          : {
              col: Math.floor((m.x + C.MINER_W / 2) / C.TILE),
              row: Math.round((m.y + C.MINER_H) / C.TILE),
              dir: "down",
            };
    } else if (h.left || h.right) {
      const right = h.right > h.left;
      const edge = right ? m.x + C.MINER_W : m.x;
      const wall = right
        ? Math.ceil((edge - 0.05) / C.TILE)
        : Math.floor((edge + 0.05) / C.TILE) - 1;
      if (Math.abs(edge - (right ? wall : wall + 1) * C.TILE) < 0.2)
        target = {
          col: wall,
          row: Math.floor((m.y + C.MINER_H / 2) / C.TILE),
          dir: right ? "right" : "left",
        };
    }
  }
  if (target) {
    const t = tile(s, target.col, target.row);
    if (
      t.health === null &&
      !(t.kind === "core" && target.dir === "down" && s.coreTimer === null)
    )
      target = null;
  }
  if (!target) {
    m.drilling = null;
    s.hitClock = 0;
    return false;
  }
  if (
    !old ||
    old.col !== target.col ||
    old.row !== target.row ||
    old.dir !== target.dir
  )
    s.hitClock = 0;
  m.drilling = target;
  s.hitClock += dt;
  const { col, row } = target;
  while (s.hitClock + 1e-9 >= C.DRILL_HIT_INTERVAL && m.fuel > 0) {
    s.hitClock -= C.DRILL_HIT_INTERVAL;
    m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
    const t = tile(s, col, row);
    if (t.kind === "core") {
      s.satchel.coreSample = true;
      s.coreTimer = C.CORE_TIMER;
      effect(s, "core-extract", (col + 0.5) * C.TILE, row * C.TILE);
      s.pendingCues.push(C.CUES.materialChime);
      note(s, "CORE SAMPLE EXTRACTED — 90 seconds to ignition");
      m.drilling = null;
      break;
    }
    const health = (t.health ?? 0) - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
    if (health <= 0) {
      breakCell(s, col, row);
      if (
        target.dir === "down" &&
        m.travel &&
        solid(s, col, row + 1) &&
        tile(s, col, row + 1).kind !== "lava"
      )
        m.y = (row + 1) * C.TILE - C.MINER_H;
      m.drilling = null;
      break;
    }
    s.grid[row][col] = { ...t, health };
  }
  if (m.drilling?.dir === "down" && m.travel) {
    const t = tile(s, col, row);
    if (
      t.health !== null &&
      solid(s, col, row + 1) &&
      tile(s, col, row + 1).kind !== "lava"
    ) {
      const progress = clamp(
        1 -
          (t.health -
            (s.hitClock / C.DRILL_HIT_INTERVAL) *
              C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]) /
            (t.maxHealth ?? 1),
        0,
        1,
      );
      m.y = row * C.TILE - C.MINER_H + progress * C.TILE;
      m.vy = 0;
    }
  }
  if (
    Math.floor(s.elapsedSeconds * 15) !==
    Math.floor((s.elapsedSeconds - dt) * 15)
  )
    effect(
      s,
      "drill-debris",
      target.dir === "down"
        ? m.x + (m.facing === "east" ? 40 : C.MINER_W - 40)
        : target.dir === "right"
          ? m.x + C.MINER_W + 10
          : m.x - 10,
      target.dir === "down" ? m.y + C.MINER_H : m.y + C.MINER_H * 0.65,
      ROCK_TINT[tile(s, col, row).band ?? "topsoil"],
    );
  return true;
}
function move(s: DeepcoreState, h: Held, dt: number, cutting: boolean): void {
  const m = s.miner;
  const dir = h.right - h.left;
  const wasGrounded = grounded(s);
  const load = loadKg(s) / jet(s).liftLimitKg;
  const thrust = h.up > 0 && m.fuel > 0;
  if (dir) m.facing = dir > 0 ? "east" : "west";
  if (!wasGrounded && dir && m.fuel > 0)
    m.fuel = Math.max(0, m.fuel - C.AIR_BURN * dt);
  if (thrust) {
    const up = Math.max(0, -m.vy);
    m.fuel = Math.max(
      0,
      m.fuel -
        (C.THRUST_BURN_MAX +
          (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
            Math.min(1, up / C.CRUISE_SPEED)) *
          C.THRUST_BURN_SIZE_MULT[s.worldSize] *
          dt,
    );
  }
  if (
    thrust &&
    Math.floor(s.elapsedSeconds * 15) !==
      Math.floor((s.elapsedSeconds - dt) * 15)
  )
    effect(
      s,
      "jetpack-exhaust",
      m.x + (m.facing === "east" ? 2 : C.MINER_W - 2),
      m.y + C.MINER_H - 12,
    );
  if (!m.travel) return;
  if (s.hurt <= 0) m.vx = dir * C.WALK_SPEED;
  let x = clamp(m.x + m.vx * dt, C.TILE, C.WORLD_W - C.TILE - C.MINER_W);
  const r0 = Math.floor((m.y + 0.1) / C.TILE),
    r1 = Math.floor((m.y + C.MINER_H - 0.1) / C.TILE);
  for (let r = r0; r <= r1; r++) {
    if (m.vx > 0) {
      const c = Math.floor((x + C.MINER_W - 0.01) / C.TILE);
      if (solid(s, c, r)) {
        x = Math.min(x, c * C.TILE - C.MINER_W);
        m.vx = 0;
      }
    }
    if (m.vx < 0) {
      const c = Math.floor((x + 0.01) / C.TILE);
      if (solid(s, c, r)) {
        x = Math.max(x, (c + 1) * C.TILE);
        m.vx = 0;
      }
    }
  }
  m.x = x;
  if (cutting && m.drilling?.dir === "down") return;
  if (thrust)
    m.vy = Math.max(
      -jet(s).emptyClimb * (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
      m.vy - jet(s).emptyAccel * Math.max(0, 1 - load) * dt,
    );
  else
    m.vy = Math.min(
      C.FALL_TERMINAL_EMPTY +
        (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) * Math.min(1, load),
      m.vy + C.GRAVITY * dt,
    );
  let y = m.y + m.vy * dt;
  const cols = [
    Math.floor((m.x + 0.1) / C.TILE),
    Math.floor((m.x + C.MINER_W - 0.1) / C.TILE),
  ];
  if (m.vy >= 0) {
    const r = Math.floor((y + C.MINER_H) / C.TILE);
    if (cols.some((c) => solid(s, c, r))) {
      y = r * C.TILE - C.MINER_H;
      const amount =
        Math.max(0, m.vy - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
      if (amount > 0) {
        damage(s, amount);
        s.shake = Math.max(2, amount * 0.2);
        s.pendingCues.push(C.CUES.impact);
        effect(s, "impact-dust", m.x + C.MINER_W / 2, y + C.MINER_H);
      }
      m.vy = 0;
    }
  } else {
    const r = Math.floor(y / C.TILE);
    if (cols.some((c) => solid(s, c, r))) {
      y = (r + 1) * C.TILE;
      m.vy = 0;
    }
  }
  m.y = y;
}
function timers(s: DeepcoreState, dt: number): void {
  if (s.coreTimer !== null) {
    s.coreTimer = Math.max(0, s.coreTimer - dt);
    if (s.coreTimer <= 1e-9) {
      const g = s.coreGround;
      const x = g ? (g.col + 0.5) * C.TILE : s.miner.x + C.MINER_W / 2,
        y = g ? (g.row + 0.5) * C.TILE : s.miner.y + C.MINER_H / 2;
      effect(s, "core-detonation", x, y);
      s.pendingCues.push(C.CUES.gasExplosion);
      s.shake = 35;
      const kills =
        s.satchel.coreSample ||
        Math.hypot(
          s.miner.x + C.MINER_W / 2 - x,
          s.miner.y + C.MINER_H / 2 - y,
        ) <=
          C.CORE_BLAST_TILES * C.TILE;
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (kills) finish(s, "core-detonation");
    }
  }
  if (s.notice) {
    s.notice.age += dt;
    s.notice.shown = s.notice.age >= C.NOTICE_DELAY;
    if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
  }
}
/** Mutates only the next-frame draft. No renderer, host clock, or input device is read here. */
export function step(s: DeepcoreState, h: Held, dt: number): void {
  checkDeath(s);
  if (s.screen !== "in-mine") return;
  s.elapsedSeconds += dt;
  s.hurt = Math.max(0, s.hurt - dt);
  s.animTime += dt;
  timers(s, dt);
  checkDeath(s);
  if (s.screen !== "in-mine") return;
  if (s.launchTime !== null) {
    s.launchTime += dt;
    if (s.launchTime >= 3 - 1e-9) finish(s, null);
    return;
  }
  if (!s.panel) {
    const cutting = drill(s, h, dt);
    move(s, h, dt, cutting);
    if (depth(s) > 0)
      s.miner.fuel = Math.max(0, s.miner.fuel - C.LIFE_SUPPORT_BURN * dt);
    const m = s.miner;
    let touchingLava = false;
    for (
      let r = Math.floor(m.y / C.TILE);
      r <= Math.floor((m.y + C.MINER_H) / C.TILE);
      r++
    )
      for (
        let c = Math.floor(m.x / C.TILE);
        c <= Math.floor((m.x + C.MINER_W) / C.TILE);
        c++
      )
        if (
          tile(s, c, r).kind === "lava" &&
          !(m.drilling?.col === c && m.drilling.row === r)
        )
          touchingLava = true;
    if (touchingLava) {
      damage(
        s,
        C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) * dt,
        "lava",
      );
      if (
        Math.floor(s.elapsedSeconds * 5) !==
        Math.floor((s.elapsedSeconds - dt) * 5)
      ) {
        effect(s, "lava-embers", m.x, m.y + C.MINER_H);
        s.pendingCues.push(C.CUES.lavaSizzle);
      }
    }
    const state: C.MinerState = m.drilling
      ? m.drilling.dir === "down"
        ? "drill-down"
        : "drill-side"
      : s.hurt > 0
        ? "hurt"
        : m.fuel <= 0 && depth(s) > 0
          ? "fuel-out"
          : h.up && m.fuel > 0
            ? "jetpack"
            : m.travel && !grounded(s)
              ? "fall"
              : m.travel && Math.abs(m.vx) > 0
                ? "walk"
                : "idle";
    if (m.state !== state) s.animTime = 0;
    m.state = state;
  } else {
    s.miner.drilling = null;
    s.hitClock = 0;
  }
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  checkDeath(s);
  followCamera(s, dt);
}
