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

Requirements and more: see [Installation](https://github.com/dxcufgb/FoundryVTT-screen-effects/wiki/Installation) in the wiki.

## Documentation

The full guide is in the [wiki](https://github.com/dxcufgb/FoundryVTT-screen-effects/wiki):

- [Effects](https://github.com/dxcufgb/FoundryVTT-screen-effects/wiki/Effects): every condition's effect and whose effects you see
- [Settings](https://github.com/dxcufgb/FoundryVTT-screen-effects/wiki/Settings): strength, reduced motion, low HP threshold, single effects
- [API](https://github.com/dxcufgb/FoundryVTT-screen-effects/wiki/API): for macro and module authors

## Releasing

For the maintainer: **Actions → Release module → Run workflow**, type the version (for example `1.2.3`) and run it. The module is checked and packaged first; only then is the release `v1.2.3` published with `module.json` and `module.zip`. CI and releases come from [dxcufgb/foundry-module-ci](https://github.com/dxcufgb/foundry-module-ci), the same for every module.

## License

[MIT](LICENSE). All effects are drawn with CSS and canvas code written for this module; no third-party assets.
