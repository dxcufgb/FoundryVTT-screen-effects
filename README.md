# Dxcufgb's screen effects

Full-screen effects on a player's own screen while their character suffers a condition: the world turns red and throbs at low HP, goes green and queasy when poisoned, rosy with drifting hearts when charmed, grey and heavy-lidded with exhaustion, and fades to black when they drop.

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
| Poisoned | Sickly green edges, queasy haze, bubbles | Slow nauseous sway |
| Charmed | Rosy glow, hearts drifting up the edges | Gentle breathing |
| Stunned | White-gold ringing edges, dazed blur, circling stars | Flashes and wobble |
| Frightened | Darkness and grasping shadows creeping in | Pulsing dread, slight tremor |
| Paralyzed | Icy edges, drained colour, frost crystals | Static |
| Petrified | Stone creeping in from the edges, cracks, grey world | Static |
| Invisible | Faint shimmer, as if seen through yourself | Slow shimmer |
| Restrained | Dark edges squeezing in, rope frame | Squeezing |
| Grappled | Dark edges squeezing in | Squeezing |
| Exhaustion | Greyer and darker with every level; from level 3 the eyelids start drooping | Blinks more often at higher levels |
| Unconscious | The world fades to black and blurs | Slow breathing |
| Dying (0 HP) | Black with a faint red heartbeat | Beats faster with each failed death save |
| Dead | Black and grey | Static |

- Effects combine (for example poisoned at low HP).
- **Whose effects:** the token you have selected. With several selected, the one you selected last. With none selected, your assigned character. Only tokens you own count.
- The GM sees no effects unless they turn on **Show effects to the GM** (then for the token the GM selects).
- The effects sit over the game canvas and under Foundry's windows and sidebar, and never block clicks.
- Pure CSS (plus a few small inline SVG shapes drawn for this module): no images to download.

## Settings

- **Show screen effects** (per user)
- **Effect strength** (per user)
- **Reduce motion** (per user): the effects stay still. The system's reduced-motion setting is followed too.
- **Low HP threshold (%)** (world): 25% by default.
- **Show effects to the GM** (per user): off by default.
- **Choose effects** (per user): turn single effects on or off and preview each one.

## API

```js
const api = game.modules.get("dxcufgbs-screen-effects").api;
api.preview("poisoned", 4000);   // show an effect for 4 seconds
api.refresh();                   // re-check the conditions
```

## License

[MIT](LICENSE). All effects are drawn with CSS and inline SVG written for this module; no third-party assets.
