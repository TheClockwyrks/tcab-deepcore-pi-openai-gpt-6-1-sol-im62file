import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  BUILDING_RECTS,
  clamp,
  depth,
  jet,
  loadKg,
  maxFuel,
  maxHull,
  scanner,
  tile,
  type StateView,
} from "./model";
import {
  buttons,
  cargoLine,
  menuItems,
  menuRect,
  upgradeDescription,
  type Rect,
} from "./interface";
export const BACKGROUND = "#101c29";
const INK = "#e3e9d9",
  MUTED = "#91abb2",
  GOLD = "#ecc386",
  TEAL = "#88d4c4";
export function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = INK,
  font = "monospace",
): void {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}
function box(ctx: CanvasRenderingContext2D, r: Rect, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}
function border(ctx: CanvasRenderingContext2D, r: Rect, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  s: StateView,
  path: string,
  x: number,
  y: number,
  w = 80,
  h = 80,
): void {
  const im = s.resources.images[path];
  if (im) ctx.drawImage(im, x, y, w, h);
}
function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function shaped(
  ctx: CanvasRenderingContext2D,
  s: StateView,
  col: number,
  row: number,
  kind: string,
  draw: () => void,
): void {
  const x = col * C.TILE,
    y = row * C.TILE,
    pad = 7;
  ctx.save();
  round(ctx, x + pad, y + pad, C.TILE - 2 * pad, C.TILE - 2 * pad, 13);
  ctx.clip();
  draw();
  ctx.restore();
  const open = (c: number, r: number): boolean =>
    (r === 0 && kind === "tunnel") || tile(s, c, r).kind === kind;
  // Adjacent cells join through their shared edge; diagonal-only contacts do not.
  for (const [dx, dy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ])
    if (open(col + dx, row + dy)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        dx ? x + (dx > 0 ? C.TILE / 2 : 0) : x + pad,
        dy ? y + (dy > 0 ? C.TILE / 2 : 0) : y + pad,
        dx ? C.TILE / 2 : C.TILE - 2 * pad,
        dy ? C.TILE / 2 : C.TILE - 2 * pad,
      );
      ctx.clip();
      draw();
      ctx.restore();
    }
  // Keep a rounded convex dirt nub where solid diagonals poke into a junction.
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    if (open(col + dx, row) && open(col, row + dy)) {
      const cx = x + (dx > 0 ? C.TILE : 0),
        cy = y + (dy > 0 ? C.TILE : 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, C.TILE, C.TILE);
      ctx.clip();
      if (open(col + dx, row + dy)) {
        ctx.beginPath();
        ctx.rect(
          cx - (dx > 0 ? C.TILE / 2 : 0),
          cy - (dy > 0 ? C.TILE / 2 : 0),
          C.TILE / 2,
          C.TILE / 2,
        );
        ctx.clip();
        draw();
      } else {
        ctx.beginPath();
        ctx.rect(cx - (dx > 0 ? 20 : 0), cy - (dy > 0 ? 20 : 0), 20, 20);
        ctx.clip();
        draw();
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.clip();
        sprite(
          ctx,
          s,
          `tiles/${tile(s, col, row).band ?? "topsoil"}-${(col * 13 + row * 7) % C.TILE_VARIANTS}.png`,
          x,
          y,
        );
      }
      ctx.restore();
    }
}
function drawEffect(
  ctx: CanvasRenderingContext2D,
  s: StateView,
  name: string,
  x: number,
  y: number,
  age: number,
  id: number,
  scale = 1,
  tint?: string,
): void {
  const source = s.resources.systems[name];
  if (!source) return;
  const system = tint
    ? {
        ...source,
        emitters: source.emitters.map((e) => ({
          ...e,
          particle: {
            ...e.particle,
            colorGradient: e.particle?.colorGradient?.map((c, i) =>
              i === 0 ? { ...c, color: tint } : c,
            ),
          },
        })),
      }
    : source;
  // Neutralize the binding's device-canvas fit: authored units stay world units,
  // including round particles at non-square aspect ratios and high device DPI.
  const fitted = {
    ...system,
    field: { width: ctx.canvas.width, height: ctx.canvas.height },
  } as ParticleSystem;
  ctx.save();
  ctx.translate(
    x - (source.field.width / 2) * scale,
    y - (ctx.canvas.height - source.field.height / 2) * scale,
  );
  ctx.scale(scale, scale);
  // Reconstruct the seeded visual projection at its state-carried age. Rendering
  // twice cannot advance an effect or make the simulation depend on a canvas.
  ctx.globalAlpha = 0;
  const player = new ParticleCanvasPlayer(fitted, ctx, {
    seed: id,
    clear: false,
    pixelRadius:
      name === "drill-debris" ? 1.5 : name === "jetpack-exhaust" ? 2 : 4,
    composite:
      name.includes("dust") || name.includes("seep") || name === "drill-debris"
        ? "source-over"
        : "lighter",
  });
  ctx.globalAlpha = 1;
  player.update(Math.max(0.001, age));
  ctx.restore();
}
export function world(ctx: CanvasRenderingContext2D, s: StateView): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  const shake = s.shake;
  ctx.translate(
    -s.camera.x + (shake ? Math.sin(s.elapsedSeconds * 81) * shake : 0),
    C.HUD_H -
      s.camera.y +
      (shake ? Math.cos(s.elapsedSeconds * 67) * shake * 0.5 : 0),
  );
  // The produced sky extends into the unbounded atmosphere.
  ctx.fillStyle = "#152736";
  ctx.fillRect(s.camera.x, s.camera.y, C.VIEW_W, C.VIEW_H);
  sprite(ctx, s, "surface/sky.png", s.camera.x, -440, 1280, 520);
  const minRow = Math.max(1, Math.floor(s.camera.y / C.TILE)),
    maxRow = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
  const minCol = Math.max(0, Math.floor(s.camera.x / C.TILE)),
    maxCol = Math.min(
      C.WORLD_COLS - 1,
      Math.ceil((s.camera.x + C.VIEW_W) / C.TILE),
    );
  for (let r = minRow; r <= maxRow; r++)
    for (let c = minCol; c <= maxCol; c++) {
      const t = tile(s, c, r),
        x = c * C.TILE,
        y = r * C.TILE;
      const base = `tiles/${t.band ?? "topsoil"}-${(c * 13 + r * 7) % C.TILE_VARIANTS}.png`;
      sprite(ctx, s, t.kind === "bedrock" ? "tiles/bedrock.png" : base, x, y);
      if (t.kind === "tunnel")
        shaped(ctx, s, c, r, "tunnel", () =>
          sprite(ctx, s, "tiles/tunnel.png", x, y),
        );
      else if (t.kind === "lava")
        shaped(ctx, s, c, r, "lava", () =>
          sprite(
            ctx,
            s,
            `hazards/lava/frame0${Math.floor(s.elapsedSeconds * 6) % 3}.png`,
            x,
            y,
          ),
        );
      else if (t.kind === "stone")
        sprite(ctx, s, `tiles/stone-${(r + c) % 2}.png`, x, y);
      else if (t.ore) sprite(ctx, s, `ore/${t.ore}.png`, x, y);
      else if (t.material) sprite(ctx, s, `materials/${t.material}.png`, x, y);
      else if (t.kind === "core") sprite(ctx, s, "materials/core.png", x, y);
      if (t.health !== null && t.maxHealth !== null && t.health < t.maxHealth)
        sprite(
          ctx,
          s,
          `tiles/crack/frame0${Math.min(C.CRACK_FRAMES - 1, Math.floor((1 - t.health / t.maxHealth) * C.CRACK_FRAMES))}.png`,
          x,
          y,
        );
      ctx.strokeStyle = "#0d18242a";
      ctx.strokeRect(x + 0.5, y + 0.5, C.TILE - 1, C.TILE - 1);
      const cut = s.miner.drilling;
      if (cut?.dir === "down" && cut.col === c && cut.row === r) {
        const cutDepth = clamp(s.miner.y + C.MINER_H - y, 0, C.TILE);
        if (cutDepth > 0) {
          ctx.save();
          round(ctx, x + 7, y - 14, C.TILE - 14, cutDepth + 14, 12);
          ctx.clip();
          sprite(ctx, s, "tiles/tunnel.png", x, y - 14, C.TILE, C.TILE + 14);
          ctx.restore();
        }
      }
      if (t.kind === "gas")
        drawEffect(
          ctx,
          s,
          "gas-seep",
          x + 40,
          y + 40,
          (s.elapsedSeconds + (c + r) * 0.17) % C.GAS_SEEP_PERIOD,
          1000 + c + r * 32,
        );
    }
  for (let c = 0; c < C.WORLD_COLS; c++)
    if (c !== C.CAVE_MOUTH_COL)
      sprite(ctx, s, "surface/ground.png", c * C.TILE, C.SURFACE_Y - 3, 80, 25);
  sprite(
    ctx,
    s,
    "surface/cave-mouth.png",
    C.CAVE_MOUTH_COL * C.TILE,
    C.SURFACE_Y - 7,
  );
  for (const b of BUILDING_RECTS) {
    sprite(ctx, s, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
    if (b.id === "launch-pad")
      sprite(
        ctx,
        s,
        `rocket/stage${s.installed}.png`,
        b.x + 45,
        b.y - 79 - (s.launchTime ?? 0) ** 2 * 100,
        160,
        240,
      );
    text(
      ctx,
      b.id.replace(/-/g, " ").toUpperCase(),
      b.x + 12,
      b.y - 12,
      13,
      MUTED,
    );
    if (
      s.screen === "in-mine" &&
      s.launchTime === null &&
      s.miner.x + C.MINER_W > b.x &&
      s.miner.x < b.x + b.w &&
      s.miner.y + C.MINER_H <= C.SURFACE_Y + 0.2 &&
      s.miner.y + C.MINER_H > C.SURFACE_Y - 80
    )
      text(ctx, "[E] ACCESS", b.x + 55, C.SURFACE_Y + 26, 13, GOLD);
  }
  if (s.launchTime === null) {
    const counts: Record<C.MinerState, number> = {
      idle: 2,
      walk: 4,
      "drill-down": 3,
      "drill-side": 3,
      jetpack: 3,
      fall: 2,
      hurt: 2,
      "fuel-out": 2,
    };
    const m = s.miner,
      n = Math.floor(s.animTime * C.ANIM_FPS),
      frame =
        m.state === "hurt" ? Math.min(n, counts.hurt - 1) : n % counts[m.state];
    ctx.save();
    ctx.translate(m.x + C.MINER_W / 2, m.y + C.MINER_H / 2);
    if (m.facing === "west") ctx.scale(-1, 1);
    sprite(
      ctx,
      s,
      `miner/${m.state}/frame${String(frame).padStart(2, "0")}.png`,
      -40,
      -40,
      80,
      80,
    );
    ctx.restore();
  }
  if (s.coreGround) {
    const g = s.coreGround;
    sprite(ctx, s, "materials/core-sample.png", g.col * C.TILE, g.row * C.TILE);
    text(
      ctx,
      `${Math.ceil(s.coreTimer ?? 0)}s`,
      g.col * C.TILE,
      g.row * C.TILE - 8,
      22,
      GOLD,
    );
  }
  for (const fx of s.effects)
    drawEffect(
      ctx,
      s,
      fx.name,
      fx.x,
      fx.y,
      fx.age,
      fx.id,
      fx.name === "core-detonation" ? 2 : 1,
      fx.tint,
    );
  ctx.restore();
}
function gauge(
  ctx: CanvasRenderingContext2D,
  s: StateView,
  name: string,
  label: string,
  x: number,
  value: number,
  max: number,
  alert: boolean,
): void {
  sprite(ctx, s, `icons/${name}.png`, x, 15, 24, 24);
  text(ctx, label, x + 33, 20, 10, MUTED);
  text(
    ctx,
    `${Math.ceil(value)} / ${max}`,
    x + 33,
    38,
    15,
    alert ? "#f5a47c" : INK,
  );
  ctx.fillStyle = "#314b59";
  ctx.fillRect(x + 33, 44, 126, 3);
  ctx.fillStyle = alert ? "#f29570" : name === "fuel" ? GOLD : TEAL;
  ctx.fillRect(x + 33, 44, 126 * clamp(value / max, 0, 1), 3);
}
function hud(ctx: CanvasRenderingContext2D, s: StateView): void {
  box(ctx, { x: 0, y: 0, w: C.STAGE_W, h: C.HUD_H }, "#101f2e");
  ctx.fillStyle = "#4d6571";
  ctx.fillRect(0, 55, 1280, 1);
  gauge(
    ctx,
    s,
    "fuel",
    "FUEL",
    20,
    s.miner.fuel,
    maxFuel(s),
    s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION,
  );
  gauge(
    ctx,
    s,
    "hull",
    "HULL",
    205,
    s.miner.hull,
    maxHull(s),
    s.miner.hull < maxHull(s) * C.LOW_HULL_FRACTION,
  );
  sprite(ctx, s, "icons/cargo.png", 390, 16, 24, 24);
  text(ctx, "CARGO", 423, 19, 10, MUTED);
  text(
    ctx,
    cargoLine(s),
    423,
    37,
    13,
    loadKg(s) >= jet(s).liftLimitKg ? "#ffac7c" : INK,
  );
  sprite(ctx, s, "icons/credits.png", 668, 16, 24, 24);
  text(ctx, `${Math.floor(s.credits).toLocaleString()} Cr`, 700, 33, 17, GOLD);
  sprite(ctx, s, "icons/depth.png", 828, 16, 24, 24);
  text(ctx, `${Math.floor(depth(s))} m`, 860, 33, 17);
  for (const [i, id] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[id] ? 1 : 0.25;
    sprite(ctx, s, `icons/${id}.png`, 960 + i * 28, 16, 24, 24);
    ctx.globalAlpha = 1;
  }
  for (const b of buttons(s).filter((b) => b.rect.y < 56))
    drawButton(ctx, b.rect, b.label, b.enabled, false);
  if (loadKg(s) >= jet(s).liftLimitKg)
    text(
      ctx,
      C.OVERLOAD + " — drop ore in [I] to regain lift",
      400,
      91,
      18,
      "#ffb17c",
    );
  if (s.satchel.coreSample) {
    box(ctx, { x: 440, y: 72, w: 400, h: 65 }, "#302631ed");
    text(
      ctx,
      `CORE DESTABILIZING  ${Math.ceil(s.coreTimer ?? 0)}s`,
      460,
      99,
      21,
      GOLD,
    );
    text(ctx, "[J] JETTISON  /  RETURN TO LAUNCH PAD", 460, 121, 12, MUTED);
  }
  const scan = scanner(s);
  if (scan.locked) {
    const x = 1120,
      y = 125;
    text(ctx, `${scan.target?.toUpperCase()}`, 1000, 89, 13, TEAL);
    text(ctx, `${scan.distanceTiles?.toFixed(1)} tiles`, 1000, 108, 13, MUTED);
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + scan.dirX * 38, y + scan.dirY * 38);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + scan.dirX * 38, y + scan.dirY * 38, 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (!s.panel && s.miner.y < C.SURFACE_Y) {
    text(
      ctx,
      "A / D  MOVE    S  DRILL    W / SPACE  THRUST",
      24,
      688,
      12,
      MUTED,
    );
    text(
      ctx,
      "BUILD A WAY OFF THIS ROCK  ·  ROCKET " + s.installed + "/5",
      818,
      688,
      12,
      GOLD,
    );
  }
  if (s.noteTime > 0) {
    box(ctx, { x: 300, y: 638, w: 680, h: 42 }, "#102131f0");
    text(ctx, s.note, 321, 664, 14, GOLD);
  }
}
function hazardNotice(ctx: CanvasRenderingContext2D, s: StateView): void {
  if (s.notice?.shown) {
    box(ctx, { x: 280, y: 560, w: 720, h: 72 }, "#283340f5");
    text(
      ctx,
      s.notice.hazard === "gas"
        ? "VOLATILE GAS — watch for the pale seep. Hull is your only defense."
        : "MOLTEN ROCK — route around pools. Radiators reduce heat damage.",
      301,
      586,
      14,
      GOLD,
    );
    text(
      ctx,
      "The mine is still running. Click to dismiss.",
      301,
      613,
      12,
      MUTED,
    );
  }
}
function supplyIcon(
  ctx: CanvasRenderingContext2D,
  id: C.ItemId,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 2;
  ctx.fillStyle = GOLD;
  if (id === "dynamite" || id === "plastic-explosives") {
    ctx.fillStyle = "#ce9375";
    for (let i = 0; i < 3; i++) ctx.fillRect(3 + i * 6, 5, 5, 17);
    ctx.fillStyle = "#203c4d";
    ctx.fillRect(2, 11, 19, 4);
    ctx.strokeStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(12, 5);
    ctx.lineTo(15, 1);
    ctx.lineTo(21, 3);
    ctx.stroke();
  } else if (id === "quantum-teleporter" || id === "matter-transmitter") {
    ctx.beginPath();
    ctx.arc(12, 12, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, 20);
    ctx.lineTo(20, 4);
    ctx.stroke();
    if (id === "matter-transmitter") {
      ctx.beginPath();
      ctx.arc(12, 12, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (id === "nanobots") {
    ctx.fillStyle = TEAL;
    ctx.fillRect(9, 3, 6, 18);
    ctx.fillRect(3, 9, 18, 6);
  } else {
    ctx.fillRect(5, 6, 14, 16);
    ctx.fillRect(8, 2, 8, 4);
    ctx.fillStyle = "#203c4d";
    ctx.fillRect(10, 10, 4, 8);
  }
  ctx.restore();
}
function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  enabled: boolean,
  selected: boolean,
): void {
  selected = selected && enabled;
  box(ctx, r, selected ? "#ddbb7f" : enabled ? "#243d4e" : "#1c2c3a");
  border(ctx, r, selected ? "#ffe5b1" : enabled ? "#557482" : "#344552");
  text(
    ctx,
    label,
    r.x + 14,
    r.y + r.h / 2 + 6,
    r.h > 40 ? 18 : 13,
    selected ? "#162939" : enabled ? INK : "#667d87",
  );
}
function panel(ctx: CanvasRenderingContext2D, s: StateView): void {
  if (!s.panel) return;
  box(ctx, { x: 0, y: 56, w: 1280, h: 664 }, "#0915229c");
  const r = { x: 280, y: 133, w: 720, h: 490 };
  box(ctx, r, "#122637");
  border(ctx, r, "#557581");
  text(ctx, s.panel.replace(/-/g, " ").toUpperCase(), 312, 177, 26, GOLD);
  text(ctx, "[ESC] CLOSE", 833, 172, 12, MUTED);
  ctx.fillStyle = "#3b5664";
  ctx.fillRect(311, 192, 658, 1);
  switch (s.panel) {
    case "fuel-depot":
      text(
        ctx,
        `FUEL  ${Math.ceil(s.miner.fuel)} / ${maxFuel(s)}`,
        330,
        247,
        20,
      );
      text(ctx, `${C.FUEL_PRICE} Credit / unit`, 330, 269, 13, MUTED);
      text(
        ctx,
        `HULL  ${Math.ceil(s.miner.hull)} / ${maxHull(s)}`,
        330,
        367,
        20,
      );
      text(ctx, `${C.REPAIR_PRICE} Credits / point`, 330, 389, 13, MUTED);
      text(
        ctx,
        "No free refills. Every ascent has a price.",
        330,
        522,
        14,
        MUTED,
      );
      break;
    case "ore-market": {
      const held = C.MINERALS.filter((m) => s.cargo[m.id]);
      held.forEach((m, i) => {
        sprite(ctx, s, `ore/${m.id}.png`, 310, 206 + i * 24, 25, 25);
        text(
          ctx,
          `${m.name.padEnd(12)} ×${s.cargo[m.id]}  ·  ${(s.cargo[m.id] ?? 0) * m.value} Cr`,
          350,
          225 + i * 24,
          14,
        );
      });
      const total = C.MINERALS.reduce(
        (v, m) => v + (s.cargo[m.id] ?? 0) * m.value,
        0,
      );
      text(
        ctx,
        held.length
          ? `HAUL VALUE   ${total} Cr`
          : "Empty cargo. The good rock is below.",
        318,
        586,
        17,
        GOLD,
      );
      break;
    }
    case "upgrade-shop":
      C.TRACKS.forEach((t, i) => {
        text(
          ctx,
          `${t.toUpperCase()}  ${s.tiers[t]}/${C.MAX_TIER[t]}`,
          316,
          238 + i * 52,
          16,
        );
        text(ctx, upgradeDescription(s, t), 515, 237 + i * 52, 14, MUTED);
      });
      break;
    case "supply-depot":
      C.ITEMS.forEach((m, i) => {
        supplyIcon(ctx, m.id, 316, 232 + i * 56);
        text(ctx, `${i + 1}  ${m.name}`, 352, 253 + i * 56, 16);
        text(ctx, `HELD ${s.items[m.id]}`, 642, 253 + i * 56, 12, MUTED);
      });
      break;
    case "launch-pad":
      sprite(ctx, s, `rocket/stage${s.installed}.png`, 320, 250, 160, 240);
      C.ROCKET_COMPONENTS.forEach((c, i) => {
        text(
          ctx,
          `${i < s.installed ? "✓" : "0" + (i + 1)}  ${c.name}`,
          520,
          238 + i * 58,
          17,
          i < s.installed ? TEAL : INK,
        );
        text(
          ctx,
          `${c.credits.toLocaleString()} Cr${c.material ? "  + " + c.material : ""}`,
          559,
          259 + i * 58,
          12,
          MUTED,
        );
      });
      text(ctx, `${s.installed}/5 SYSTEMS ONLINE`, 316, 587, 15, GOLD);
      break;
    case "inventory": {
      const held = C.MINERALS.filter((m) => s.cargo[m.id]);
      text(ctx, cargoLine(s), 316, 211, 13, GOLD);
      held.forEach((m, i) =>
        text(
          ctx,
          `${m.name} ×${s.cargo[m.id]} · ${m.weightKg * (s.cargo[m.id] ?? 0)}kg`,
          316,
          244 + i * 27,
          13,
        ),
      );
      if (!held.length) text(ctx, "CARGO EMPTY", 316, 255, 15, MUTED);
      text(
        ctx,
        `RESONITE ${s.satchel.resonite}  CRYENITE ${s.satchel.cryenite}`,
        620,
        219,
        12,
        TEAL,
      );
      C.ITEMS.forEach((m, i) => {
        supplyIcon(ctx, m.id, 590, 267 + i * 43);
        text(
          ctx,
          `${i + 1} ${m.name.replace("Regenerative ", "")} ×${s.items[m.id]}`,
          620,
          288 + i * 43,
          11,
        );
      });
      if (loadKg(s) >= jet(s).liftLimitKg)
        text(ctx, C.OVERLOAD, 316, 590, 18, "#f2a877");
      break;
    }
  }
  const list = buttons(s).filter(
    (b) => b.rect.y > 56 && b.control !== "dismiss-notice",
  );
  list.forEach((b, i) =>
    drawButton(ctx, b.rect, b.label, b.enabled, i === s.panelIndex),
  );
}
function illustration(ctx: CanvasRenderingContext2D, s: StateView): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(600, 56, 680, 664);
  ctx.clip();
  sprite(ctx, s, "surface/sky.png", 350, 30, 1000, 410);
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 9; c++) {
      const x = 600 + c * 80,
        y = 346 + r * 80,
        band = C.BANDS[Math.min(3, Math.floor(r / 2))];
      sprite(ctx, s, `tiles/${band}-${(r + c) % 3}.png`, x, y);
      if (c === 4 || (r === 3 && c > 4)) {
        ctx.save();
        round(ctx, x + 6, y - 1, 68, 82, 12);
        ctx.clip();
        sprite(ctx, s, "tiles/tunnel.png", x, y);
        ctx.restore();
      } else if ((c * 7 + r * 3) % 8 === 0)
        sprite(ctx, s, `ore/${C.ORE_IDS[(r * 2 + c) % 10]}.png`, x, y);
    }
  sprite(ctx, s, "surface/fuel-depot.png", 631, 188, 240, 160);
  sprite(ctx, s, "rocket/stage5.png", 1060, 99, 160, 240);
  sprite(
    ctx,
    s,
    `miner/drill-down/frame0${Math.floor(s.simTime * 12) % 3}.png`,
    917,
    435,
    104,
    104,
  );
  drawEffect(ctx, s, "drill-debris", 970, 533, s.simTime % 1, 77);
  ctx.restore();
  const grad = ctx.createLinearGradient(550, 0, 800, 0);
  grad.addColorStop(0, BACKGROUND);
  grad.addColorStop(1, "#101c2900");
  ctx.fillStyle = grad;
  ctx.fillRect(550, 56, 250, 664);
  text(ctx, "EXTRACTION SITE  /  07", 940, 83, 12, MUTED);
  text(ctx, "DEPTH IS CHEAP.", 803, 635, 21, GOLD);
  text(ctx, "HEIGHT IS EXPENSIVE.", 803, 662, 21, GOLD);
}
function menu(ctx: CanvasRenderingContext2D, s: StateView): void {
  const foreground = ["paused", "victory", "game-over"].includes(s.screen);
  if (foreground) box(ctx, { x: 0, y: 56, w: 1280, h: 664 }, "#0b1723d9");
  else illustration(ctx, s);
  text(ctx, "DEAD WORLD / LIVE SIGNAL", 100, 102, 12, TEAL);
  text(ctx, "DEEPCORE  /  PROSPECTOR SYSTEMS", 100, 680, 11, MUTED);
  if (s.screen === "title") {
    text(ctx, C.TITLE_TEXT, 93, 218, 78, GOLD, "Impact, sans-serif");
    text(ctx, "DIG DEEP. BUILD YOUR ESCAPE.", 100, 264, 18, INK);
    text(
      ctx,
      "A lone prospector. One last way off the rock.",
      100,
      296,
      13,
      MUTED,
    );
  } else {
    const titles: Partial<Record<C.ScreenName, string>> = {
      "mode-select": "CHOOSE YOUR STAKES",
      "size-select": "CHOOSE YOUR DEPTH",
      "how-to-play": "FIELD MANUAL",
      paused: "SIGNAL ON HOLD",
      victory: "YOU MADE IT OUT",
      "game-over": "SIGNAL LOST",
    };
    text(ctx, titles[s.screen] ?? "", 100, 196, 38, GOLD, "Impact, sans-serif");
    if (s.screen === "mode-select") {
      text(
        ctx,
        "STANDARD  ·  Restore your last save after death.",
        100,
        247,
        13,
        MUTED,
      );
      text(
        ctx,
        "HARDCORE  ·  Death deletes the save. No second chance.",
        100,
        278,
        13,
        MUTED,
      );
    }
    if (s.screen === "size-select") {
      text(
        ctx,
        "QUICK 1250m / STANDARD 2500m / MARATHON 5000m",
        100,
        254,
        13,
        MUTED,
      );
      text(
        ctx,
        "Same rock. Same stakes. A longer way home.",
        100,
        282,
        13,
        MUTED,
      );
    }
    if (s.summary) {
      text(
        ctx,
        `${Math.floor(s.summary.deepestDepthMeters)}m reached   ·   ${s.summary.creditsEarned} Cr earned`,
        100,
        242,
        15,
      );
      text(
        ctx,
        `${Math.floor(s.summary.elapsedSeconds / 60)}m ${Math.floor(s.summary.elapsedSeconds % 60)}s   ·   ${s.mode.toUpperCase()}   ·   ${s.installed}/5 components`,
        100,
        271,
        14,
        MUTED,
      );
      if (s.summary.deathCause)
        text(
          ctx,
          `CAUSE  ${s.summary.deathCause.toUpperCase()}`,
          100,
          305,
          14,
          "#efa579",
        );
    }
    if (s.screen === "how-to-play") {
      box(ctx, { x: 80, y: 216, w: 1100, h: 375 }, "#102131ee");
      const lines = [
        "A / D or ← / →  Walk, then drill walls. S / ↓ drills down. Never up.",
        "W / ↑ / SPACE  Jetpack back through your tunnels. Falling is free.",
        "E / ENTER  Access camp buildings. I opens cargo. ESC / P pauses.",
        "M mutes. 1–6 use supplies. J jettisons an unstable Core Sample.",
        "Dig ore → climb home → sell → buy fuel, hull repair and upgrades.",
        "Slots fill your bay; weight limits lift. Drop ore from [I] if overloaded.",
        "Gas wisps warn of blasts. Lava burns. Slow a fall with thrust.",
        "Buy a scanner for Resonite and Cryenite. The Core starts a 90s race.",
        "Build five rocket components at the Launch Pad, then LAUNCH.",
        "The Save Pad is your only save. Standard restores it; Hardcore loses it.",
      ];
      lines.forEach((l, i) =>
        text(ctx, l, 103, 246 + i * 32, 16, i % 2 ? MUTED : INK),
      );
    }
  }
  menuItems(s).forEach((item, i) => {
    const r = menuRect(s, i);
    if (r) drawButton(ctx, r, item, true, i === s.menuIndex);
  });
  if (s.screen === "title")
    text(
      ctx,
      "↑ ↓ SELECT   /   ENTER CONFIRM   /   M MUTE",
      100,
      589,
      12,
      MUTED,
    );
}
export function render(s: StateView, ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
  if (["in-mine", "paused", "victory", "game-over"].includes(s.screen)) {
    world(ctx, s);
    hud(ctx, s);
    panel(ctx, s);
    hazardNotice(ctx, s);
  } else {
    box(ctx, { x: 0, y: 0, w: C.STAGE_W, h: C.STAGE_H }, BACKGROUND);
  }
  if (s.screen !== "in-mine") menu(ctx, s);
}
