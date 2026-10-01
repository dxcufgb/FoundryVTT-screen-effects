/**
 * Dxcufgb's screen effects (dxcufgbs-screen-effects) - Foundry VTT V13
 *
 * Shows a full-screen effect (coloured vignette, haze, blur, ...) on a player's own
 * screen while their character suffers a condition: low HP, poisoned, charmed, stunned,
 * frightened, paralyzed, petrified, invisible, restrained/grappled, exhaustion (gradual)
 * and unconscious/dying/dead.
 *
 * Whose conditions: the token the player controls (the most recently selected one when
 * several are selected), otherwise the player's assigned character. GMs see nothing unless
 * they turn on "Show effects to the GM".
 *
 * The effects are pure CSS layers placed over the game canvas and under Foundry's UI,
 * so they cover the whole play area but never block clicks.
 *
 * API: game.modules.get("dxcufgbs-screen-effects").api
 *   .preview("poisoned", 4000)    show an effect for a few seconds
 *   .refresh()                    re-check the conditions
 */

export const MODULE_ID = "dxcufgbs-screen-effects";

/** The effects, in stacking order (later ones draw on top). */
export const EFFECTS = [
  { id: "exhaustion", label: "DXSE.Effect.Exhaustion" },
  { id: "poisoned", label: "DXSE.Effect.Poisoned", statuses: ["poisoned"] },
  { id: "charmed", label: "DXSE.Effect.Charmed", statuses: ["charmed"] },
  { id: "invisible", label: "DXSE.Effect.Invisible", statuses: ["invisible"] },
  { id: "restrained", label: "DXSE.Effect.Restrained", statuses: ["restrained", "grappled"] },
  { id: "frightened", label: "DXSE.Effect.Frightened", statuses: ["frightened"] },
  { id: "paralyzed", label: "DXSE.Effect.Paralyzed", statuses: ["paralyzed"] },
  { id: "petrified", label: "DXSE.Effect.Petrified", statuses: ["petrified"] },
  { id: "stunned", label: "DXSE.Effect.Stunned", statuses: ["stunned"] },
  { id: "lowhp", label: "DXSE.Effect.LowHp" },
  { id: "unconscious", label: "DXSE.Effect.Unconscious", statuses: ["unconscious", "dead"] }
];

const state = {
  overlay: null,
  layers: {},
  lastControlled: null,
  previews: new Map(),      // effect id -> {until, timer}
  timer: null
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
    layer.innerHTML = `<div class="dxse-fx"></div><div class="dxse-fx2"></div><div class="dxse-fx3"></div>`;
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
  }
}

/** How previews look for effects that have levels or variants. */
const PREVIEW_LOOK = {
  lowhp: { level: 0.7 },
  exhaustion: { level: 4 / 6, step: 4 },
  unconscious: { level: 0.75, variant: "dying" },
  restrained: { level: 1, variant: "restrained" }
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
