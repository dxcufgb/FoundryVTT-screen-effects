# Dxcufgb's screen effects

FoundryVTT v13 module (id `dxcufgbs-screen-effects`, the install folder must have the same name). Shows animated
full-screen effects on a player's own screen while their character has a condition: every D&D 5e / 2024 condition
(blinded ... unconscious / dying / dead, exhaustion by level) plus low HP. Made for a top-down map. Everything is
drawn in code (CSS and 2D canvas), no images. No build step and no npm dependencies.

## Layout
- `scripts/main.js` – `MODULE_ID`, the `EFFECTS` list (id, label, Foundry status ids, stacking order), settings and
  the "Choose effects" menu (`EffectsConfig`, template `templates/effects.hbs`), the overlay (`buildOverlay`, placed
  right after `#board`; `watchSidebar` keeps it off the sidebar), whose conditions are shown (`watchedActor`), what is
  active and how strong (`effectsFor`), applying it (`scheduleRefresh` → `refresh`), the canvas loop (`animate`,
  `paint`, `resizeCanvases`, `fadeOf`, `scaleFilter`), previews (`preview`) and the module API (`preview`,
  `refresh`, `effects`).
- `scripts/overlays.js` – `OVERLAYS`: one entry per animated condition with `filter(t, fx)` (backdrop filter for the
  map), optional `motion(t, fx)` (CSS transform of the overlay canvas), `init(W, H, fx)` and
  `draw(ctx, W, H, t, dt, s, fx)`; plus drawing helpers. Low HP has no entry: it is pure CSS.
- `styles/screen-effects.css` – overlay layout, the Low HP layers and heartbeat, the reduced-motion rules, the menu.
- `templates/effects.hbs` – the "Choose effects" window. `lang/en.json` – all strings (`DXSE.*`).
- `.github/workflows/ci.yml` / `release.yml` – thin callers of `dxcufgb/foundry-module-ci` (checks, packaging,
  release); identical in every module, do not edit them here. `claude.yml` – the Claude review.

## Settings
- `enabled` (Show screen effects), `intensity` (Effect strength, 0.2–1, default 1), `calm` (Reduce motion, default
  off), `gm` (Show effects to the GM, default off; hidden from non-GMs in the settings window by the
  `renderSettingsConfig` hook) and the hidden `disabled` list (effect ids switched off in "Choose effects") are
  `client` scope: stored in this browser only, each person decides for their own screen.
- `lowHp` (Low HP threshold %, 5–60, default 25) is `world` scope (the GM sets it).
- `intensity` → `--dxse-master` (opacity of the Low HP layers and the canvases) and the strength of each backdrop
  filter (`fadeOf` × `scaleFilter`). `calm` → class `dxse-calm` (CSS animations off) and `reducedMotion()`, which is
  also true when the OS reports `prefers-reduced-motion: reduce` (the CSS has the same media query): then no
  animation frame loop runs and each effect is painted once as a still frame (`dt = 0`, no `motion` transform).

## Conventions
- `MODULE_ID` must equal `id` in `module.json`; CI checks it.
- Every visible setting and the settings menu need a Name and Hint in `lang/en.json`; CI checks it. A new effect
  needs an `EFFECTS` entry, a `DXSE.Effect.*` label and a README table row.
- Update `README.md` when effects, behaviour or settings change.

## Review focus
- **Reduce motion and strength apply to every effect**: a new overlay must keep all movement in `draw` driven by
  `dt` / `t` and behind `dt > 0` for anything sudden (see `stunned` flashes, `paralyzed` crackles), so the still frame
  of `reducedMotion()` really is still; `motion` must be optional; new CSS animations must be covered by the
  `.dxse-calm` and `prefers-reduced-motion` rules. Strength goes through `--dxse-master` (CSS opacity) and `fadeOf`
  (canvas backdrop filters). Canvas layers stay fully opaque: an ancestor below full opacity cuts a backdrop filter
  off from the map, so their fade is on the canvas and in `scaleFilter`, not on the layer.
- **Photosensitivity**: the only bright full-screen flash is `stunned` (one every 2.5–4 s, jumping to 55 % white and
  fading out in about 0.55 s). Flag anything that flashes or strobes large areas more than about three times a
  second, or fast high-contrast red/white alternation.
- **Never block the game**: `#dxse-overlay` has `pointer-events: none` (inherited by every layer), sits right after
  `#board` (under the UI) and stops at the sidebar. Foundry's own canvas is never transformed or filtered directly;
  only the module's own canvases move.
- **Who sees what**: only this client draws, from `watchedActor()`: a controlled token the user owns
  (`actor.isOwner`; the most recently controlled), else the user's assigned character. GMs see nothing unless their
  `gm` setting is on. Never show effects for a token the user does not own, and never send anything to other clients
  (no sockets, no document writes: the only write is the user's own `disabled` client setting).
- **Effects end when they should**: `scheduleRefresh` runs on `controlToken`, `updateActor`, `updateToken`,
  `create/update/deleteActiveEffect`, `canvasReady`, `updateUser`, `create/deleteToken` and setting changes. A new
  input that changes the watched actor or its conditions needs a hook here.
- **Per-frame cost**: the `requestAnimationFrame` loop runs only while some canvas is showing (on or fading out).
  Canvases are drawn at most 1600 px wide; heavy work belongs in `init` (rebuilt after a resize settles, 200 ms),
  not in `draw`. Keep per-frame allocations small (`petrified` rebuilds its mask only when its quantized level
  changes).
- **System data**: HP from `system.attributes.hp` (`effectiveMax` or `max + tempmax`), death saves from
  `system.attributes.death.failure`, exhaustion from `system.attributes.exhaustion` and
  `CONFIG.DND5E.conditionTypes.exhaustion.levels`; all optional, so other systems get only the status-based effects
  and nothing may throw.
