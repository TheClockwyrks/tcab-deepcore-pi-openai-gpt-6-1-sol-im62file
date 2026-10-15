import * as C from "./constants";
import {
  loadKg,
  maxFuel,
  maxHull,
  slotCap,
  slots,
  type StateView,
} from "./model";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Control =
  | "drop-ore"
  | "use-item"
  | "jettison"
  | "sell"
  | "buy-fuel"
  | "fill-fuel"
  | "buy-repair"
  | "repair-full"
  | "buy-upgrade"
  | "buy-item"
  | "fabricate"
  | "launch"
  | "dismiss-notice"
  | "inventory"
  | "pause"
  | "mute";
export interface Button {
  control: Control;
  subject: string | null;
  rect: Rect;
  label: string;
  enabled: boolean;
}
export const inside = (p: { x: number; y: number }, r: Rect): boolean =>
  p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
export function menuItems(s: StateView): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuRect(s: StateView, index: number): Rect | null {
  return Number.isInteger(index) && index >= 0 && index < menuItems(s).length
    ? {
        x: 100,
        y: (s.screen === "how-to-play" ? 620 : 365) + index * 64,
        w: 422,
        h: 50,
      }
    : null;
}
export const buttonKey = (b: Button): string =>
  b.control + ":" + (b.subject ?? "");
export function buttons(s: StateView): Button[] {
  if (s.screen !== "in-mine") return [];
  const a: Button[] = [];
  const add = (
    control: Control,
    subject: string | null,
    label: string,
    x: number,
    y: number,
    w = 175,
    enabled = true,
  ): void => {
    a.push({ control, subject, label, rect: { x, y, w, h: 36 }, enabled });
  };
  add("inventory", null, "BAY [I]", 1032, 10, 91);
  add("pause", null, "Ⅱ", 1134, 10, 46);
  add("mute", null, s.muted ? "♪ OFF" : "♪", 1190, 10, 70);
  if (s.notice?.shown)
    a.push({
      control: "dismiss-notice",
      subject: null,
      label: "DISMISS",
      rect: { x: 280, y: 560, w: 720, h: 72 },
      enabled: true,
    });
  switch (s.panel) {
    case "fuel-depot":
      add(
        "buy-fuel",
        null,
        `+${C.FUEL_BUY_INCREMENT} FUEL`,
        330,
        285,
        240,
        s.credits >=
          Math.min(C.FUEL_BUY_INCREMENT, maxFuel(s) - s.miner.fuel) *
            C.FUEL_PRICE && s.miner.fuel < maxFuel(s),
      );
      add(
        "fill-fuel",
        null,
        "FILL TO FULL",
        650,
        285,
        240,
        s.credits > 0 && s.miner.fuel < maxFuel(s),
      );
      add(
        "buy-repair",
        null,
        `+${C.REPAIR_BUY_INCREMENT} HULL`,
        330,
        405,
        240,
        s.credits >=
          Math.min(C.REPAIR_BUY_INCREMENT, maxHull(s) - s.miner.hull) *
            C.REPAIR_PRICE && s.miner.hull < maxHull(s),
      );
      add(
        "repair-full",
        null,
        "REPAIR TO FULL",
        650,
        405,
        240,
        s.credits > 0 && s.miner.hull < maxHull(s),
      );
      break;
    case "ore-market":
      add("sell", null, C.SELL, 750, 565, 170, slots(s) > 0);
      break;
    case "upgrade-shop":
      C.TRACKS.forEach((t, i) => {
        const tier = s.tiers[t];
        add(
          "buy-upgrade",
          t,
          tier === C.MAX_TIER[t] ? "MAX" : `${C.UPGRADE_PRICES[tier - 1]} Cr`,
          775,
          215 + i * 52,
          145,
          tier < C.MAX_TIER[t] && s.credits >= C.UPGRADE_PRICES[tier - 1],
        );
      });
      break;
    case "supply-depot":
      C.ITEMS.forEach((t, i) =>
        add(
          "buy-item",
          t.id,
          `${t.price} Cr`,
          775,
          230 + i * 56,
          145,
          s.credits >= t.price,
        ),
      );
      break;
    case "launch-pad": {
      const comp = C.ROCKET_COMPONENTS[s.installed];
      add(
        comp ? "fabricate" : "launch",
        null,
        comp ? C.FABRICATE : C.LAUNCH,
        700,
        565,
        220,
        !comp ||
          (s.credits >= comp.credits &&
            (comp.material === null ||
              (comp.material === "core-sample"
                ? s.satchel.coreSample
                : s.satchel[comp.material] > 0))),
      );
      break;
    }
    case "inventory": {
      const ores = C.MINERALS.filter((m) => (s.cargo[m.id] ?? 0) > 0);
      ores.forEach((m, i) => add("drop-ore", m.id, "−", 515, 222 + i * 27, 42));
      C.ITEMS.forEach((m, i) =>
        add("use-item", m.id, C.USE, 842, 265 + i * 43, 76, s.items[m.id] > 0),
      );
      if (s.satchel.coreSample)
        add("jettison", null, C.JETTISON, 690, 557, 228);
      break;
    }
  }
  return a;
}
export function controlRect(
  s: StateView,
  control: Control,
  subject: string | null,
): Rect | null {
  return (
    buttons(s).find((b) => b.control === control && b.subject === subject)
      ?.rect ?? null
  );
}
export function upgradeDescription(s: StateView, t: C.TrackName): string {
  const tier = Math.min(s.tiers[t] + 1, C.MAX_TIER[t]);
  const i = tier - 1;
  switch (t) {
    case "fuel":
      return `${C.FUEL_TIERS[i]} fuel capacity`;
    case "hull":
      return `${C.HULL_TIERS[i]} hull integrity`;
    case "drill":
      return `Power ${tier}`;
    case "cargo":
      return `${C.CARGO_TIERS[i]} slots`;
    case "jetpack":
      return `${C.JETPACK_TIERS[i].liftLimitKg} kg lift`;
    case "radiator":
      return `${Math.round(C.RADIATOR_TIERS[i] * 100)}% heat resistance`;
    case "scanner":
      return `${C.SCANNER_TIERS[i] ?? 0} tile range`;
  }
}
export function cargoLine(s: StateView): string {
  return `${slots(s)}/${slotCap(s)} SLOTS  ·  ${loadKg(s)} kg`;
}
