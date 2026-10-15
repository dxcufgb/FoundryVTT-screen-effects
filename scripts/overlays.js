/**
 * Dxcufgb's screen effects - the animated condition overlays.
 *
 * Each overlay is drawn on its own 2D canvas over the game canvas, with an optional backdrop
 * filter (blur, desaturation, tint) on the map behind it. Nothing ever transforms Foundry's own
 * canvas, so clicking, dragging and measuring on the map keep working.
 *
 * An overlay:
 *   filter(t, fx)          the backdrop filter for the map behind it ("" for none)
 *   motion(t, fx)          optional CSS transform for the overlay canvas (sway, jolts)
 *   init(W, H, fx)         its state; called again when the screen is resized
 *   draw(ctx, W, H, t, dt, s, fx)   one frame. t: seconds, dt: frame seconds (0 when motion is reduced)
 * fx is what main.js worked out for the condition: {level 0-1, variant, step}.
 *
 * Everything is drawn in code for this module; no images.
 */

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* -------------------------------------------- */
/*  Drawing helpers                             */
/* -------------------------------------------- */

function vignette(ctx, W, H, rgb, inner, outer, a0, a1, cx = W / 2, cy = H / 2) {
  const R = Math.hypot(W, H) / 2;
  const gr = ctx.createRadialGradient(cx, cy, R * inner, cx, cy, R * outer);
  gr.addColorStop(0, `rgba(${rgb},${a0})`);
  gr.addColorStop(1, `rgba(${rgb},${a1})`);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
}

function puff(ctx, x, y, r, rgb, a) {
  if (r <= 0 || a <= 0) return;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.4, x - s * 0.45, y - s * 1.1, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.1, x + s * 1.1, y - s * 0.4, x, y + s * 0.35);
  ctx.fill();
}

function star4(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

/** A heartbeat: a strong beat and a weaker one, `period` seconds apart. */
function beat(t, period = 1.1) {
  const p = (t % period) / period;
  return Math.exp(-Math.pow((p - 0.05) / 0.04, 2)) + 0.6 * Math.exp(-Math.pow((p - 0.22) / 0.05, 2));
}

/** A random point just outside one of the four screen edges. */
function edgePoint(W, H) {
  const s = Math.floor(rand(0, 4));
  return s === 0 ? [rand(0, W), -10] : s === 1 ? [W + 10, rand(0, H)] : s === 2 ? [rand(0, W), H + 10] : [-10, rand(0, H)];
}

/** Eyelids closing from the top and bottom: close 0 (open) to 1 (shut). */
function lids(ctx, W, H, close, soft = 0.18) {
  const h = (H / 2) * clamp(close, 0, 1);
  const s = H * soft;
  for (const top of [true, false]) {
    const y0 = top ? 0 : H, y1 = top ? h + s : H - h - s;
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, "rgba(0,0,0,1)");
    gr.addColorStop(clamp(h / (h + s), 0, 1), "rgba(0,0,0,0.95)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, top ? 0 : y1, W, h + s);
  }
}

/** The exhaustion level shown (1 = first); from fx.step, or worked out from fx.level on a 6-level scale. */
function exhaustionStep(fx) {
  return Number(fx.step) || Math.max(1, Math.round((fx.level ?? 1) * 6));
}

/** Advance and draw a list of particles; `step(p)` returns false to remove one. */
function run(list, step) {
  let k = 0;
  for (const p of list) if (step(p) !== false) list[k++] = p;
  list.length = k;
}

/* -------------------------------------------- */
/*  Overlays                                    */
/* -------------------------------------------- */

export const OVERLAYS = {

  // Darkness swallows the screen; a dim smear survives in the middle, with murk drifting through it.
  blinded: {
    filter: () => "blur(3px) brightness(0.55) saturate(0.4)",
    init: (W, H) => ({
      murk: Array.from({ length: 14 }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.15, 0.3) * W, vx: rand(-8, 8), vy: rand(-6, 6) }))
    }),
    draw(ctx, W, H, t, dt, s) {
      for (const m of s.murk) {
        m.x += m.vx * dt * W / 600; m.y += m.vy * dt * W / 600;
        if (m.x < -m.r) m.x = W + m.r; if (m.x > W + m.r) m.x = -m.r;
        if (m.y < -m.r) m.y = H + m.r; if (m.y > H + m.r) m.y = -m.r;
        puff(ctx, m.x, m.y, m.r, "0,0,0", 0.3);
      }
      vignette(ctx, W, H, "0,0,0", 0.08, 0.7, 0.12 + 0.06 * Math.sin(t * 0.7), 0.97);
    }
  },

  // A rosy haze at the edges, and hearts drifting inward toward the one who charmed you.
  charmed: {
    filter: () => "saturate(1.25) sepia(0.15) brightness(1.05)",
    init: () => ({ hearts: [] }),
    draw(ctx, W, H, t, dt, s) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      vignette(ctx, W, H, "255,110,170", 0.25, 0.85, 0, 0.38 + 0.12 * pulse);
      if (Math.random() < dt * 9) {
        const [x, y] = edgePoint(W, H);
        s.hearts.push({ x, y, age: 0, life: rand(3, 5), size: rand(0.008, 0.016) * W, ph: rand(0, TAU) });
      }
      const tx = W * 0.72, ty = H * 0.35;   // where the charmer pulls
      ctx.fillStyle = "#ff7ab8";
      run(s.hearts, p => {
        p.age += dt;
        const k = p.age / p.life, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
        p.x += (dx / d) * W * 0.06 * dt + Math.sin(t * 2 + p.ph) * W * 0.01 * dt;
        p.y += (dy / d) * W * 0.06 * dt;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.85;
        heart(ctx, p.x, p.y, p.size * (1 + 0.15 * pulse));
        return k < 1;
      });
      ctx.globalAlpha = 1;
      puff(ctx, tx, ty, W * 0.12, "255,140,200", 0.14 + 0.08 * pulse);
    }
  },

  // The colour drains; broken sound rings spread out and die before they reach the edges.
  deafened: {
    filter: () => "grayscale(0.55) blur(0.6px)",
    init: () => ({ rings: [], next: 0 }),
    draw(ctx, W, H, t, dt, s) {
      vignette(ctx, W, H, "40,44,50", 0.3, 0.9, 0, 0.6);
      if ((s.next -= dt) <= 0) { s.rings.push({ r: 0, x: rand(0.2, 0.8) * W, y: rand(0.25, 0.75) * H }); s.next = rand(0.8, 1.6); }
      ctx.lineWidth = Math.max(1.5, W * 0.0025);
      ctx.setLineDash([W * 0.012, W * 0.018]);
      ctx.lineDashOffset = -t * 20;
      run(s.rings, g => {
        g.r += W * 0.09 * dt;
        const k = g.r / (W * 0.2);
        if (k >= 1) return false;
        ctx.strokeStyle = `rgba(220,226,235,${(1 - k) * 0.45})`;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.stroke();
      });
      ctx.setLineDash([]);
    }
  },

  // Worse with every level (fx.level = level / max level, fx.step = the level):
  //   1  the edges darken and the colour starts to drain, breathing slowly
  //   2  + the eyelids rest a little lowered
  //   3  + they sag shut now and then and take a while to open again
  //   4  + the world blurs and the view sways as you stagger
  //   5  + blinks come often, close almost fully and reopen slowly
  //   6  (the last level) barely conscious: eyes nearly shut, almost black
  exhaustion: {
    filter: (t, fx) => {
      const lvl = fx.level ?? 1, step = exhaustionStep(fx);
      const blur = step >= 4 ? (0.6 + 2.2 * (lvl - 0.5)) * (0.85 + 0.15 * Math.sin(t * 0.9)) : 0;
      return `saturate(${(1 - 0.65 * lvl).toFixed(2)}) brightness(${(1 - 0.38 * lvl + 0.04 * Math.sin(t * 1.2)).toFixed(3)})`
        + ` contrast(${(1 - 0.12 * lvl).toFixed(2)})` + (blur > 0 ? ` blur(${blur.toFixed(2)}px)` : "");
    },
    motion: (t, fx) => {
      if (exhaustionStep(fx) < 4) return "";
      const a = fx.level ?? 1;   // a slow, heavy stagger
      return `translate(${(Math.sin(t * 0.45) * 0.5 * a).toFixed(2)}%, ${(Math.sin(t * 0.7 + 1) * 0.3 * a).toFixed(2)}%) rotate(${(Math.sin(t * 0.38) * 0.6 * a).toFixed(2)}deg)`;
    },
    init: () => ({ blink: 2, phase: 0, length: 2 }),
    draw(ctx, W, H, t, dt, s, fx) {
      const lvl = fx.level ?? 1, step = exhaustionStep(fx);
      const breath = 0.5 + 0.5 * Math.sin(t * (1.5 - 0.7 * lvl));     // slower, heavier breathing
      vignette(ctx, W, H, "10,8,6", 0.35 - 0.3 * lvl, 0.85, 0, 0.2 + 0.6 * lvl + 0.15 * lvl * breath);
      // Eyelids: resting droop from level 2, then blinks from level 3
      let close = step >= 2 ? (lvl - 0.2) * 0.32 + 0.05 * lvl * breath : 0;
      if (lvl >= 0.999) close = Math.max(close, 0.62 + 0.05 * breath);   // the last level
      if (step >= 3) {
        s.blink -= dt;
        if (s.blink < 0) {
          s.phase += dt;
          const k = Math.min(1, s.phase / s.length);
          // close quickly, reopen slowly: the struggle to keep the eyes open
          const shape = k < 0.3 ? Math.sin((k / 0.3) * Math.PI / 2) : Math.cos(((k - 0.3) / 0.7) * Math.PI / 2);
          close += (0.2 + 0.7 * lvl) * shape * (1 - close);
          if (k >= 1) {
            s.phase = 0;
            s.length = 1.4 + 3 * lvl;                    // longer to recover at higher levels
            s.blink = rand(5, 8) * (1.45 - lvl);         // and more often
          }
        }
      }
      if (close > 0) lids(ctx, W, H, close);
    }
  },

  // A heartbeat throbs red and black at the edges, jolting the view, while dark tendrils reach in.
  frightened: {
    filter: () => "saturate(0.75) contrast(1.1)",
    motion: t => {
      const b = beat(t);
      return `translate(${(Math.sin(t * 90) * b * 0.25).toFixed(2)}%, ${(Math.cos(t * 70) * b * 0.25).toFixed(2)}%) scale(${(1 + b * 0.01).toFixed(4)})`;
    },
    init: () => ({ tendrils: Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * TAU + rand(-0.2, 0.2), len: rand(0.42, 0.58), ph: rand(0, TAU) })) }),
    draw(ctx, W, H, t, dt, s) {
      const b = beat(t);
      vignette(ctx, W, H, "90,0,8", 0.2, 0.85, 0, 0.45 + 0.35 * b);
      vignette(ctx, W, H, "0,0,0", 0.45, 0.95, 0, 0.55);
      const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2;
      ctx.strokeStyle = "rgba(8,0,4,0.85)";
      ctx.lineCap = "round";
      for (const td of s.tendrils) {
        const reach = td.len + 0.04 * Math.sin(t * 0.8 + td.ph) + 0.03 * b;
        let px, py;
        for (let i = 0; i <= 20; i++) {
          const k = i / 20, r = R * (1 - reach * k);
          const a = td.a + Math.sin(k * 5 + t * 1.3 + td.ph) * 0.12 * k;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          if (i) {
            ctx.lineWidth = W * 0.018 * (1 - k) + 1.5;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
          }
          px = x; py = y;
        }
      }
      ctx.lineCap = "butt";
    }
  },

  // Shadowy fingers close in from both sides of the screen and tighten in slow squeezes.
  grappled: {
    filter: () => "saturate(0.85)",
    motion: t => `scale(${(1 - 0.006 * Math.max(0, Math.sin(t * 1.6))).toFixed(4)})`,
    draw(ctx, W, H, t) {
      const sq = Math.max(0, Math.sin(t * 1.6));
      vignette(ctx, W, H, "20,10,6", 0.35, 0.9, 0, 0.5 + 0.2 * sq);
      ctx.lineCap = "round";
      ctx.filter = `blur(${Math.max(1, W * 0.004)}px)`;
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -W * 0.02 : W * 1.02;
        for (let f = 0; f < 4; f++) {
          const y0 = H * (0.28 + f * 0.15);
          const len = W * (0.11 + 0.015 * Math.sin(f * 1.7)) + W * 0.025 * sq, curl = 0.9 + 0.5 * sq;
          const x1 = x0 - side * len * 0.7, x2 = x0 - side * len;
          ctx.strokeStyle = "rgba(12,6,4,0.82)";
          ctx.lineWidth = H * 0.06 * (1 - f * 0.08);
          ctx.beginPath(); ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(x1, y0 - H * 0.02, x2, y0 + H * 0.02 * curl);
          ctx.lineTo(x2 + side * W * 0.015 * curl, y0 + H * 0.05 * curl);
          ctx.stroke();
          ctx.strokeStyle = "rgba(60,40,30,0.25)";
          ctx.lineWidth = H * 0.01;
          ctx.beginPath(); ctx.moveTo(x0, y0 - H * 0.015);
          ctx.quadraticCurveTo(x1, y0 - H * 0.035, x2, y0 + H * 0.01 * curl);
          ctx.stroke();
        }
        puff(ctx, x0, H * 0.5, H * 0.55, "10,5,3", 0.7);
      }
      ctx.filter = "none";
      ctx.lineCap = "butt";
    }
  },

  // Grey and dazed: faint spiral arms turn slowly over a blurred, colourless map.
  incapacitated: {
    filter: () => "grayscale(0.75) blur(1.4px)",
    draw(ctx, W, H, t) {
      vignette(ctx, W, H, "30,32,36", 0.3, 0.9, 0.05, 0.6);
      const cx = W / 2, cy = H / 2;
      ctx.lineWidth = W * 0.008;
      ctx.strokeStyle = "rgba(230,235,240,0.09)";
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const k = i / 80, a = (arm / 3) * TAU + k * 5.5 + t * 0.4, r = k * W * 0.45;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
  },

  // A cool, glassy shimmer: rippling light bands drift over the map and glints sparkle at the edges.
  invisible: {
    filter: () => "saturate(0.9) hue-rotate(-8deg) brightness(1.05)",
    init: () => ({ glints: [] }),
    draw(ctx, W, H, t, dt, s) {
      vignette(ctx, W, H, "200,225,255", 0.35, 0.95, 0, 0.35);
      ctx.fillStyle = "rgba(220,235,255,0.05)";
      ctx.fillRect(0, 0, W, H);
      // heat-haze bands
      ctx.lineWidth = H * 0.02;
      for (let i = 0; i < 6; i++) {
        const y0 = ((i / 6 + t * 0.03) % 1) * H;
        ctx.strokeStyle = `rgba(230,240,255,${0.035 + 0.02 * Math.sin(t + i)})`;
        ctx.beginPath();
        for (let x = 0; x <= W; x += W / 40) {
          const y = y0 + Math.sin(x * 0.012 + t * 2.2 + i) * H * 0.012;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      if (Math.random() < dt * 18) {
        const a = rand(0, TAU), r = rand(0.38, 0.5);
        s.glints.push({ x: W / 2 + Math.cos(a) * W * r, y: H / 2 + Math.sin(a) * H * r * 1.1, age: 0, life: rand(0.6, 1.2) });
      }
      ctx.fillStyle = "#f0f8ff";
      run(s.glints, p => {
        p.age += dt;
        const k = p.age / p.life;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.85;
        star4(ctx, p.x, p.y, W * 0.006 * (1 - k * 0.5));
        return k < 1;
      });
      ctx.globalAlpha = 1;
    }
  },

  // Held fast: a great rune circle locks over the screen and violet crackles snap at the edges.
  paralyzed: {
    filter: () => "grayscale(0.6) brightness(0.9)",
    init: () => ({ cracks: [], next: 0 }),
    draw(ctx, W, H, t, dt, s) {
      vignette(ctx, W, H, "70,20,110", 0.3, 0.9, 0, 0.5);
      const cx = W / 2, cy = H / 2, R = H * 0.42, rot = t * 0.05, u = W / 900;
      ctx.strokeStyle = `rgba(200,160,255,${0.35 + 0.1 * Math.sin(t * 2)})`;
      ctx.lineWidth = Math.max(1.2, W * 0.002);
      for (const rr of [R, R * 0.88]) { ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU + rot;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * R * 0.94, cy + Math.sin(a) * R * 0.94);
        ctx.rotate(a + Math.PI / 2);
        ctx.scale(u, u);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        const k = i % 4;
        if (k === 0) { ctx.moveTo(-5, -4); ctx.lineTo(0, 4); ctx.lineTo(5, -4); }
        else if (k === 1) { ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); }
        else if (k === 2) ctx.arc(0, 0, 4, 0, TAU);
        else { ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4); }
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = "rgba(200,160,255,0.12)";
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + rot + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88);
        ctx.lineTo(cx + Math.cos(a + Math.PI) * R * 0.88, cy + Math.sin(a + Math.PI) * R * 0.88);
        ctx.stroke();
      }
      if (dt > 0 && (s.next -= dt) <= 0) {
        s.next = rand(0.15, 0.5);
        const [ex, ey] = edgePoint(W, H);
        let x = clamp(ex, 0, W), y = clamp(ey, 0, H);
        const ang = Math.atan2(cy - y, cx - x), pts = [[x, y]];
        for (let i = 0; i < 7; i++) { x += Math.cos(ang + rand(-0.9, 0.9)) * W * 0.018; y += Math.sin(ang + rand(-0.9, 0.9)) * W * 0.018; pts.push([x, y]); }
        s.cracks.push({ pts, age: 0 });
      }
      ctx.lineWidth = Math.max(1.5, W * 0.002);
      run(s.cracks, c => {
        c.age += dt;
        const a = 1 - c.age / 0.25;
        if (a <= 0) return false;
        ctx.strokeStyle = `rgba(235,210,255,${a})`;
        ctx.beginPath();
        c.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      });
    }
  },

  // Cracked stone creeps in from every edge and slowly grinds forward, dropping grit; the world turns grey.
  petrified: {
    filter: () => "grayscale(1) sepia(0.2) contrast(1.05) brightness(0.9)",
    init(W, H) {
      // Stone texture and a "creep" field (distance from the edge plus noise), baked once at a
      // third of the size: the stone is soft-edged anyway and this keeps resizing cheap.
      const w = Math.max(2, Math.round(W / 3)), h = Math.max(2, Math.round(H / 3));
      const tex = document.createElement("canvas");
      tex.width = w; tex.height = h;
      const g = tex.getContext("2d"), img = g.createImageData(w, h), d = img.data;
      const seeds = Array.from({ length: 50 }, () => [rand(0, w), rand(0, h)]);
      const sc = 640 / w;   // keep the stone's grain the same at any screen size
      const n = (x, y) => Math.sin(x * 0.045 * sc) * Math.cos(y * 0.05 * sc) + Math.sin((x + y) * 0.021 * sc) * 0.7 + Math.sin(x * 0.11 * sc - y * 0.09 * sc) * 0.3;
      const field = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        field[i] = Math.min(x, y, w - x, h - y) / (h * 0.5) + n(x, y) * 0.12;
        let m1 = 1e9, m2 = 1e9;
        for (const [sx, sy] of seeds) {
          const dd = (sx - x) ** 2 + (sy - y) ** 2;
          if (dd < m1) { m2 = m1; m1 = dd; } else if (dd < m2) m2 = dd;
        }
        const crack = Math.sqrt(m2) - Math.sqrt(m1) < 1.2 ? 0.45 : 1;
        const v = (110 + n(x * 3, y * 3) * 18 + Math.random() * 16) * crack;
        d[i * 4] = v; d[i * 4 + 1] = v * 0.97; d[i * 4 + 2] = v * 0.92; d[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const mask = document.createElement("canvas");
      mask.width = w; mask.height = h;
      return { tex, field, mask, w, h, last: -1, grit: [] };
    },
    draw(ctx, W, H, t, dt, s) {
      const lvl = 0.33 + 0.05 * Math.sin(t * 0.35), q = Math.round(lvl * 200);
      if (q !== s.last) {
        s.last = q;
        const g = s.mask.getContext("2d"), img = g.createImageData(s.w, s.h), d = img.data;
        for (let i = 0; i < s.w * s.h; i++) d[i * 4 + 3] = clamp((lvl - s.field[i]) / 0.03, 0, 1) * 255;
        g.clearRect(0, 0, s.w, s.h);
        g.putImageData(img, 0, 0);
        g.globalCompositeOperation = "source-in";
        g.drawImage(s.tex, 0, 0);
        g.globalCompositeOperation = "source-over";
      }
      vignette(ctx, W, H, "40,38,34", 0.4, 0.95, 0, 0.5);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(s.mask, 0, 0, W, H);
      if (Math.random() < dt * 25) {
        const [x, y] = edgePoint(W, H);
        s.grit.push({ x: clamp(x, 4, W - 4) + rand(-1, 1) * W * 0.05, y: clamp(y, 4, H - 4), vy: rand(10, 40), age: 0, life: rand(0.6, 1.4) });
      }
      ctx.fillStyle = "#b8b0a4";
      const gs = Math.max(2, W / 600);
      run(s.grit, p => {
        p.age += dt; p.y += p.vy * dt;
        ctx.globalAlpha = 1 - p.age / p.life;
        ctx.fillRect(p.x, p.y, gs, gs);
        return p.age < p.life;
      });
      ctx.globalAlpha = 1;
    }
  },

  // Sickly green, a slow nauseous sway, and toxic bubbles and vapour at the edges.
  poisoned: {
    filter: () => "sepia(0.35) hue-rotate(45deg) saturate(1.2) brightness(0.92)",
    motion: t => `rotate(${(Math.sin(t * 0.9) * 1.2).toFixed(2)}deg) translate(${(Math.sin(t * 0.6) * 0.8).toFixed(2)}%, ${(Math.cos(t * 0.75) * 0.6).toFixed(2)}%)`,
    init: () => ({ bubbles: [] }),
    draw(ctx, W, H, t, dt, s) {
      ctx.fillStyle = "rgba(90,160,40,0.12)";
      ctx.fillRect(0, 0, W, H);
      vignette(ctx, W, H, "40,90,10", 0.3, 0.9, 0, 0.6 + 0.1 * Math.sin(t * 1.3));
      if (Math.random() < dt * 14) {
        const [x0, y0] = edgePoint(W, H), x = clamp(x0, 0, W), y = clamp(y0, 0, H);
        s.bubbles.push({ x, y, r: rand(0.004, 0.011) * W, age: 0, life: rand(1, 2.4), vx: (W / 2 - x) * 0.03, vy: (H / 2 - y) * 0.03 });
      }
      run(s.bubbles, p => {
        p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const k = p.age / p.life;
        if (k > 0.9) puff(ctx, p.x, p.y, p.r * 3, "150,230,60", 0.25 * (1 - k) * 10);
        else {
          ctx.strokeStyle = `rgba(170,240,80,${0.7 * (1 - k)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + k * 0.4), 0, TAU); ctx.stroke();
          ctx.fillStyle = `rgba(220,255,160,${0.6 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.22, 0, TAU); ctx.fill();
        }
        return k < 1;
      });
      for (let i = 0; i < 5; i++) {
        const x = W * (0.1 + i * 0.2) + Math.sin(t * 0.5 + i) * W * 0.04, y = H * (i % 2 ? 0.94 : 0.06);
        puff(ctx, x, y, W * 0.12, "110,170,30", 0.18);
      }
    }
  },

  // Down on the floor: the far side of the map darkens out of reach and dust hangs low in the air.
  prone: {
    filter: () => "brightness(0.92)",
    init: () => ({ dust: [] }),
    draw(ctx, W, H, t, dt, s) {
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, "rgba(10,8,6,0.85)");
      gr.addColorStop(0.45, "rgba(10,8,6,0.15)");
      gr.addColorStop(0.8, "rgba(60,45,30,0.1)");
      gr.addColorStop(1, "rgba(60,45,30,0.45)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
      if (s.dust.length < 90 && Math.random() < dt * 40) {
        s.dust.push({ x: rand(0, W), y: rand(H * 0.55, H), vx: rand(-6, 6), vy: rand(-5, 2), age: 0, life: rand(2, 4), r: rand(1, 2.8) * W / 900 });
      }
      ctx.fillStyle = "#d8c098";
      run(s.dust, p => {
        p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalAlpha = Math.sin((p.age / p.life) * Math.PI) * 0.55;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        return p.age < p.life;
      });
      ctx.globalAlpha = 1;
      for (let i = 0; i < 3; i++) puff(ctx, W * (0.2 + i * 0.3) + Math.sin(t * 0.3 + i) * W * 0.05, H * 0.97, W * 0.2, "120,95,60", 0.22);
    }
  },

  // Sticky web strands across the corners that tremble as you strain against them.
  restrained: {
    filter: () => "brightness(0.85) saturate(0.85)",
    draw(ctx, W, H, t) {
      vignette(ctx, W, H, "10,10,12", 0.3, 0.9, 0, 0.55);
      const strain = Math.max(0, Math.sin(t * 1.4));
      ctx.lineCap = "round";
      for (const [cx, cy, a0] of [[0, 0, 0], [W, 0, Math.PI / 2], [W, H, Math.PI], [0, H, Math.PI * 1.5]]) {
        const L = Math.min(W, H) * 0.44, spokes = 6;
        const pt = (i, r) => {
          const a = a0 + (i / (spokes - 1)) * (Math.PI / 2);
          const sway = Math.sin(t * 3 + i + r * 0.01) * strain * W * 0.003;
          return [cx + Math.cos(a) * r + sway, cy + Math.sin(a) * r + sway];
        };
        ctx.strokeStyle = "rgba(235,235,240,0.55)";
        ctx.lineWidth = Math.max(1, W * 0.0015);
        for (let i = 0; i < spokes; i++) { const [x, y] = pt(i, L); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.strokeStyle = "rgba(235,235,240,0.4)";
        for (let ring = 1; ring <= 6; ring++) {
          const r = (L * ring) / 6.4;
          ctx.beginPath();
          for (let i = 0; i < spokes; i++) {
            const [x, y] = pt(i, r);
            if (i === 0) ctx.moveTo(x, y);
            else { const [px, py] = pt(i - 0.5, r * 0.92); ctx.quadraticCurveTo(px, py, x, y); }
          }
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        for (let k = 0; k < 5; k++) {
          const [x, y] = pt((k * 1.2) % 5, L * (0.3 + k * 0.12));
          ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, W * 0.002), 0, TAU); ctx.fill();
        }
      }
      ctx.lineCap = "butt";
    }
  },

  // Ringing white flashes, a throbbing blur and stars circling the middle of the screen.
  stunned: {
    filter: t => `blur(${(1 + 1.8 * (0.5 + 0.5 * Math.sin(t * 3))).toFixed(2)}px) saturate(0.8) brightness(${(1 + 0.15 * Math.max(0, Math.sin(t * 1.2 - 1))).toFixed(3)})`,
    init: () => ({ flash: 0, next: 1 }),
    draw(ctx, W, H, t, dt, s) {
      if (dt > 0 && (s.next -= dt) <= 0) { s.flash = 1; s.next = rand(2.5, 4); }
      s.flash = Math.max(0, s.flash - dt * 1.8);
      if (s.flash > 0) { ctx.fillStyle = `rgba(255,250,235,${s.flash * 0.55})`; ctx.fillRect(0, 0, W, H); }
      vignette(ctx, W, H, "250,240,200", 0.3, 0.95, 0, 0.3 + 0.2 * s.flash);
      const cx = W / 2, cy = H * 0.42;
      ctx.fillStyle = "#fff3b0";
      for (let i = 0; i < 5; i++) {
        const a = t * 2.4 + (i / 5) * TAU;
        const x = cx + Math.cos(a) * W * 0.1, y = cy + Math.sin(a) * W * 0.033;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(a);
        star4(ctx, x, y, W * 0.018 * (0.75 + 0.35 * Math.sin(a)));
      }
      ctx.globalAlpha = 1;
    }
  },

  // Heavy eyelids flutter over a dim, blurred world while faint dream lights drift past.
  // Variants: "dying" adds a failing red heartbeat (faster with each failed death save, via level);
  // "dead" is still, grey and closed.
  unconscious: {
    filter: (t, fx) => (fx.variant === "dead" ? "grayscale(1) blur(3px) brightness(0.5)" : "blur(4px) brightness(0.45) saturate(0.5)"),
    init: () => ({ motes: [] }),
    draw(ctx, W, H, t, dt, s, fx) {
      const dead = fx.variant === "dead";
      ctx.fillStyle = dead ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.2)";
      ctx.fillRect(0, 0, W, H);
      if (!dead) {
        if (Math.random() < dt * 3) s.motes.push({ x: rand(0.2, 0.8) * W, y: rand(0.35, 0.65) * H, vx: rand(-10, 10) * W / 900, age: 0, life: rand(3, 5) });
        run(s.motes, p => {
          p.age += dt; p.x += p.vx * dt;
          puff(ctx, p.x, p.y, W * 0.015, "160,170,255", Math.sin((p.age / p.life) * Math.PI) * 0.35);
          return p.age < p.life;
        });
      }
      if (fx.variant === "dying") {
        const lvl = fx.level ?? 0.6;
        const b = beat(t, 2.4 - 1.2 * lvl);
        vignette(ctx, W, H, "140,0,0", 0.25, 0.9, 0, 0.25 + 0.4 * b);
      }
      const close = dead ? 0.9 : 0.62 + 0.06 * Math.sin(t * 0.6) - 0.08 * Math.max(0, Math.sin(t * 3.1)) * Math.max(0, Math.sin(t * 0.4));
      lids(ctx, W, H, close, 0.1);
    }
  }
};
