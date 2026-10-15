import * as C from "./constants";
import { bandAt, cell, emptyGrid, type DeepcoreState } from "./model";
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickOre(f: number): C.OreId {
  const weights = C.MINERALS.map(
    (m) => m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
  );
  let n = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    n -= weights[i];
    if (n <= 0) return C.MINERALS[i].id;
  }
  return C.ORE_IDS[0];
}
export function generate(s: DeepcoreState): void {
  s.grid = emptyGrid(s.coreRow);
  for (let r = 1; r < s.coreRow; r++)
    for (let c = 1; c < C.WORLD_COLS - 1; c++)
      s.grid[r][c] = cell("rock", bandAt(r, s.coreRow));
  for (let bi = 0; bi < C.BANDS.length; bi++) {
    const band = C.BANDS[bi];
    const coords: { c: number; r: number }[] = [];
    for (let r = 1; r < s.coreRow; r++)
      if (bandAt(r, s.coreRow) === band)
        for (let c = 1; c < C.WORLD_COLS - 1; c++) coords.push({ c, r });
    shuffle(coords);
    const safe = (c: number) => c === C.CORE_COL || c === C.CAVE_MOUTH_COL;
    const place = (kind: C.TileKind, count: number, cluster = false): void => {
      let left = Math.round(count);
      for (const { c, r } of coords) {
        if (!left) break;
        if (safe(c) || s.grid[r][c].kind !== "rock") continue;
        const list = cluster
          ? [
              { c, r },
              { c: c + 1, r },
              { c: c + 2, r },
              { c, r: r + 1 },
            ]
          : [{ c, r }];
        for (const p of list)
          if (
            left &&
            p.c < C.WORLD_COLS - 1 &&
            !safe(p.c) &&
            p.r < s.coreRow &&
            bandAt(p.r, s.coreRow) === band &&
            s.grid[p.r][p.c].kind === "rock"
          ) {
            s.grid[p.r][p.c] = cell(kind, band);
            left--;
          }
      }
    };
    const f = (bi + 0.5) / C.BANDS.length;
    if (bi > 0) {
      const t = (f - 0.25) / 0.75;
      place(
        "stone",
        coords.length *
          (C.STONE_DENSITY_MIN +
            (C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * t),
      );
      place(
        "gas",
        coords.length *
          (C.GAS_DENSITY_MIN + (C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * t),
      );
    }
    if (bi > 1)
      place(
        "lava",
        coords.length *
          (C.LAVA_DENSITY_MIN +
            ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (f - 0.5)) / 0.5),
        true,
      );
    let ores = Math.round(coords.length * C.ORE_DENSITY);
    for (const { c, r } of coords)
      if (ores && r >= C.ORE_MIN_ROW && s.grid[r][c].kind === "rock") {
        s.grid[r][c] = cell("ore", band, pickOre((r - 1) / (s.coreRow - 1)));
        ores--;
      }
    const mat = C.MATERIALS.find((m) => C.MATERIAL_BAND[m] === band);
    if (mat) {
      const p = coords.find((p) => p.c > 2 && p.c < 29)!;
      s.grid[p.r][p.c] = cell("material", band, null, mat);
      // A guaranteed diggable crosscut from the protected descent spine to the prize.
      for (
        let c = Math.min(C.CORE_COL, p.c);
        c <= Math.max(C.CORE_COL, p.c);
        c++
      )
        if (["lava", "stone"].includes(s.grid[p.r][c].kind))
          s.grid[p.r][c] = cell("rock", band);
    }
  }
  s.grid[1][C.CAVE_MOUTH_COL] = cell("tunnel", "topsoil");
}
export function resize(s: DeepcoreState, size: C.WorldSize): void {
  const old = s.coreRow;
  s.worldSize = size;
  s.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]);
  const grid = emptyGrid(s.coreRow);
  for (let r = 0; r < Math.min(old, s.coreRow); r++)
    grid[r] = s.grid[r].map((t) => ({ ...t }));
  s.grid = grid;
}
