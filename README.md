# Deepcore

A browser-only subterranean dig-and-build game. Mine a dead world, bring weighted ore back to camp, and turn the proceeds into the five components of your escape rocket. Falling is free; getting home costs fuel. Deep gas pockets, molten seams, and an unstable Core Sample make every return trip a wager.

## Run

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. Choose **New Expedition**, a mode, and a world size. Standard lets you restore the last Save Pad checkpoint after death; Hardcore deletes it. Quick, Standard, and Marathon reach 1,250, 2,500, and 5,000 meters respectively.

## Controls

| Input | Action |
| --- | --- |
| A / D or ← / → | Walk and drill into adjacent walls |
| S or ↓ | Drill down while grounded |
| W / ↑ / Space | Fire the jetpack |
| E / Enter | Access a camp building; confirm a menu or selected panel control |
| I | Open or close cargo and supplies |
| Escape / P | Close a panel, pause, or resume |
| M | Mute / unmute |
| J | Jettison a carried Core Sample |
| 1–6 | Dynamite, Plastic Explosives, Quantum Teleporter, Matter Transmitter, Nanobots, Emergency Fuel |
| ↑ / ↓ on menus and panels | Change the selected entry |
| Backtick | Toggle the engine's read-only diagnostic overlay |

Menus, building panels, and status-bar controls also accept mouse, pen, and touch. Movement requires a keyboard. A pointer choice requires pressing and releasing the same control.

**Your first dig:** drill a short shaft, follow the colored mineral seams, and come back before your fuel gauge gets low. Sell at the Ore Market and pay for fuel and repairs at the Fuel Depot. There are no free surface refills. Cargo has both slots and weight; if the jetpack cannot lift your haul, discard some ore from the inventory. Buy a scanner to locate the two exotic materials. Save explicitly at the Save Pad. The Core Sample cannot be saved and gives you only 90 seconds to reach the Launch Pad.

## Production build

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`, with `dist/index.html` as its entry point. Serve that directory over HTTP at any base path. It needs no backend, network service, API key, or asset-generation tools. The only persistence is one local browser save slot; play still works when browser storage is unavailable.

All shipped art and audio are committed under `assets/`. Vite bundles these files with explicit non-inlining URLs, and the engine loads them relative to the page. **The build never generates assets.**

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The simulation uses a render-free 120 Hz fixed-step core over the engine's elapsed time. Tests exercise it directly and through the actual Simple 2D engine, a counted clock, dispatched keyboard and pointer events, and an `@napi-rs/canvas` surface. Node adapters load the real committed files and stand in for browser Web Audio, not game behavior.

Source organization:

- `src/game.ts`: engine integration, asset registration, inputs, menus, and audio.
- `src/model.ts`, `src/world.ts`: state, derived readings, terrain generation, and resizing.
- `src/simulation.ts`: movement, collision, drill cadence, heat, impact, and timers.
- `src/transactions.ts`: economy, supplies, palette-compressed saves, deaths, and fabrication.
- `src/debug.ts`: immutable automation poses and observable snapshot.
- `src/interface.ts`, `src/render.ts`: shared hit regions and presentation.

The debug API is returned by `game.initialize` and available only through `engine.debug`. Poses run through `engine.apply`; normal play installs no debug handle on the page.

## Original assets and showcase

`tools/make-art.py` contains the authored drawing recipes rasterized once with `draw` and `draw-sheet`. `tools/art-logs/` retains their operation logs. `tools/make-sound-fx.py` authors the live particle systems with `particle-2d`, layered cues with `sfx-synth` and `sfx-sample`, and the descent score with `music`. Its recipes and previews are in `tools/recipes/`. These are optional provenance tools, not build dependencies.

The asset set includes eight distinct prospector animation cycles, four textured rock bands, mineral-vein overlays, faceted jewels, embedded crystals, six camp facilities, six rocket assembly stages, live seeded particle effects, twelve sound cues, and an original music loop. Artwork is original; the layered effects use the generation tools' supplied sample pack.

`showcase/` contains the player-facing description, genuine game screenshots, and an engine-recorded gameplay replay. `tools/capture.mjs` captures these through Playwright against a running development server; its automation handle exists only in the isolated capture page.
