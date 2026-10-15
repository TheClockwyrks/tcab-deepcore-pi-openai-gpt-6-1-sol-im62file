import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  BUILDING_RECTS,
  clone,
  effect,
  followCamera,
  initial,
  maxFuel,
  maxHull,
  scanner,
  type DeepcoreState,
  type StateView,
} from "./model";
import { createDebug, snapshot, type DeepcoreDebugApi } from "./debug";
import {
  buttons,
  buttonKey,
  inside,
  menuItems,
  menuRect,
  type Button,
} from "./interface";
import * as T from "./transactions";
import { STEP, step } from "./simulation";
import { BACKGROUND, render } from "./render";
export { BACKGROUND };
export type { DeepcoreState, DeepcoreDebugApi };
const files = import.meta.glob<string>("../assets/**/*.{png,json,wav}", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
const assetPath = (url: string): string =>
  url.replace(/^\.\//, "").replace(/^\/?assets\//, "");
function back(s: DeepcoreState): void {
  switch (s.screen) {
    case "in-mine":
      if (s.panel) s.panel = null;
      else {
        s.screen = "paused";
        s.menuIndex = 0;
      }
      break;
    case "paused":
      s.screen = "in-mine";
      s.menuIndex = 0;
      break;
    case "size-select":
      s.screen = "mode-select";
      s.menuIndex = C.MODES.indexOf(s.mode);
      break;
    case "mode-select":
      s.screen = "title";
      s.menuIndex = s.hasSave ? 1 : 0;
      break;
    case "how-to-play":
      s.screen = "title";
      s.menuIndex = s.hasSave ? 2 : 1;
      break;
  }
}
function choose(s: DeepcoreState): DeepcoreState {
  const item = menuItems(s)[s.menuIndex];
  switch (s.screen) {
    case "title":
      if (item === "CONTINUE") return T.restore(s);
      s.screen = item === "HOW TO PLAY" ? "how-to-play" : "mode-select";
      s.menuIndex = 0;
      break;
    case "mode-select":
      if (item === "BACK") back(s);
      else {
        s.mode = C.MODES[s.menuIndex];
        s.screen = "size-select";
        s.menuIndex = 0;
      }
      break;
    case "size-select":
      if (item === "BACK") back(s);
      else {
        s.worldSize = C.WORLD_SIZES[s.menuIndex];
        return T.start(s);
      }
      break;
    case "how-to-play":
      back(s);
      break;
    case "paused":
      if (item === "RESUME") back(s);
      else if (item === "RESTART") return T.start(s);
      else {
        s.screen = "title";
        s.menuIndex = s.hasSave ? 1 : 0;
      }
      break;
    case "victory":
    case "game-over":
      if (item === "CONTINUE FROM SAVE") return T.restore(s);
      if (item === "PLAY AGAIN") return T.start(s);
      s.screen = "title";
      s.menuIndex = s.hasSave ? 1 : 0;
      break;
  }
  return s;
}
function activateBuilding(s: DeepcoreState, id: C.BuildingId): void {
  if (id === "save-pad") T.save(s);
  else {
    s.panel = id;
    s.panelIndex = 0;
  }
}
function act(s: DeepcoreState, b: Button, api: UpdateApi): void {
  if (!b.enabled) return;
  switch (b.control) {
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      s.panelIndex = 0;
      break;
    case "pause":
      back(s);
      break;
    case "mute":
      api.audio.setMuted(!api.audio.muted());
      break;
    case "dismiss-notice":
      s.notice = null;
      break;
    case "drop-ore":
      T.dropOre(s, b.subject as C.OreId);
      break;
    case "use-item":
      T.useItem(s, b.subject as C.ItemId);
      break;
    case "buy-item":
      T.buyItem(s, b.subject as C.ItemId);
      break;
    case "buy-upgrade":
      T.buyUpgrade(s, b.subject as C.TrackName);
      break;
    case "sell":
      T.sell(s);
      break;
    case "buy-fuel":
      T.service(s, "fuel", false);
      break;
    case "fill-fuel":
      T.service(s, "fuel", true);
      break;
    case "buy-repair":
      T.service(s, "hull", false);
      break;
    case "repair-full":
      T.service(s, "hull", true);
      break;
    case "fabricate":
      T.fabricate(s);
      break;
    case "launch":
      T.launch(s);
      break;
    case "jettison":
      T.jettison(s);
      break;
  }
}
function hit(s: StateView, p: { x: number; y: number }): string | null {
  const b = buttons(s).find((b) => b.enabled && inside(p, b.rect));
  if (b) return buttonKey(b);
  for (let i = 0; i < menuItems(s).length; i++) {
    const r = menuRect(s, i);
    if (r && inside(p, r)) return "menu:" + i;
  }
  if (s.screen === "in-mine" && !s.panel)
    for (const b of BUILDING_RECTS)
      if (
        inside(p, {
          x: b.x - s.camera.x,
          y: b.y - s.camera.y + C.HUD_H,
          w: b.w,
          h: b.h,
        })
      )
        return "building:" + b.id;
  return null;
}
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTION_NAMES)
      api.input.register(name, { keys: [...C.ACTIONS[name]] });
    const resources: DeepcoreState["resources"] = { images: {}, systems: {} };
    await Promise.all(
      Object.entries(files).map(async ([key, url]) => {
        const path = key.replace("../assets/", "");
        const resolved = assetPath(url);
        if (path.endsWith(".png"))
          resources.images[path] = await api.assets.loadImage(resolved);
        else if (path.endsWith(".json"))
          resources.systems[path.replace("fx/", "").replace(".json", "")] =
            JSON.parse(
              await (await api.assets.load(resolved)).text(),
            ) as ParticleSystem;
        else if (path.endsWith(".wav"))
          await api.audio.load(
            path.replace("audio/", "").replace(".wav", ""),
            resolved,
          );
      }),
    );
    const state = initial(resources, T.hasSave());
    api.diagnostics.register(
      "screen",
      (s) => `${s.screen} / ${s.panel ?? "none"} · ${s.mode} / ${s.worldSize}`,
    );
    api.diagnostics.register(
      "position",
      (s) =>
        `${s.miner.x.toFixed(1)}, ${s.miner.y.toFixed(1)} · ${s.miner.vx.toFixed(0)}, ${s.miner.vy.toFixed(0)}`,
    );
    api.diagnostics.register(
      "miner",
      (s) =>
        `${s.miner.state} · ${s.miner.facing} · grounded ${snapshot(s).miner.grounded}`,
    );
    api.diagnostics.register(
      "fuel / hull",
      (s) =>
        `${s.miner.fuel.toFixed(1)}/${maxFuel(s)} · ${s.miner.hull.toFixed(1)}/${maxHull(s)}`,
    );
    api.diagnostics.register("cut", (s) => {
      const d = snapshot(s).miner.drilling;
      return d
        ? `${d.col},${d.row} ${d.dir} ${(d.progress * 100).toFixed(0)}%`
        : "none";
    });
    api.diagnostics.register(
      "economy",
      (s) => `${s.credits} Cr · ${snapshot(s).depthMeters.toFixed(0)}m`,
    );
    api.diagnostics.register("cargo", (s) => {
      const a = snapshot(s);
      return `${a.cargo.slotsUsed}/${a.cargo.slotCap} · ${a.cargo.loadKg}/${a.cargo.liftLimitKg}kg · overload ${a.miner.overloaded}`;
    });
    api.diagnostics.register(
      "materials",
      (s) =>
        `R ${s.satchel.resonite} C ${s.satchel.cryenite} Core ${s.satchel.coreSample}`,
    );
    api.diagnostics.register("tiers", (s) =>
      C.TRACKS.map((t) => `${t} ${s.tiers[t]}`).join(" · "),
    );
    api.diagnostics.register("core", (s) => s.coreTimer?.toFixed(1) ?? "none");
    api.diagnostics.register("scanner", (s) => {
      const a = scanner(s);
      return `${a.locked} · ${a.target ?? "none"}`;
    });
    return [state, createDebug()];
  },
  update(current, api, dt) {
    let s = clone(current);
    s.simTime += dt;
    s.muted = api.audio.muted();
    s.noteTime = Math.max(0, s.noteTime - dt);
    T.checkDeath(s);
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    const pressed = Object.fromEntries(
      C.ACTION_NAMES.filter((n) => n !== "mute").map((n) => [
        n,
        api.input.pressed(n),
      ]),
    ) as Record<C.ActionName, boolean>;
    if (pressed.pause) back(s);
    if (s.screen === "in-mine") {
      if (pressed.inventory) {
        s.panel = s.panel === "inventory" ? null : "inventory";
        s.panelIndex = 0;
      }
      C.ITEM_IDS.forEach((id, i) => {
        if (pressed[`supply${i + 1}` as C.ActionName]) T.useItem(s, id);
      });
      if (pressed.jettison) T.jettison(s);
      if (s.panel) {
        const list = buttons(s).filter(
          (b) => b.rect.y > C.HUD_H && b.control !== "dismiss-notice",
        );
        if (pressed.down)
          s.panelIndex = (s.panelIndex + 1) % Math.max(1, list.length);
        if (pressed.up)
          s.panelIndex =
            (s.panelIndex + list.length - 1) % Math.max(1, list.length);
        if (pressed.activate && list[s.panelIndex])
          act(s, list[s.panelIndex], api);
      } else if (pressed.activate) {
        const b = BUILDING_RECTS.find(
          (b) =>
            s.miner.x + C.MINER_W > b.x &&
            s.miner.x < b.x + b.w &&
            Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) < 80,
        );
        if (b) activateBuilding(s, b.id);
      }
    } else {
      const count = menuItems(s).length;
      if (pressed.down) s.menuIndex = (s.menuIndex + 1) % count;
      if (pressed.up) s.menuIndex = (s.menuIndex + count - 1) % count;
      if (pressed.activate) s = choose(s);
    }
    for (const p of api.input.pointerSamples()) {
      const key = hit(s, p);
      if (key?.startsWith("menu:")) s.menuIndex = Number(key.split(":")[1]);
      if (p.type === "down" && p.button === "primary") {
        if (key) s.pointerDown[p.id] = key;
        if (key === "dismiss-notice:") s.notice = null;
      }
      if (p.type === "up" && p.button === "primary") {
        if (key && s.pointerDown[p.id] === key) {
          if (key.startsWith("menu:")) s = choose(s);
          else if (key.startsWith("building:"))
            activateBuilding(s, key.slice(9) as C.BuildingId);
          else {
            const b = buttons(s).find((b) => buttonKey(b) === key);
            if (b) act(s, b, api);
          }
        }
        delete s.pointerDown[p.id];
      }
    }
    if (s.screen === "in-mine") {
      s.accumulator += dt;
      const held = {
        left: api.input.value("left"),
        right: api.input.value("right"),
        down: api.input.value("down"),
        up: api.input.value("up"),
      };
      while (s.accumulator + 1e-10 >= STEP && s.screen === "in-mine") {
        step(s, held, STEP);
        s.accumulator -= STEP;
      }
    } else {
      s.accumulator = 0;
      followCamera(s, 0);
    }
    if (s.screen !== "paused") {
      s.effects = s.effects
        .map((f) => ({ ...f, age: f.age + dt }))
        .filter((f) => f.age < 1.8);
      s.shake = Math.max(0, s.shake - dt * 20);
    }
    // Ambient seep clocks and every effect age are simulation values; render reads only.
    if (
      s.screen === "in-mine" &&
      s.launchTime !== null &&
      Math.floor(s.launchTime * 20) !== Math.floor((s.launchTime - dt) * 20)
    ) {
      const b = BUILDING_RECTS.find((b) => b.id === "launch-pad")!;
      effect(
        s,
        "launch-exhaust",
        b.x + 120,
        C.SURFACE_Y - s.launchTime ** 2 * 100,
      );
    }
    api.audio.loop(C.CUES.music);
    const drillLoop =
      s.screen === "in-mine" && !s.panel && s.miner.drilling !== null;
    const thrustLoop =
      s.screen === "in-mine" &&
      !s.panel &&
      api.input.value("up") > 0 &&
      s.miner.fuel > 0;
    if (drillLoop) api.audio.loop(C.CUES.drill);
    else api.audio.stop(C.CUES.drill);
    if (thrustLoop) api.audio.loop(C.CUES.thrust);
    else api.audio.stop(C.CUES.thrust);
    if (
      s.screen === "in-mine" &&
      s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION
    )
      api.audio.loop(C.CUES.alarmFuel);
    else api.audio.stop(C.CUES.alarmFuel);
    if (s.screen === "in-mine" && s.coreTimer !== null) {
      const period = s.coreTimer < 15 ? 0.25 : s.coreTimer < 40 ? 0.5 : 1;
      if (
        Math.floor(s.elapsedSeconds / period) !==
        Math.floor((s.elapsedSeconds - dt) / period)
      )
        api.audio.play(C.CUES.alarmCore);
    }
    for (const cue of s.pendingCues) api.audio.play(cue);
    s.pendingCues = [];
    s.muted = api.audio.muted();
    return s;
  },
  render(s, api) {
    render(s, api.ctx);
  },
};
