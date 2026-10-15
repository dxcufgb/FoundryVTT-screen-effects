/**
 * Dxcufgb's screen effects (dxcufgbs-screen-effects) - Foundry VTT V13
 *
 * Shows a full-screen effect on a player's own screen while their character suffers a
 * condition: every D&D 5e / 2024 condition (blinded, charmed, deafened, exhaustion by level,
 * frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone,
 * restrained, stunned, unconscious/dying/dead) plus low HP.
 *
 * Whose conditions: the token the player controls (the most recently selected one when
 * several are selected), otherwise the player's assigned character. GMs see nothing unless
 * they turn on "Show effects to the GM".
 *
 * The effects are layers placed over the game canvas and under Foundry's UI, so they cover
 * the play area (up to the sidebar, and under its tabs) but never block clicks. Low HP is pure CSS; the conditions
 * are animated 2D canvases (scripts/overlays.js) with a backdrop filter on the map behind them.
 * Foundry's own canvas is never transformed, so the map keeps working normally.
 *
 * API: game.modules.get("dxcufgbs-screen-effects").api
 *   .preview("poisoned", 4000)    show an effect for a few seconds
 *   .refresh()                    re-check the conditions
 */

import { OVERLAYS } from "./overlays.js";

export const MODULE_ID = "dxcufgbs-screen-effects";

/** The effects, in stacking order (later ones draw on top). */
export const EFFECTS = [
  { id: "exhaustion", label: "DXSE.Effect.Exhaustion" },
  { id: "poisoned", label: "DXSE.Effect.Poisoned", statuses: ["poisoned"] },
  { id: "charmed", label: "DXSE.Effect.Charmed", statuses: ["charmed"] },
  { id: "deafened", label: "DXSE.Effect.Deafened", statuses: ["deafened"] },
  { id: "invisible", label: "DXSE.Effect.Invisible", statuses: ["invisible"] },
  { id: "prone", label: "DXSE.Effect.Prone", statuses: ["prone"] },
  { id: "grappled", label: "DXSE.Effect.Grappled", statuses: ["grappled"] },
  { id: "restrained", label: "DXSE.Effect.Restrained", statuses: ["restrained"] },
  { id: "frightened", label: "DXSE.Effect.Frightened", statuses: ["frightened"] },
  { id: "incapacitated", label: "DXSE.Effect.Incapacitated", statuses: ["incapacitated"] },
  { id: "paralyzed", label: "DXSE.Effect.Paralyzed", statuses: ["paralyzed"] },
  { id: "petrified", label: "DXSE.Effect.Petrified", statuses: ["petrified"] },
  { id: "stunned", label: "DXSE.Effect.Stunned", statuses: ["stunned"] },
  { id: "blinded", label: "DXSE.Effect.Blinded", statuses: ["blinded"] },
  { id: "lowhp", label: "DXSE.Effect.LowHp" },
  { id: "unconscious", label: "DXSE.Effect.Unconscious", statuses: ["unconscious", "dead"] }
];

/** How long a layer keeps animating after it is turned off (its fade-out, see the CSS). */
const FADE_MS = 1000;

const state = {
  overlay: null,
  layers: {},
  lastControlled: null,
  previews: new Map(),      // effect id -> {until, timer}
  timer: null,
  sidebarObserver: null,
  canvases: {},             // effect id -> {canvas, ctx, filter, W, H, s, fx, offAt}
  frame: null,              // requestAnimationFrame id while anything animates
  last: 0,
  time: 0
};

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const refresh = () => scheduleRefresh();
  game.settings.register(MODULE_ID, "enabled", {
    name: "DXSE.Settings.Enabled.Name", hint: "DXSE.Settings.Enabled.Hint",
    scope: "client", config: true, type: Boolean, default: true, onChange: refresh
  });
  game.settings.register(MODULE_ID, "intensity", {
    name: "DXSE.Settings.Intensity.Name", hint: "DXSE.Settings.Intensity.Hint",
    scope: "client", config: true, type: Number, default: 1,
    range: { min: 0.2, max: 1, step: 0.05 }, onChange: refresh
  });
  game.settings.register(MODULE_ID, "calm", {
    name: "DXSE.Settings.Calm.Name", hint: "DXSE.Settings.Calm.Hint",
    scope: "client", config: true, type: Boolean, default: false, onChange: refresh
  });
  game.settings.register(MODULE_ID, "lowHp", {
    name: "DXSE.Settings.LowHp.Name", hint: "DXSE.Settings.LowHp.Hint",
    scope: "world", config: true, type: Number, default: 25,
    range: { min: 5, max: 60, step: 5 }, onChange: refresh
  });
  game.settings.register(MODULE_ID, "gm", {
    name: "DXSE.Settings.Gm.Name", hint: "DXSE.Settings.Gm.Hint",
    scope: "client", config: true, type: Boolean, default: false, onChange: refresh
  });
  game.settings.register(MODULE_ID, "disabled", {
    scope: "client", config: false, type: Array, default: [], onChange: refresh
  });
  game.settings.registerMenu(MODULE_ID, "effectsMenu", {
    name: "DXSE.Menu.Name", label: "DXSE.Menu.Label", hint: "DXSE.Menu.Hint",
    icon: "fa-solid fa-eye", type: EffectsConfig, restricted: false
  });

  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = { preview, refresh: () => scheduleRefresh(), effects: EFFECTS.map(e => e.id) };
});

Hooks.once("ready", () => {
  buildOverlay();
  scheduleRefresh();
});

/* -------------------------------------------- */
/*  Overlay                                     */
/* -------------------------------------------- */

function buildOverlay() {
  if (state.overlay) return;
  const overlay = document.createElement("div");
  overlay.id = "dxse-overlay";
  overlay.setAttribute("aria-hidden", "true");
  for (const e of EFFECTS) {
    const layer = document.createElement("div");
    layer.className = `dxse-layer dxse-${e.id}`;
    if (OVERLAYS[e.id]) {
      // An animated overlay: a backdrop filter for the map behind it, and the canvas it is drawn on.
      layer.classList.add("dxse-canvas-layer");
      layer.innerHTML = `<div class="dxse-filter"></div><canvas class="dxse-canvas"></canvas>`;
      state.canvases[e.id] = {
        canvas: layer.querySelector("canvas"), filter: layer.querySelector(".dxse-filter"),
        ctx: null, W: 0, H: 0, s: null, fx: { level: 1 }, offAt: 0, on: false
      };
    } else {
      layer.innerHTML = `<div class="dxse-fx"></div><div class="dxse-fx2"></div><div class="dxse-fx3"></div>`;
    }
    overlay.appendChild(layer);
    state.layers[e.id] = layer;
  }
  // Right after the game canvas, so it covers the play area but stays under the UI.
  const board = document.getElementById("board");
  if (board?.parentElement) {
    board.after(overlay);
    const z = parseInt(getComputedStyle(board).zIndex, 10);
    if (Number.isFinite(z)) overlay.style.zIndex = String(z);
  } else {
    document.body.prepend(overlay);
  }
  state.overlay = overlay;
  watchSidebar();
}

/**
 * Keep the overlay from covering the sidebar: the sidebar's width, less the full width of its
 * tab strip (padding and border included), is taken off the overlay's right side. So the
 * effects stop at the sidebar's content but still run under the tabs. Followed as the sidebar
 * expands, collapses or changes with the window.
 */
function watchSidebar() {
  if (state.sidebarObserver) return;
  const width = id => document.getElementById(id)?.getBoundingClientRect().width ?? 0;
  const apply = () => {
    const inset = width("sidebar") - width("sidebar-tabs");
    state.overlay?.style.setProperty("--dxse-sidebar", `${Math.max(0, Math.round(inset))}px`);
    resizeCanvases();
  };
  apply();
  const watched = ["sidebar", "sidebar-tabs"].map(id => document.getElementById(id)).filter(Boolean);
  if (watched.length && "ResizeObserver" in window) {
    state.sidebarObserver = new ResizeObserver(apply);
    for (const el of watched) state.sidebarObserver.observe(el);
  }
  window.addEventListener("resize", apply);
  Hooks.on("collapseSidebar", () => {
    apply();
    setTimeout(apply, 350);   // once more after the collapse animation has finished
  });
}

/* -------------------------------------------- */
/*  Whose conditions                            */
/* -------------------------------------------- */

/** The actor whose conditions this user sees, or null. */
export function watchedActor() {
  if (game.user.isGM && !game.settings.get(MODULE_ID, "gm")) return null;
  const owned = t => t && !t.destroyed && t.actor?.isOwner;
  const controlled = canvas?.tokens?.controlled ?? [];
  if (controlled.length) {
    if (controlled.includes(state.lastControlled) && owned(state.lastControlled)) return state.lastControlled.actor;
    const t = controlled.findLast?.(owned) ?? [...controlled].reverse().find(owned);
    if (t) return t.actor;
  }
  if (!game.user.isGM && game.user.character) {
    // Prefer the character's token on this scene (unlinked tokens carry their own conditions).
    const tokens = game.user.character.getActiveTokens?.() ?? [];
    return tokens[0]?.actor ?? game.user.character;
  }
  return null;
}

/* -------------------------------------------- */
/*  Reading conditions                          */
/* -------------------------------------------- */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Work out which effects are active for an actor and how strong they are.
 * @returns {Record<string, {level: number, variant?: string}>}
 */
export function effectsFor(actor) {
  const out = {};
  if (!actor) return out;
  const statuses = actor.statuses ?? new Set();
  const has = s => statuses.has(s);

  // HP
  const hp = foundry.utils.getProperty(actor, "system.attributes.hp");
  const hpMax = Number(hp?.effectiveMax ?? ((hp?.max ?? 0) + (hp?.tempmax ?? 0)));
  const hpValue = Number(hp?.value);
  const hasHp = Number.isFinite(hpValue) && hpMax > 0;
  const dead = has("dead");
  const down = hasHp && hpValue <= 0;

  // Unconscious / dying / dead
  if (dead) out.unconscious = { level: 1, variant: "dead" };
  else if (down && !has("stable")) {
    const fails = Number(foundry.utils.getProperty(actor, "system.attributes.death.failure")) || 0;
    out.unconscious = { level: clamp(0.6 + fails * 0.15, 0.6, 1), variant: "dying" };
  }
  else if (has("unconscious") || down) out.unconscious = { level: 0.8, variant: "unconscious" };

  // Low HP (not while down: that is the unconscious/dying effect)
  if (hasHp && !out.unconscious) {
    const threshold = game.settings.get(MODULE_ID, "lowHp") / 100;
    const frac = hpValue / hpMax;
    if (frac <= threshold) out.lowhp = { level: clamp((threshold - frac) / threshold, 0.15, 1) };
  }

  // Exhaustion: gradual by level
  let exh = Number(foundry.utils.getProperty(actor, "system.attributes.exhaustion")) || 0;
  if (!exh && has("exhaustion")) exh = 1;
  if (exh > 0) {
    const max = CONFIG.DND5E?.conditionTypes?.exhaustion?.levels ?? 6;
    out.exhaustion = { level: clamp(exh / max, 0.05, 1), step: Math.min(exh, max) };
  }

  // Simple status conditions
  for (const e of EFFECTS) {
    if (!e.statuses || out[e.id]) continue;
    if (e.statuses.some(has)) out[e.id] = { level: 1, variant: e.statuses.find(has) };
  }
  return out;
}

/* -------------------------------------------- */
/*  Applying                                    */
/* -------------------------------------------- */

function scheduleRefresh() {
  clearTimeout(state.timer);
  state.timer = setTimeout(refresh, 60);
}

function refresh() {
  if (!state.overlay) return;
  const overlay = state.overlay;
  const enabled = game.settings.get(MODULE_ID, "enabled");
  const disabled = new Set(game.settings.get(MODULE_ID, "disabled") ?? []);
  overlay.style.setProperty("--dxse-master", String(game.settings.get(MODULE_ID, "intensity")));
  overlay.classList.toggle("dxse-calm", !!game.settings.get(MODULE_ID, "calm"));

  const active = enabled ? effectsFor(watchedActor()) : {};
  for (const [id, p] of state.previews) {
    if (p.until > Date.now()) active[id] = active[id] ?? PREVIEW_LOOK[id] ?? { level: 1 };
  }
  for (const e of EFFECTS) {
    const layer = state.layers[e.id];
    const fx = !disabled.has(e.id) || state.previews.has(e.id) ? active[e.id] : null;
    layer.classList.toggle("dxse-on", !!fx);
    if (fx) {
      layer.style.setProperty("--dxse-level", fx.level.toFixed(3));
      layer.dataset.variant = fx.variant ?? "";
      layer.dataset.step = fx.step ?? "";
    }
    const c = state.canvases[e.id];
    if (c) {
      if (fx) {
        if (!c.on) {
          c.s = null;                    // a fresh start each time it comes on
          c.onAt = performance.now();
        }
        c.fx = fx;
      } else if (c.on) c.offAt = performance.now();
      c.on = !!fx;
    }
  }
  animate();
}

/* -------------------------------------------- */
/*  Animated overlays                           */
/* -------------------------------------------- */

const reducedMotion = () => !!game.settings.get(MODULE_ID, "calm") || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Size the canvases to the overlay. Drawn below full resolution on big screens: the effects are soft. */
function resizeCanvases() {
  const rect = state.overlay?.getBoundingClientRect();
  if (!rect?.width) return;
  const scale = Math.min(1, 1600 / rect.width);
  const W = Math.max(2, Math.round(rect.width * scale)), H = Math.max(2, Math.round(rect.height * scale));
  let changed = false;
  for (const c of Object.values(state.canvases)) {
    if (c.W === W && c.H === H) continue;
    c.W = W; c.H = H;
    c.canvas.width = W; c.canvas.height = H;
    c.ctx = c.canvas.getContext("2d");
    changed = true;
  }
  if (!changed) return;
  // The sidebar animating or the window being dragged resizes on many frames in a row: keep
  // drawing the running overlays at the new size, and only rebuild them (their state is sized
  // to the screen) once the size has settled.
  clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(() => {
    for (const c of Object.values(state.canvases)) c.s = null;
    if (Object.values(state.canvases).some(c => c.on)) paint(0);
  }, 200);
  if (Object.values(state.canvases).some(c => c.on && c.s)) paint(0);
}

/** Identity values of the CSS filter functions the overlays use (what "no effect" is for each). */
const FILTER_IDENTITY = { blur: 0, brightness: 1, contrast: 1, saturate: 1, grayscale: 0, sepia: 0, "hue-rotate": 0, invert: 0, opacity: 1 };

/**
 * Scale a filter from no effect (k = 0) to full (k = 1), function by function.
 * Backdrop filters can't simply be faded with opacity: an ancestor below full opacity cuts
 * them off from the map behind, so the fade and the strength setting are applied here instead.
 */
function scaleFilter(filter, k) {
  if (!filter || k >= 0.999) return filter;
  if (k <= 0.001) return "";
  return filter.replace(/([a-z-]+)\(\s*(-?[\d.]+)([a-z%]*)\s*\)/g, (m, fn, v, unit) => {
    const id = FILTER_IDENTITY[fn];
    if (id === undefined) return m;
    const val = id + (parseFloat(v) - id) * k;
    return `${fn}(${+val.toFixed(4)}${unit})`;
  });
}

/** How far an overlay has faded in (0-1), times the strength setting. */
function fadeOf(c, now) {
  const master = Number(game.settings.get(MODULE_ID, "intensity")) || 1;
  if (reducedMotion()) return c.on ? master : 0;
  const k = c.on ? (now - (c.onAt ?? 0)) / FADE_MS : 1 - (now - c.offAt) / FADE_MS;
  return Math.min(1, Math.max(0, k)) * master;
}

/** Is this overlay visible (on, or still fading out)? */
const showing = (c, now) => c.on || now - c.offAt < FADE_MS;

/** Draw one frame of every visible overlay. */
function paint(dt) {
  const now = performance.now();
  for (const [id, c] of Object.entries(state.canvases)) {
    if (!showing(c, now) || !c.ctx) continue;
    const def = OVERLAYS[id];
    if (!c.s) {
      c.s = def.init ? def.init(c.W, c.H, c.fx) : {};
      // Warm up so particles are already spread out when it appears (and when motion is reduced).
      for (let i = 0; i < 90; i++) {
        c.ctx.clearRect(0, 0, c.W, c.H);
        def.draw(c.ctx, c.W, c.H, state.time + i / 30, 1 / 30, c.s, c.fx);
      }
    }
    const filter = scaleFilter(def.filter?.(state.time, c.fx) ?? "", fadeOf(c, now));
    c.filter.style.backdropFilter = filter;
    c.filter.style.webkitBackdropFilter = filter;
    c.canvas.style.transform = def.motion && dt > 0 ? def.motion(state.time, c.fx) : "";
    c.ctx.clearRect(0, 0, c.W, c.H);
    def.draw(c.ctx, c.W, c.H, state.time, dt, c.s, c.fx);
  }
}

/** Run the animation while any overlay is visible; with reduced motion, draw one still frame. */
function animate() {
  if (!state.overlay) return;
  if (!state.canvases || !Object.keys(state.canvases).length) return;
  if (!Object.values(state.canvases).some(c => c.ctx)) resizeCanvases();
  if (reducedMotion()) {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = null;
    paint(0);
    return;
  }
  if (state.frame) return;
  state.last = performance.now();
  const step = now => {
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;
    state.time += dt;
    paint(dt);
    const any = Object.values(state.canvases).some(c => showing(c, now));
    state.frame = any && !reducedMotion() ? requestAnimationFrame(step) : null;
  };
  state.frame = requestAnimationFrame(step);
}

/** How previews look for effects that have levels or variants. */
const PREVIEW_LOOK = {
  lowhp: { level: 0.7 },
  exhaustion: { level: 4 / 6, step: 4 },
  unconscious: { level: 0.75, variant: "dying" }
};

/** Show an effect for a while, whatever the conditions (for trying them out). */
export function preview(id, ms = 4000) {
  if (!EFFECTS.some(e => e.id === id)) return;
  buildOverlay();
  clearTimeout(state.previews.get(id)?.timer);
  const timer = setTimeout(() => {
    state.previews.delete(id);
    scheduleRefresh();
  }, ms + 20);
  state.previews.set(id, { until: Date.now() + ms, timer });
  refresh();
}

/* -------------------------------------------- */
/*  Hooks that can change what is shown         */
/* -------------------------------------------- */

Hooks.on("controlToken", (token, controlled) => {
  if (controlled) state.lastControlled = token;
  else if (state.lastControlled === token) state.lastControlled = null;
  scheduleRefresh();
});
for (const hook of ["updateActor", "updateToken", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect",
  "canvasReady", "updateUser", "deleteToken", "createToken"]) {
  Hooks.on(hook, () => scheduleRefresh());
}

/* -------------------------------------------- */
/*  Effects menu                                */
/* -------------------------------------------- */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class EffectsConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "dxse-effects-config",
    tag: "form",
    classes: ["dxse-config"],
    window: { title: "DXSE.Menu.Name", icon: "fa-solid fa-eye" },
    position: { width: 420, height: "auto" },
    form: { handler: EffectsConfig.#onSubmit, closeOnSubmit: true },
    actions: { preview: EffectsConfig.#onPreview }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/effects.hbs` }
  };

  async _prepareContext() {
    const disabled = new Set(game.settings.get(MODULE_ID, "disabled") ?? []);
    return {
      effects: EFFECTS.map(e => ({ id: e.id, label: game.i18n.localize(e.label), enabled: !disabled.has(e.id) }))
    };
  }

  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const disabled = EFFECTS.filter(e => !data[e.id]).map(e => e.id);
    await game.settings.set(MODULE_ID, "disabled", disabled);
  }

  static #onPreview(event, target) {
    preview(target.dataset.effect, 4000);
  }
}
