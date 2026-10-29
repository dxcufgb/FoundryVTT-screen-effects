# Dxcufgb's screen effects

[![Foundry v13](https://img.shields.io/github/v/release/dxcufgb/FoundryVTT-screen-effects?label=Foundry%20v13&logo=foundryvirtualtabletop&color=ff6400)](https://github.com/dxcufgb/FoundryVTT-screen-effects/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/dxcufgb/FoundryVTT-screen-effects/module.zip?label=downloads&color=blue)](https://github.com/dxcufgb/FoundryVTT-screen-effects/releases)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/dxcufgb)\
[![CI](https://img.shields.io/github/actions/workflow/status/dxcufgb/FoundryVTT-screen-effects/ci.yml?branch=main&label=CI)](https://github.com/dxcufgb/FoundryVTT-screen-effects/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/dxcufgb/FoundryVTT-screen-effects)](LICENSE)

<a href="https://dxcufgb.github.io/FVTT-dev-showcase/"><img src="https://dxcufgb.github.io/FVTT-dev-showcase/assets/img/workshop-badge.png" alt="Dxcufgb's Workshop: every Foundry VTT project, video and changelog in one place" width="650"></a>

Animated full-screen effects on a player's own screen while their character suffers a condition, one for every D&D 5e and 2024 condition: the world turns red and throbs at low HP, goes green and queasy when poisoned, rosy with drifting hearts when charmed, cracks into stone when petrified, and fades to black when they drop.

**Foundry VTT:** v13 · **System:** made for dnd5e (tested with 5.2.5); conditions from any system that uses Foundry's status effects work too.

## Installation

In Foundry: **Add-on Modules → Install Module**, paste this link into **Manifest URL** at the bottom, and click **Install**:

```
https://github.com/dxcufgb/FoundryVTT-screen-effects/releases/latest/download/module.json
```

## Effects

| Condition | On screen | Moves |
| --- | --- | --- |
| Low HP | Red vignette and draining colour, stronger the lower the HP | Heartbeat, faster as HP drops |
| Blinded | Darkness swallows the screen; only a dim, blurred smear survives in the middle | Murk drifting through |
| Charmed | Rosy haze at the edges, richer colours | Hearts drifting inward toward the charmer |
| Deafened | Colour drains, slight blur | Broken sound rings spread out and die away |
| Exhaustion | Worse with every level: 1 darker edges and draining colour; 2 eyelids rest lowered; 3 they sag shut now and then; 4 the world blurs and sways; 5 blinks close almost fully; 6 barely conscious, almost black | Slower, heavier breathing; blinks come more often and take longer to recover from at each level |
| Frightened | Red and black edges, dark tendrils reaching in | Heartbeat throb, the view jolts with each beat |
| Grappled | Shadowy fingers gripping both sides of the screen | Slow squeezes |
| Incapacitated | Grey, blurred, dazed | Faint spiral arms turning |
| Invisible | Cool, glassy shimmer, glints at the edges | Rippling heat-haze bands |
| Paralyzed | A great rune circle locked over the screen, drained colour | Violet crackles snap at the edges |
| Petrified | Cracked stone creeping in from every edge, grey world | The stone grinds forward and back, grit falls |
| Poisoned | Sickly green tint and edges, toxic vapour | Nauseous sway, bubbles drifting in |
| Prone | The far side of the map darkens out of reach, dust at the bottom | Dust hanging in the air |
| Restrained | Web strands across the corners | The strands tremble as you strain |
| Stunned | White-gold edges, throbbing blur | White flashes; four rings of stars of different sizes circle just inside the screen edges at different speeds and directions |
| Unconscious | Heavy eyelids over a dim, blurred world | Eyelids flutter, faint dream lights drift past |
| Dying (0 HP) | As unconscious, with a failing red heartbeat | Beats faster with each failed death save |
| Dead | Eyes closed, black and grey | Still |

- Effects combine (for example poisoned at low HP).
- **Whose effects:** the token you have selected. With several selected, the one you selected last. With none selected, your assigned character. Only tokens you own count.
- The GM sees no effects unless they turn on **Show effects to the GM** (then for the token the GM selects).
- The effects sit over the game canvas and under Foundry's windows, stop at the sidebar (running under its tabs), and never block clicks.
- Made for a top-down map: effects close in from the screen edges or lie flat over the map, and Foundry's own canvas is never moved, so clicking, dragging and measuring work as normal.
- Drawn in code (CSS for Low HP, animated 2D canvases for the conditions): no images to download. With **Reduce motion** each effect shows as a still frame.

## Settings

- **Show screen effects** (per user)
- **Effect strength** (per user)
- **Reduce motion** (per user): the effects stay still. The system's reduced-motion setting is followed too.
- **Low HP threshold (%)** (world): 25% by default.
- **Show effects to the GM** (per user): off by default. Only GMs see this setting.
- **Choose effects** (per user): turn single effects on or off and preview each one.

## API

```js
const api = game.modules.get("dxcufgbs-screen-effects").api;
api.preview("poisoned", 4000);   // show an effect for 4 seconds
api.refresh();                   // re-check the conditions
api.effects;                     // the effect ids, in stacking order: "exhaustion", "poisoned", … "lowhp", "unconscious"
```

Everything happens on the screen of the client that calls it; nothing is sent to other players. Any user may call it.

- `preview(id, ms = 4000)` shows an effect on your own screen for `ms` milliseconds, whatever the conditions, even when it is turned off in **Choose effects** or **Show screen effects** is off. Ids not in `api.effects` are ignored. Exhaustion previews at level 4 and Unconscious as dying.
- `refresh()` re-checks the conditions (of the token whose effects you see) a moment later. The module already does this when tokens, actors, active effects, users, the scene or its settings change, so you only need it after a change it can't see.

**From another module**

The API is set during `init`. The effects are placed on screen at `ready`, so call `preview` from `ready` on. The module calls no hooks of its own and stores no flags. Make the integration optional:

```js
Hooks.once("ready", () => {
  const api = game.modules.get("dxcufgbs-screen-effects")?.active ? game.modules.get("dxcufgbs-screen-effects").api : null;
  if (!api) return;   // Dxcufgb's screen effects not installed or not enabled
  api.preview("stunned", 2000);
});
```

Add `{ "id": "dxcufgbs-screen-effects", "type": "module" }` to `relationships.recommends` in your `module.json`.

## License

[MIT](LICENSE). All effects are drawn with CSS and canvas code written for this module; no third-party assets.

## Releasing

For the maintainer: **Actions → Release module → Run workflow**, type the version (for example `1.2.3`) and run it. The module is checked and packaged first; only then is the release `v1.2.3` published with `module.json` and `module.zip`. CI and releases come from [dxcufgb/foundry-module-ci](https://github.com/dxcufgb/foundry-module-ci), the same for every module.
