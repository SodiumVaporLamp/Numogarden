/* Numogarden town and data-centre art, from SVL's art labs (both approved 2026-10-28). Buildings grow with a town
   through eight tiers, ported from the lab's "Proposed" code (specs/art-lab.html, private), and a data centre grows
   out through seven sizes, ported from specs/dc-art.js (private). Renderer only: nothing here touches the rules.
   planTile() lists a town tile's buildings in local units (one hex radius = 1), drawBuilding() draws one of them,
   and variedTiers() hands a big town's tallest art to the tiles at its heart; planDC(), drawDC() and dcVariedTiers()
   do the same for a data centre's pieces. The page caches the plans and draws every visible building and piece as
   one list, back to front. */
(function (root) {
'use strict';

const SQ3 = Math.sqrt(3);
const CORN = [0, 1, 2, 3, 4, 5].map(i => [Math.cos(Math.PI / 3 * i), Math.sin(Math.PI / 3 * i)]);
const ROOFS = ['#E0705A', '#5E8FB0', '#D9A13B', '#C9607A'];
const VIOLET = '#8A6FD1', WIN = '#7FE6DA', WIN_NIGHT = '#B8FFF6', BEACON = '#FF5A6E', BEACON_OFF = '#8A2E40';
const BODIES = ['#F4E9DC', '#E9E2F2', '#E3EEE9', '#F7E1D2', '#E6EDF5'];
const CELLS = ['#EAF0F6', '#F1EAF4', '#E8F2EE', '#F6EEE6'];
const DEPTH = 0.55;   // how far a side face climbs for each unit it runs back
const SQ = 0.5;       // how flat a hive roof looks from the front
const TIERS = [
  { name: 'Hamlet', min: 1, max: 5, sample: 3 },
  { name: 'Village', min: 6, max: 11, sample: 8 },
  { name: 'Town', min: 12, max: 23, sample: 16 },
  { name: 'City', min: 24, max: 39, sample: 30 },
  { name: 'Metropolis', min: 40, max: 99, sample: 64 },
  { name: 'Megacity', min: 100, max: 249, sample: 160, extra: true },
  { name: 'Arcology', min: 250, max: 499, sample: 360, extra: true },
  { name: 'Hive', min: 500, max: 0, sample: 760, extra: true }
];
function hh(a, b) { let x = Math.imul(a | 0, 73856093) ^ Math.imul((b | 0) + 1, 19349663); x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
function wpt(i, u, v) { const A = CORN[i], B = CORN[(i + 1) % 6]; return [A[0] * u + B[0] * v, A[1] * u + B[1] * v]; }
function hexCenter(q, r) { return [1.5 * q, SQ3 * (r + q / 2)]; }
function hexPath(ctx, r) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const p = CORN[i]; i ? ctx.lineTo(p[0] * r, p[1] * r) : ctx.moveTo(p[0] * r, p[1] * r); } ctx.closePath(); }
const shadeCache = new Map();
function shade(hex, f) {
  const key = hex + f; let s = shadeCache.get(key); if (s) return s;
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 1) { r *= f; g *= f; b *= f; } else { const m = f - 1; r += (255 - r) * m; g += (255 - g) * m; b += (255 - b) * m; }
  s = 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')'; shadeCache.set(key, s); return s;
}
function tierIndex(size) { let k = 0; for (let i = 0; i < TIERS.length; i++) if (size >= TIERS[i].min) k = i; return k; }

function mk(tl, kind, x, y, props) {
  const b = Object.assign({ k: kind, x, y, tc: tl.c, wx: tl.c[0] + x, wy: tl.c[1] + y, ti: tl.ti }, props);
  b.id = (Math.floor((b.seed || 0) * 1e9) ^ tl.sid) | 0;
  return b;
}
function gridOf(b) {
  const out = [], fh = b.h / (b.floors + 0.5), fw = b.w / b.cols, s = Math.min(fh, fw) * 0.44;
  for (let f = 0; f < b.floors; f++) for (let c = 0; c < b.cols; c++) out.push([b.x - b.w / 2 + fw * (c + 0.5) - s / 2, b.y - b.h + fh * (f + 0.6) - s / 2, s]);
  return out;
}
function box(tl, kind, x, y, w, h, floors, cols, crown, seed) {
  const b = mk(tl, kind, x, y, { w, h, d: w * 0.36, floors, cols, crown, seed, body: BODIES[Math.floor(seed * 5) % 5] });
  b.grid = gridOf(b);
  b.eyeAt = seed < 0.6 ? Math.min(b.grid.length - 1, Math.floor(floors / 2) * cols) : -1;
  return b;
}
function planTile(tl) {
  const out = [], ti = tl.ti, hs = [];
  for (let i = 0; i < 6; i++) if (tl.w[i] === 'H') hs.push(i);
  if (!hs.length) return out;
  const R = (a, b) => hh(tl.sid + 5, a * 131 + b), n = hs.length;
  if (ti >= 6 && n >= 4) {
    if (ti === 6) {
      out.push(mk(tl, 'arco', 0, 0.44, { W: 1.1, levels: 4, lh: 0.19, seed: R(1, 1) }));
      for (const i of hs) if (i <= 2) { const p = wpt(i, 0.66, 0.2); out.push(box(tl, 'block', p[0], p[1] + 0.04, 0.13, 0.12, 1, 2, 'flat', R(i, 9))); }
    } else {
      const ring = [[0, 0.02, true]];
      for (let k = 0; k < 6; k++) if (tl.w[k] === 'H') { const a = Math.PI / 6 + Math.PI / 3 * k; ring.push([0.5 * Math.cos(a), 0.5 * Math.sin(a), false]); }
      const cells = [];
      ring.forEach((c, j) => { const s = R(j, 40), h = c[2] ? 0.95 + 0.3 * s : 0.32 + 0.62 * s; cells.push(mk(tl, 'cell', c[0], c[1], { r: 0.25, h, seed: s, body: CELLS[Math.floor(s * 4) % 4] })); });
      for (const c of cells) out.push(c);
      const back = Math.max.apply(null, cells.map(c => c.y));
      out.push(mk(tl, 'cables', 0, back + 0.01, { cells, seed: R(9, 9) }));
    }
    return out;
  }
  if (n === 6 && (ti === 4 || ti === 5)) out.push(box(tl, 'tower', 0, 0.1, 0.22, ti === 5 ? 1.18 : 0.9, ti === 5 ? 10 : 8, 2, 'spire', R(0, 77)));
  for (const i of hs) planWedge(out, tl, i, Math.min(ti, 5), R);
  return out;
}
function planWedge(out, tl, i, T, R) {
  const s0 = R(i, 0), s1 = R(i, 1), s2 = R(i, 2), s3 = R(i, 3), flip = s0 < 0.5;
  const P = (u, v) => wpt(i, flip ? v : u, flip ? u : v);
  let p;
  if (T === 0) { const j = (s1 - 0.5) * 0.08; p = wpt(i, 0.36 + j, 0.36 - j); out.push(mk(tl, 'cottage', p[0], p[1] + 0.075, { w: 0.2, h: 0.15, seed: s2 })); return; }
  if (T === 1) {
    p = P(0.52, 0.2); out.push(mk(tl, 'cottage', p[0], p[1] + 0.065, { w: 0.17, h: 0.13, seed: s2 }));
    p = P(0.2, 0.52); out.push(mk(tl, 'cottage', p[0], p[1] + 0.065, { w: 0.17, h: 0.13, seed: s3 }));
    p = wpt(i, 0.27, 0.25); out.push(mk(tl, 'tree', p[0], p[1], { r: 0.05, seed: s1 }));
    return;
  }
  if (T === 2) {
    p = wpt(i, 0.42, 0.42); out.push(mk(tl, 'row', p[0], p[1] + 0.065, { n: 3, uw: 0.11, h: 0.13, seed: s2 }));
    p = P(0.62, 0.12); out.push(mk(tl, 'tree', p[0], p[1], { r: 0.045, seed: s1 }));
    return;
  }
  if (T === 3) {
    p = P(0.4, 0.34); out.push(box(tl, 'block', p[0], p[1] + 0.08, 0.2, 0.3, 3, 2, s3 < 0.5 ? 'tank' : 'flat', s2));
    p = P(0.66, 0.14); out.push(mk(tl, 'row', p[0], p[1] + 0.06, { n: 2, uw: 0.1, h: 0.12, seed: s1 }));
    return;
  }
  if (T === 4) {
    p = P(0.42, 0.36); out.push(box(tl, 'tower', p[0], p[1] + 0.08, 0.17, 0.55 + 0.22 * s1, 6, 2, s2 < 0.45 ? 'step' : 'antenna', s2));
    p = P(0.66, 0.15); out.push(box(tl, 'block', p[0], p[1] + 0.06, 0.15, 0.24, 2, 2, 'tank', s3));
    return;
  }
  const pa = P(0.54, 0.22), pb = P(0.22, 0.54);
  const A = box(tl, 'tower', pa[0], pa[1] + 0.08, 0.15, 0.75 + 0.25 * s1, 9, 2, s2 < 0.5 ? 'spire' : 'antenna', s2);
  const B = box(tl, 'tower', pb[0], pb[1] + 0.08, 0.14, 0.55 + 0.25 * s3, 7, 2, s3 < 0.5 ? 'step' : 'antenna', s3);
  out.push(A, B);
  const Lt = A.x < B.x ? A : B, Rt = A.x < B.x ? B : A;
  const x0 = Lt.x + Lt.w / 2 + Lt.d, x1 = Rt.x - Rt.w / 2;
  if (x1 - x0 > 0.03) {
    const hb = Math.min(Lt.h, Rt.h) * 0.62;
    out.push(mk(tl, 'bridge', (x0 + x1) / 2, Math.max(Lt.y, Rt.y) + 0.001, { x0, x1, y0: Lt.y - hb - Lt.d * DEPTH, y1: Rt.y - hb, seed: s0 }));
  }
}

/* drawing helpers for the proposed art; local units, one hex radius = 1 */
function flick(seed, env) { return env.L >= 1 && seed < 0.3 && env.motion ? 0.55 + 0.45 * Math.sin(env.t * 3 + seed * 30) : 1; }
function boxFaces(ctx, x, y, w, h, d, front, side, top) {
  const L0 = x - w / 2, R0 = x + w / 2, T = y - h, dy = d * DEPTH;
  ctx.fillStyle = side; ctx.beginPath(); ctx.moveTo(R0, y); ctx.lineTo(R0 + d, y - dy); ctx.lineTo(R0 + d, T - dy); ctx.lineTo(R0, T); ctx.closePath(); ctx.fill();
  ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(L0, T); ctx.lineTo(R0, T); ctx.lineTo(R0 + d, T - dy); ctx.lineTo(L0 + d, T - dy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = front; ctx.fillRect(L0, T, w, h);
}
function drawEye(ctx, b, ex, ey, rx, ry, seed, env) {
  ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, 7); ctx.fill();
  let dx = env.pw[0] - (b.tc[0] + ex), dy = env.pw[1] - (b.tc[1] + ey); const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const blink = env.motion && Math.sin(env.t * 0.9 + seed * 40) > 0.985;
  ctx.fillStyle = '#1E2230';
  if (blink) ctx.fillRect(ex - rx * 0.9, ey - ry * 0.12, rx * 1.8, ry * 0.24);
  else { ctx.beginPath(); ctx.arc(ex + dx * rx * 0.42, ey + dy * ry * 0.38, ry * 0.52, 0, 7); ctx.fill(); }
}
function nightEye(ctx, b, ex, ey, rx, ry, seed, env) { ctx.globalCompositeOperation = 'source-over'; drawEye(ctx, b, ex, ey, rx, ry, seed, env); ctx.globalCompositeOperation = 'lighter'; }
function beacon(ctx, x, y, seed, env, night) {
  if (env.L < 2) return;
  const on = !env.motion || Math.sin(env.t * 4 + seed * 20) > 0;
  if (night) { if (!on) return; ctx.globalAlpha = 0.9; ctx.fillStyle = BEACON; ctx.beginPath(); ctx.arc(x, y, 0.034, 0, 7); ctx.fill(); ctx.globalAlpha = 1; return; }
  ctx.fillStyle = on ? BEACON : BEACON_OFF; ctx.beginPath(); ctx.arc(x, y, 0.02, 0, 7); ctx.fill();
}
function drawTree(ctx, b) {
  const x = b.x, y = b.y, r = b.r;
  ctx.fillStyle = '#8A6A4A'; ctx.fillRect(x - 0.008, y - r * 0.9, 0.016, r * 0.9);
  ctx.fillStyle = '#4E9B6A'; ctx.beginPath(); ctx.arc(x, y - r * 1.4, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#76B98C'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 1.7, r * 0.42, 0, 7); ctx.fill();
}
function drawBush(ctx, x, y, r) {
  ctx.fillStyle = '#5DA877'; ctx.beginPath(); ctx.arc(x, y - r, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#8CCB9E'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 1.3, r * 0.4, 0, 7); ctx.fill();
}
function cottageEye(b, L) { return L >= 3 && b.ti >= 2 && b.seed < 0.55; }
function drawCottage(ctx, b, env, night) {
  const x = b.x, y = b.y, w = b.w, h = b.h, L = env.L, seed = b.seed;
  if (night) {
    if (cottageEye(b, L)) nightEye(ctx, b, x, y - h * 0.45, w * 0.27, w * 0.19, seed, env);
    else { ctx.globalAlpha = flick(seed, env); ctx.fillStyle = WIN_NIGHT; ctx.fillRect(x - w * 0.13, y - h * 0.62, w * 0.26, w * 0.26); ctx.globalAlpha = 1; }
    return;
  }
  ctx.fillStyle = '#FFF7EC'; ctx.fillRect(x - w / 2, y - h, w, h);
  ctx.fillStyle = L >= 2 && seed > 0.8 ? VIOLET : ROOFS[Math.floor(seed * 4) % 4];
  ctx.beginPath(); ctx.moveTo(x - w * 0.62, y - h + 0.004); ctx.lineTo(x, y - h - w * 0.48); ctx.lineTo(x + w * 0.62, y - h + 0.004); ctx.closePath(); ctx.fill();
  if (cottageEye(b, L)) drawEye(ctx, b, x, y - h * 0.45, w * 0.27, w * 0.19, seed, env);
  else { ctx.globalAlpha = flick(seed, env) * 0.95; ctx.fillStyle = WIN; ctx.fillRect(x - w * 0.13, y - h * 0.62, w * 0.26, w * 0.26); ctx.globalAlpha = 1; }
}
function drawRow(ctx, b, env, night) {
  const x = b.x, y = b.y, n = b.n, uw = b.uw, h = b.h, L = env.L, W = n * uw, x0 = x - W / 2;
  if (!night) { ctx.fillStyle = '#FFF7EC'; ctx.fillRect(x0, y - h, W, h); }
  for (let k = 0; k < n; k++) {
    const s = hh(b.id, k), ux = x0 + uw * k + uw / 2, eye = L >= 3 && b.ti >= 2 && s < 0.4;
    if (night) {
      if (eye) nightEye(ctx, b, ux, y - h * 0.5, uw * 0.3, uw * 0.21, s, env);
      else { ctx.globalAlpha = flick(s, env); ctx.fillStyle = WIN_NIGHT; ctx.fillRect(ux - uw * 0.14, y - h * 0.62, uw * 0.28, uw * 0.28); ctx.globalAlpha = 1; }
      continue;
    }
    ctx.fillStyle = L >= 2 && s > 0.82 ? VIOLET : ROOFS[(Math.floor(s * 4) + k) % 4];
    ctx.beginPath(); ctx.moveTo(ux - uw * 0.56, y - h + 0.004); ctx.lineTo(ux, y - h - uw * 0.5); ctx.lineTo(ux + uw * 0.56, y - h + 0.004); ctx.closePath(); ctx.fill();
    if (k) { ctx.fillStyle = 'rgba(120,90,60,.2)'; ctx.fillRect(x0 + uw * k - 0.003, y - h, 0.006, h); }
    if (eye) drawEye(ctx, b, ux, y - h * 0.5, uw * 0.3, uw * 0.21, s, env);
    else { ctx.globalAlpha = flick(s, env) * 0.95; ctx.fillStyle = WIN; ctx.fillRect(ux - uw * 0.14, y - h * 0.62, uw * 0.28, uw * 0.28); ctx.globalAlpha = 1; }
  }
}
function roofCentre(b) { return [b.x + b.d * 0.5, b.y - b.h - b.d * DEPTH * 0.5]; }
function drawCrown(ctx, b, env, night) {
  const L = env.L, rc = roofCentre(b), cx = rc[0], cy = rc[1], w = b.w;
  if (b.crown === 'spire') {
    if (!night) { ctx.fillStyle = shade(b.body, 0.92); ctx.beginPath(); ctx.moveTo(cx - w * 0.22, cy + 0.01); ctx.lineTo(cx, cy - w * 1.15); ctx.lineTo(cx + w * 0.22, cy + 0.01); ctx.closePath(); ctx.fill(); }
    beacon(ctx, cx, cy - w * 1.15, b.seed, env, night);
  } else if (b.crown === 'step') {
    if (!night) boxFaces(ctx, cx - b.d * 0.3, cy + b.d * DEPTH * 0.3, w * 0.55, b.h * 0.1, b.d * 0.5, b.body, shade(b.body, 0.8), L >= 2 && b.seed > 0.82 ? VIOLET : shade(b.body, 1.35));
  } else if (b.crown === 'antenna' && L >= 2) {
    if (!night) { ctx.strokeStyle = '#3A4A50'; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - w * 0.95); ctx.stroke(); }
    beacon(ctx, cx, cy - w * 0.98, b.seed, env, night);
  } else if (b.crown === 'tank' && !night) {
    const tw = w * 0.24, th = w * 0.2, tx = cx - tw / 2, ty = cy - th;
    ctx.fillStyle = '#B98A62'; ctx.fillRect(tx + tw * 0.15, cy - th * 0.2, 0.008, th * 0.25); ctx.fillRect(tx + tw * 0.8, cy - th * 0.2, 0.008, th * 0.25);
    ctx.fillStyle = '#C99B70'; ctx.fillRect(tx, ty - th * 0.2, tw, th);
    ctx.fillStyle = '#7A5A40'; ctx.beginPath(); ctx.moveTo(tx - 0.006, ty - th * 0.2); ctx.lineTo(cx, ty - th * 0.75); ctx.lineTo(tx + tw + 0.006, ty - th * 0.2); ctx.closePath(); ctx.fill();
  }
}
function drawBox(ctx, b, env, night) {
  const L = env.L, g = b.grid, lit = b.k === 'tower' ? 0.78 : 0.7;
  if (!night) boxFaces(ctx, b.x, b.y, b.w, b.h, b.d, b.body, shade(b.body, 0.8), L >= 2 && b.seed > 0.82 ? VIOLET : shade(b.body, 1.35));
  for (let k = 0; k < g.length; k++) {
    const wx = g[k][0], wy = g[k][1], s = g[k][2], sd = hh(b.id, k);
    if (k === b.eyeAt && L >= 3) {
      if (night) nightEye(ctx, b, wx + s / 2, wy + s / 2, s * 0.95, s * 0.66, sd, env);
      else drawEye(ctx, b, wx + s / 2, wy + s / 2, s * 0.95, s * 0.66, sd, env);
      continue;
    }
    if (night) { if (hh(b.id, k + 500) > lit) continue; ctx.globalAlpha = 0.88; ctx.fillStyle = WIN_NIGHT; }
    else { ctx.globalAlpha = flick(sd, env) * 0.92; ctx.fillStyle = WIN; }
    ctx.fillRect(wx, wy, s, s);
  }
  ctx.globalAlpha = 1;
  drawCrown(ctx, b, env, night);
}
function drawBridge(ctx, b, env, night) {
  const th = 0.032;
  if (night) {
    ctx.globalAlpha = 0.8; ctx.strokeStyle = WIN_NIGHT; ctx.lineWidth = 0.01;
    ctx.beginPath(); ctx.moveTo(b.x0, b.y0 + th * 0.45); ctx.lineTo(b.x1, b.y1 + th * 0.45); ctx.stroke(); ctx.globalAlpha = 1; return;
  }
  ctx.fillStyle = '#DCE6EE'; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.lineTo(b.x1, b.y1 + th); ctx.lineTo(b.x0, b.y0 + th); ctx.closePath(); ctx.fill();
  ctx.fillStyle = WIN; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(b.x0, b.y0 + th * 0.35); ctx.lineTo(b.x1, b.y1 + th * 0.35); ctx.lineTo(b.x1, b.y1 + th * 0.6); ctx.lineTo(b.x0, b.y0 + th * 0.6); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
}
function drawArco(ctx, b, env, night) {
  const L = env.L, d = 0.12, dy = d * DEPTH, gardens = [];
  let base = b.y, top = null;
  for (let k = 0; k < b.levels; k++) {
    const w = b.W * (1 - 0.2 * k), h = b.lh * (k === b.levels - 1 ? 1.1 : 1), x = b.x - d * 0.3 * k;
    const body = k % 2 ? '#EEE6F4' : '#F4EADF';
    if (!night) boxFaces(ctx, x, base, w, h, d, body, shade(body, 0.8), L >= 2 && k === b.levels - 1 && b.seed > 0.7 ? VIOLET : shade(body, 1.3));
    const cols = Math.max(4, Math.round(w / 0.075)), cw = w / cols, s = Math.min(cw, h) * 0.36;
    for (let c = 0; c < cols; c++) {
      if (L >= 3 && k === b.levels - 1 && Math.abs(c - (cols - 1) / 2) < 1) continue; // room for the eye
      const sd = hh(b.id, k * 37 + c), wx = x - w / 2 + cw * (c + 0.5) - s / 2, wy = base - h * 0.52 - s / 2;
      if (night) { if (sd > 0.8) continue; ctx.globalAlpha = 0.86; ctx.fillStyle = WIN_NIGHT; }
      else { ctx.globalAlpha = flick(sd, env) * 0.9; ctx.fillStyle = WIN; }
      ctx.fillRect(wx, wy, s, s);
    }
    ctx.globalAlpha = 1;
    if (k < b.levels - 1) for (let g = 0; g < 7; g++) gardens.push([x - w / 2 + 0.05 + (w - 0.1) * (g + 0.5) / 7, base - h - dy * 0.18, 0.02 + 0.01 * hh(b.id, 300 + k * 9 + g)]);
    top = { x, base, w, h };
    base = base - h - dy * 0.55;
  }
  if (!night) for (const g of gardens) drawBush(ctx, g[0], g[1], g[2]);
  const ax = top.x + d * 0.5, ay = top.base - top.h - dy * 0.5;
  if (L >= 2) {
    if (!night) {
      ctx.strokeStyle = '#3A4A50'; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 0.24); ctx.stroke();
      ctx.fillStyle = '#C9D3DA'; ctx.beginPath(); ctx.ellipse(ax - 0.12, ay - 0.03, 0.06, 0.03, -0.5, 0, 7); ctx.fill();
    }
    beacon(ctx, ax, ay - 0.25, b.seed, env, night);
  }
  if (L >= 3) {
    const ex = top.x, ey = top.base - top.h * 0.52;
    if (night) nightEye(ctx, b, ex, ey, 0.075, 0.048, b.seed, env); else drawEye(ctx, b, ex, ey, 0.075, 0.048, b.seed, env);
  }
}
function cellTop(b) { const pts = []; for (let j = 0; j < 6; j++) { const a = Math.PI / 3 * j; pts.push([b.x + b.r * Math.cos(a), b.y - b.h + b.r * Math.sin(a) * SQ]); } return pts; }
function drawCell(ctx, b, env, night) {
  const P = b.top || (b.top = cellTop(b)), h = b.h, L = env.L;
  if (!night) {
    const walls = [shade(b.body, 0.76), shade(b.body, 0.88), shade(b.body, 0.95)];
    for (let j = 0; j < 3; j++) {
      const A = P[j], B = P[j + 1];
      ctx.fillStyle = walls[j]; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(B[0], B[1] + h); ctx.lineTo(A[0], A[1] + h); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = L >= 2 && b.seed > 0.84 ? VIOLET : shade(b.body, 1.25);
    ctx.beginPath(); for (let j = 0; j < 6; j++) j ? ctx.lineTo(P[j][0], P[j][1]) : ctx.moveTo(P[j][0], P[j][1]); ctx.closePath(); ctx.fill();
  } else {
    ctx.globalAlpha = 0.5; ctx.strokeStyle = WIN_NIGHT; ctx.lineWidth = 0.014;
    ctx.beginPath(); for (let j = 0; j < 6; j++) j ? ctx.lineTo(P[j][0], P[j][1]) : ctx.moveTo(P[j][0], P[j][1]); ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const A = P[1], B = P[2], rows = Math.max(2, Math.floor(h / 0.13));
  for (let k = 0; k < rows; k++) for (let c = 0; c < 2; c++) {
    const u = 0.33 + c * 0.34, x = A[0] + (B[0] - A[0]) * u, y = A[1] + (B[1] - A[1]) * u + h * (k + 0.6) / (rows + 0.4), s = 0.034, sd = hh(b.id, k * 2 + c);
    if (night) { if (sd > 0.72) continue; ctx.globalAlpha = 0.86; ctx.fillStyle = WIN_NIGHT; }
    else { ctx.globalAlpha = flick(sd, env) * 0.9; ctx.fillStyle = WIN; }
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  if (L >= 3 && b.seed < 0.45) {
    if (night) nightEye(ctx, b, b.x, b.y - h, b.r * 0.42, b.r * 0.2, b.seed, env); else drawEye(ctx, b, b.x, b.y - h, b.r * 0.42, b.r * 0.2, b.seed, env);
  }
}
function drawCables(ctx, b, env, night) {
  if (env.L < 2 || b.cells.length < 2) return;
  const c0 = b.cells[0], x0 = c0.x, y0 = c0.y - c0.h;
  ctx.lineWidth = night ? 0.012 : 0.01; ctx.strokeStyle = night ? 'rgba(160,130,255,.6)' : 'rgba(58,74,80,.55)';
  for (let j = 1; j < b.cells.length; j++) {
    const c = b.cells[j], x1 = c.x, y1 = c.y - c.h;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 0.14, x1, y1); ctx.stroke();
  }
}
function drawBuilding(ctx, b, env, night) {
  switch (b.k) {
    case 'cottage': drawCottage(ctx, b, env, night); break;
    case 'row': drawRow(ctx, b, env, night); break;
    case 'block': case 'tower': drawBox(ctx, b, env, night); break;
    case 'bridge': drawBridge(ctx, b, env, night); break;
    case 'arco': drawArco(ctx, b, env, night); break;
    case 'cell': drawCell(ctx, b, env, night); break;
    case 'cables': drawCables(ctx, b, env, night); break;
    case 'tree': if (!night) drawTree(ctx, b); break;
  }
}
function drawTownGround(ctx, tl) {
  const ti = tl.ti, n = tl.hn;
  if (!n) return;
  if (ti >= 3 && ti <= 5) {
    ctx.strokeStyle = '#FBEDE0'; ctx.lineWidth = ti >= 4 ? 0.075 : 0.05; ctx.lineCap = 'round';
    for (let k = 0; k < 6; k++) if (tl.w[k] === 'H' && tl.w[(k + 5) % 6] === 'H') { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(CORN[k][0] * 0.92, CORN[k][1] * 0.92); ctx.stroke(); }
    ctx.lineCap = 'butt';
  }
  if (ti >= 2 && ti <= 5 && n >= 4) {
    ctx.fillStyle = '#F8EADB'; ctx.beginPath(); ctx.arc(0, 0, 0.21, 0, 7); ctx.fill();
    ctx.strokeStyle = '#E2C6A4'; ctx.lineWidth = 0.02; ctx.stroke();
    if (ti <= 3) {
      ctx.fillStyle = '#9ED3E6'; ctx.beginPath(); ctx.arc(0, 0.02, 0.06, 0, 7); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(-0.015, 0.005, 0.018, 0, 7); ctx.fill();
    }
  }
  if (ti >= 6 && n >= 4) { ctx.fillStyle = 'rgba(150,110,80,.12)'; hexPath(ctx, 0.84); ctx.fill(); }
}

/* Varied tiers: rank a town's tiles by how much town surrounds them (within two tiles) and how near its middle they sit,
   then hand out the art from the top. Each tier from town upward gets about SHARE of the tiles of the one below it. */
const SHARE = 0.55;
function variedTiers(town, T) { // town: [[q, r, town wedges, tile id], ...]
  const n = town.length, out = new Array(n).fill(T);
  if (T <= 2 || n < 2) return out;
  const key = (q, r) => q + ',' + r, hmap = new Map(town.map(c => [key(c[0], c[1]), c[2]]));
  let cx = 0, cy = 0, hs = 0;
  for (const c of town) { const p = hexCenter(c[0], c[1]); cx += p[0] * c[2]; cy += p[1] * c[2]; hs += c[2]; }
  cx /= hs; cy /= hs;
  let far = 1;
  for (const c of town) { const p = hexCenter(c[0], c[1]); far = Math.max(far, Math.hypot(p[0] - cx, p[1] - cy)); }
  const score = town.map(c => {
    let s = 0;
    for (let dq = -2; dq <= 2; dq++) for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) {
      const d = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
      s += (hmap.get(key(c[0] + dq, c[1] + dr)) || 0) * (d === 0 ? 3 : d === 1 ? 2 : 1);
    }
    const p = hexCenter(c[0], c[1]);
    return 0.5 * s / 162 + 0.5 * (1 - Math.hypot(p[0] - cx, p[1] - cy) / far) + 0.06 * hh(c[3] * 7 + 13, 77);
  });
  const order = town.map((c, i) => i).sort((a, b) => score[b] - score[a]);
  const tiers = []; for (let t = T; t >= 2; t--) tiers.push(t);
  const wts = tiers.map(t => Math.pow(SHARE, t - 2)), sum = wts.reduce((a, b) => a + b, 0);
  let cum = 0; const bounds = wts.map(w => (cum += w / sum));
  let k = 0;
  order.forEach((i, rank) => { const f = (rank + 0.5) / n; while (k < bounds.length - 1 && f > bounds[k]) k++; out[i] = tiers[k]; });
  out[order[0]] = T;
  return out;
}

/* ---------- data centres ----------
   A data centre grows with its cluster through seven art sizes, from a rack per wedge to a machine shaped like the
   board itself. Towns grow up; data centres grow out, until the tile is the machine. planDC() lists a tile's pieces in
   local units, drawDC() draws one piece by day or, with night = true, its lights, and drawDCGround() /
   drawDCGroundNight() draw what lies on the ground: fences, lamp posts, sea intakes, pods under the sea and the heat
   over a wedge about to fall. The rules keep one data-centre tier; these sizes are art, by the cluster's wedges. */
// Sizes in cluster wedges. One sea contact cools COOL_K = 6 wedges, so the first four steps each double the sea a
// cluster needs; past campus, each step needs two more contacts, so the matrioshka comes at sizes games reach.
const DC_TIERS = [
  { name: 'Rack', min: 1, max: 6, sample: 4 },
  { name: 'Server hall', min: 7, max: 12, sample: 10 },
  { name: 'Data hall', min: 13, max: 24, sample: 18 },
  { name: 'Campus', min: 25, max: 48, sample: 36 },
  { name: 'Hyperscale', min: 49, max: 60, sample: 54 },
  { name: 'Exascale', min: 61, max: 72, sample: 66 },
  { name: 'Matrioshka', min: 73, max: 0, sample: 84 }
];
const WALL = '#2B3142', TOP = '#5C6680';          // today's slab and the strip along its top
const ROOF_HALL = '#4F5874', ROOF = '#363D54', ROOF_EDGE = '#5F6986'; // dark roofs, so data centre stays the darkest land
const STRIP = '#4B5370', RIM = '#717B98';                            // rows of chillers on a big roof, and their fans
const BOARD = '#2E3447', TRACE = '#67728E';        // a roof that has become a circuit
const SHELL = '#262B3A', SHELL_ROOF = '#343A50';
const FAN = '#1B2030';
const LED = WIN, LED_NIGHT = WIN_NIGHT, HOT = BEACON, HOT_OFF = BEACON_OFF; // the town windows' teal, and the beacons' red
const CONCRETE = '#CDD2DC';
const IN_OUT = 0.1, IN_D = 0.05, IN_SIDE = 0.07, IN_ROAD = 0.045; // how far a hall stands back from each kind of edge

function dcTierIndex(size) { let k = 0; for (let i = 0; i < DC_TIERS.length; i++) if (size >= DC_TIERS[i].min) k = i; return k; }
/* Varied tiers, as for towns (Art.variedTiers): the top art goes to a few tiles at the cluster's heart. But a data centre
   is one machine, so once it passes campus size none of its tiles draws below campus. The matrioshka needs a whole tile:
   it goes to the best-placed whole tile, and a partial tile ranked that high draws as exascale.
   cluster: [[q, r, data-centre wedges, tile id], ...] */
function dcVariedTiers(cluster, T) {
  const out = variedTiers(cluster, T).map(t => Math.max(t, Math.min(T, 3)));
  if (T !== 6) return out;
  out.forEach((t, j) => { if (t === 6 && cluster[j][2] < 6) out[j] = 5; });
  if (!out.includes(6)) {
    let cx = 0, cy = 0, n = 0, best = -1, bd = 0;
    for (const c of cluster) { cx += (1.5 * c[0]) * c[2]; cy += Math.sqrt(3) * (c[1] + c[0] / 2) * c[2]; n += c[2]; }
    cx /= n; cy /= n;
    cluster.forEach((c, j) => {
      if (c[2] < 6) return;
      const d = Math.hypot(1.5 * c[0] - cx, Math.sqrt(3) * (c[1] + c[0] / 2) - cy);
      if (best < 0 || out[j] > out[best] || (out[j] === out[best] && d < bd)) { best = j; bd = d; }
    });
    if (best >= 0) out[best] = 6;
  }
  return out;
}

/* ---------- data centres: geometry ---------- */
function area(P) { let s = 0; for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function normals(P) { // outward unit normal of each edge k (P[k] -> P[k+1]); screen y points down
  const sg = area(P) > 0 ? 1 : -1;
  return P.map((a, k) => { const b = P[(k + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [sg * dy / l, -sg * dx / l]; });
}
function inset(P, m) { // move each edge k inward by m[k] (or m) and rejoin the corners
  const n = P.length, N = normals(P), L = [];
  for (let k = 0; k < n; k++) {
    const a = P[k], b = P[(k + 1) % n], mm = Array.isArray(m) ? m[k] : m;
    L.push([a[0] - N[k][0] * mm, a[1] - N[k][1] * mm, b[0] - a[0], b[1] - a[1]]);
  }
  return L.map((B, k) => {
    const A = L[(k + n - 1) % n], cr = A[2] * B[3] - A[3] * B[2];
    if (Math.abs(cr) < 1e-9) return [B[0], B[1]];
    const t = ((B[0] - A[0]) * B[3] - (B[1] - A[1]) * B[2]) / cr;
    return [A[0] + A[2] * t, A[1] + A[3] * t];
  });
}
function inside(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function edgeDist(P, x, y) {
  let d = 1e9;
  for (let k = 0; k < P.length; k++) {
    const a = P[k], b = P[(k + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t));
  }
  return d;
}
function centroid(P) {
  let cx = 0, cy = 0, A = 0;
  for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length], c = a[0] * b[1] - b[0] * a[1]; A += c; cx += (a[0] + b[0]) * c; cy += (a[1] + b[1]) * c; }
  return [cx / (3 * A), cy / (3 * A)];
}
function hexPts(r, x, y) { return CORN.map(c => [x + c[0] * r, y + c[1] * r]); }
function runsOf(w) { // the tile's data-centre wedges as runs of neighbours, going round
  const ds = []; for (let i = 0; i < 6; i++) if (w[i] === 'D') ds.push(i);
  if (ds.length === 6) return [[0, 1, 2, 3, 4, 5]];
  if (!ds.length) return [];
  let s = 0; while (w[s] === 'D') s++;
  const runs = []; let cur = null;
  for (let k = 1; k <= 6; k++) { const i = (s + k) % 6; if (w[i] === 'D') { if (!cur) { cur = []; runs.push(cur); } cur.push(i); } else cur = null; }
  return runs;
}

/* ---------- data centres: planning ---------- */
function mkDC(a, kind, x, y, props) {
  const b = Object.assign({ k: kind, x, y, tc: a.c, wx: a.c[0] + x, wy: a.c[1] + y, a }, props);
  b.id = (Math.floor((b.seed || 0) * 1e9) ^ a.sid) | 0;
  return b;
}
function seaSpot(i, side, s) { // where cooling stands on wedge i, on the side its sea is
  if (side === 'a') return wpt(i, 0.56, 0.14);
  if (side === 'b') return wpt(i, 0.14, 0.56);
  return s < 0.5 ? wpt(i, 0.5, 0.3) : wpt(i, 0.3, 0.5);
}
/* a: { sid, c, w, d, ti: art tier, hot, sea[i]: 'a' | 'b' | 'o' | null (which side of wedge i its sea is),
        nb[i]: the wedge across edge i is data centre, nbT[i]: that tile's art tier } */
function planDC(a) {
  const out = [], ds = [];
  for (let i = 0; i < 6; i++) if (a.w[i] === 'D') ds.push(i);
  a.roofAt = [];
  if (!ds.length) return out;
  let T = a.ti; if (T === 6 && ds.length < 6) T = 5;
  a.T = T;
  const R = (x, y) => hh(a.sid + 11, x * 131 + y);
  if (T <= 2) { for (const i of ds) planSmall(out, a, i, T, R); return out; }
  if (T === 3) {
    for (const i of ds) {
      const P = [[0, 0], CORN[i], CORN[(i + 1) % 6]];
      const m = [a.w[(i + 5) % 6] === 'D' ? IN_ROAD : IN_SIDE, a.nb[i] ? IN_D : IN_OUT, a.w[(i + 1) % 6] === 'D' ? IN_ROAD : IN_SIDE];
      out.push(slab(a, P, m, 0.075, 'fans', R(i, 5), [i]));
    }
    if (ds.length >= 3) out.push(mkDC(a, 'mast', 0, 0.03, { seed: R(9, 1) }));
    coolers(out, a, ds, R, 'unit', 3);
    return finish(out, a);
  }
  const h = T === 4 ? 0.12 : 0.14;
  for (const run of runsOf(a.w)) {
    let P, m;
    if (run.length === 6) { P = CORN.slice(); m = run.map(i => (a.nb[i] ? IN_D : IN_OUT)); }
    else {
      P = [[0, 0]]; m = [IN_SIDE];
      for (const i of run) { P.push(CORN[i]); m.push(a.nb[i] ? IN_D : IN_OUT); }
      P.push(CORN[(run[run.length - 1] + 1) % 6]); m.push(IN_SIDE);
    }
    if (T === 6 && run.length === 6) out.push(shells(a, P, m, R(7, 7)));
    else out.push(slab(a, P, m, h, T >= 5 ? 'board' : 'fans', R(run[0], 6), run));
  }
  if (T === 4) coolers(out, a, ds, R, 'tower', 2);
  else if (T === 5) coolers(out, a, ds, R, 'tower', 1);
  if (T >= 5) for (let i = 0; i < 3; i++) // conduits over the lane to the next tile, drawn by the tile above the lane
    if (a.w[i] === 'D' && a.nb[i] && a.nbT[i] >= 4) {
      const A = CORN[i], B = CORN[(i + 1) % 6], mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      const on = out.find(b => (b.k === 'slab' || b.k === 'shells') && b.run.includes(i));
      if (on) out.push(mkDC(a, 'conduit', mx, my, { i, h: 0.1, seed: R(i, 8), on }));
    }
  return finish(out, a);
}
function finish(out, a) { // anything standing on a roof (or leaving it) is drawn just after that roof, back to front
  for (const b of out) {
    if (!b.on) continue;
    b.wy = b.on.wy + 0.001 + (b.y + 1) * 1e-4;
  }
  return out;
}
function planSmall(out, a, i, T, R) {
  const s0 = R(i, 0), s1 = R(i, 1), side = a.sea[i];
  if (T === 0) {
    const p = wpt(i, 0.4, 0.4), y = p[1] + 0.05;
    out.push(mkDC(a, 'rack', p[0], y, { w: 0.22, h: 0.1, d: 0.08, seed: s0, steam: !!side, wedge: i }));
    a.roofAt[i] = [p[0] + 0.04, y - 0.12];
    return;
  }
  if (T === 1) {
    const p = wpt(i, 0.36, 0.36), y = p[1] + 0.06;
    out.push(mkDC(a, 'hall', p[0], y, { w: 0.3, h: 0.085, d: 0.12, fans: [2, 1], leds: 6, seed: s0, steam: !!side, wedge: i }));
    const g = s1 < 0.5 ? wpt(i, 0.62, 0.14) : wpt(i, 0.14, 0.62);
    out.push(mkDC(a, 'gen', g[0], g[1] + 0.03, { w: 0.075, h: 0.055, d: 0.05, seed: s1 }));
    a.roofAt[i] = [p[0] + 0.05, y - 0.12];
    return;
  }
  const p = wpt(i, 0.34, 0.34), y = p[1] + 0.07;
  out.push(mkDC(a, 'hall', p[0], y, { w: 0.36, h: 0.1, d: 0.15, fans: [3, 2], leds: 8, seed: s0, wedge: i }));
  a.roofAt[i] = [p[0] + 0.07, y - 0.15];
  if (side) { const q = seaSpot(i, side, s1); out.push(mkDC(a, 'unit', q[0], q[1] + 0.04, { w: 0.1, h: 0.14, d: 0.07, seed: s1, wedge: i })); }
}
function coolers(out, a, ds, R, kind, cap) { // cooling where the sea is: units on campus roofs, towers from hyperscale up
  const slabOf = i => out.find(b => (b.k === 'slab' || b.k === 'shells') && b.run.includes(i));
  let n = 0;
  const order = ds.filter(i => a.sea[i]).sort((x, y) => CORN[(y + 1) % 6][1] - CORN[(x + 1) % 6][1]);
  for (const i of order) {
    if (n >= cap) break;
    const s = slabOf(i); if (!s) continue;
    const q = seaSpot(i, a.sea[i], R(i, 3));
    if (!inside(s.fp, q[0], q[1])) continue;
    if (kind === 'unit') out.push(mkDC(a, 'unit', q[0], q[1] - s.h + 0.03, { w: 0.09, h: 0.12, d: 0.06, seed: R(i, 4), on: s, wedge: i }));
    else out.push(mkDC(a, 'tower', q[0], q[1] - s.h + 0.02, { rb: 0.085, rw: 0.054, rt: 0.064, H: 0.3, seed: R(i, 4), on: s, wedge: i }));
    n++;
  }
}
function wallsOf(fp, h, base) { // the walls that face the viewer, back to front, with a shade for each
  const N = normals(fp), walls = [];
  for (let k = 0; k < fp.length; k++) {
    if (N[k][1] < 0.02) continue;
    const A = fp[k], B = fp[(k + 1) % fp.length];
    walls.push({ A, B, n: N[k], f: 1 - 0.24 * Math.max(0, N[k][0]) + 0.06 * Math.max(0, -N[k][0]), my: (A[1] + B[1]) / 2 });
  }
  walls.sort((p, q) => p.my - q.my);
  return walls;
}
function ledsOn(walls, h, step) {
  const out = [];
  let run = 0;
  for (const w of walls) {
    const dx = w.B[0] - w.A[0], dy = w.B[1] - w.A[1], len = Math.hypot(dx, dy), n = Math.max(1, Math.floor(len / step));
    for (let j = 0; j < n; j++) { const u = (j + 0.5) / n; out.push([w.A[0] + dx * u, w.A[1] + dy * u - h * 0.55, run + u * len]); }
    run += len;
  }
  return out;
}
function slab(a, P, m, h, roof, seed, run) {
  const fp = inset(P, m), walls = wallsOf(fp, h);
  let front = -9; for (const p of fp) front = Math.max(front, p[1]);
  const b = mkDC(a, 'slab', 0, front, { fp, h, roof, seed, run, walls, leds: ledsOn(walls, h, 0.07) });
  // pale roofs carry a grid of fans; circuit roofs a die with traces running out to pads
  b.lamps = [];
  if (roof === 'fans') b.strips = run.length === 1 && a.T === 3 ? wedgeStrip(fp, run[0]) : rowsOn(fp, 0.31, 0.1);
  else if (roof === 'board') b.board = circuit(fp, b.id);
  // sodium lamps along the fence (edges that face open ground) and down the lanes, on the near and side sides only
  const N = normals(P);
  for (let k = 0; k < P.length; k++) {
    const lane = Math.abs(m[k] - IN_ROAD) < 1e-6;
    if ((m[k] < IN_SIDE - 1e-6 && !(lane && k === 0)) || N[k][1] < -0.35) continue;
    const A = P[k], B = P[(k + 1) % P.length], len = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.round(len / 0.34));
    for (let j = 0; j < n; j++) {
      const u = (j + 0.5) / n, off = m[k] * 0.42;
      b.lamps.push([A[0] + (B[0] - A[0]) * u - N[k][0] * off, A[1] + (B[1] - A[1]) * u - N[k][1] * off]);
    }
  }
  for (const i of run) { const c = wpt(i, 0.4, 0.4); a.roofAt[i] = [c[0], c[1] - h]; }
  return b;
}
function wedgeStrip(fp, i) { // one row of fans along a campus hall, parallel to the tile's edge
  for (let k = 0; k < 4; k++) {
    const u = 0.42 - k * 0.04, v = 0.14 + k * 0.02, A = wpt(i, u, v), B = wpt(i, v, u);
    if (inside(fp, A[0], A[1]) && inside(fp, B[0], B[1]) && edgeDist(fp, A[0], A[1]) > 0.045 && edgeDist(fp, B[0], B[1]) > 0.045) return [[A[0], A[1], B[0], B[1]]];
  }
  return [];
}
function rowsOn(fp, step, margin) { // level rows across a roof, each cut to the roof's shape
  let y0 = 9, y1 = -9; for (const p of fp) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const out = [], n = Math.max(1, Math.floor((y1 - y0 - 0.12) / step)), gap = (y1 - y0 - (n - 1) * step) / 2;
  for (let r = 0; r < n; r++) {
    const y = y0 + gap + r * step, xs = [];
    for (let k = 0; k < fp.length; k++) { const a = fp[k], b = fp[(k + 1) % fp.length]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])); }
    xs.sort((p, q) => p - q);
    for (let j = 0; j + 1 < xs.length; j += 2) { const x0 = xs[j] + margin, x1 = xs[j + 1] - margin; if (x1 - x0 > 0.15) out.push([x0, y, x1, y]); }
  }
  return out;
}
function circuit(fp, id) {
  const c0 = centroid(fp), c = inside(fp, c0[0], c0[1]) ? c0 : fp[0].map((v, k) => (v + fp[2][k]) / 2);
  let span = 0; for (const p of fp) span = Math.max(span, Math.hypot(p[0] - c[0], p[1] - c[1]));
  const die = Math.min(0.13, span * 0.28), traces = [], vias = [];
  const ok = (x, y) => inside(fp, x, y) && edgeDist(fp, x, y) > 0.04;
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let k = 0;
  for (const [sx, sy] of sides) for (let j = 0; j < 3; j++, k++) {
    const r = (q) => hh(id, k * 7 + q), off = (j - 1) * die * 0.55;
    let x = c[0] + sx * die + (sy ? off : 0), y = c[1] + sy * die * 0.8 + (sx ? off : 0);
    const pts = [[x, y]];
    const turn = r(1) < 0.5 ? 1 : -1, l1 = 0.06 + r(2) * 0.12, l2 = 0.04 + r(3) * 0.09, l3 = 0.05 + r(4) * 0.14;
    const legs = [[sx, sy, l1], [sx * 0.7 - sy * 0.7 * turn, sy * 0.7 + sx * 0.7 * turn, l2], [sx, sy, l3]];
    for (const [dx, dy, l] of legs) {
      const nx = x + dx * l, ny = y + dy * l;
      if (!ok(nx, ny)) break;
      x = nx; y = ny; pts.push([x, y]);
    }
    if (pts.length > 1) { let len = 0; for (let q = 1; q < pts.length; q++) len += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]); traces.push({ pts, len, ph: r(5) }); }
  }
  for (let q = 0; q < 14; q++) { const x = c[0] + (hh(id, 300 + q) - 0.5) * span * 1.7, y = c[1] + (hh(id, 400 + q) - 0.5) * span * 1.5; if (ok(x, y) && Math.hypot(x - c[0], y - c[1]) > die * 1.6) vias.push([x, y]); }
  return { c, die, traces, vias };
}
function shells(a, P, m, seed) { // a matrioshka: a hall shaped like the tile, with smaller ones stacked on it, like layers of an onion
  const base = slab(a, P, m, 0.1, 'none', seed, [0, 1, 2, 3, 4, 5]);
  base.k = 'shells';
  const layers = [], hs = [0.09, 0.09, 0.07], rs = [0.7, 0.48, 0.27];
  let y = -0.1;
  for (let j = 0; j < 3; j++) {
    const fp = hexPts(rs[j], 0, y), h = hs[j], walls = wallsOf(fp, h);
    layers.push({ fp, h, walls, leds: ledsOn(walls, h, 0.05), fins: rs[j] });
    y -= h;
  }
  base.layers = layers; base.top = y; base.fins = [];
  for (let j = 0; j < 3; j++) { // radiator fins on each terrace, between a layer's edge and the next one's foot
    const r1 = rs[j] + 0.025, r0 = j ? rs[j - 1] * 0.84 : 0.76, yy = j ? layers[j - 1].fp[0][1] - layers[j - 1].h : -0.1, n = 30 - j * 8;
    for (let q = 0; q < n; q++) { const ang = (q + 0.5) / n * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang); base.fins.push([j, ca * r1, yy + sa * r1, ca * r0, yy + sa * r0]); }
  }
  return base;
}

/* ---------- data centres: drawing ---------- */
function poly(ctx, P, dy) { ctx.beginPath(); P.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1] - (dy || 0)) : ctx.moveTo(p[0], p[1] - (dy || 0)))); ctx.closePath(); }
function beat(env) { return !env.motion || Math.sin(env.t * 5) > 0; } // one shared beat, so a hot cluster reads as one alarm
function ledAlpha(env, ph, seed) { return env.motion ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(env.t * 3 - ph * 9 + seed * 9)) : 0.9; }
function steam(ctx, x, y, n, rise, r0, r1, seed, env, spread) {
  for (let k = 0; k < n; k++) {
    const ph = ((env.motion ? env.t * 0.22 : 0.3) + seed + k / n) % 1;
    ctx.globalAlpha = 0.62 * (1 - ph) * Math.min(1, ph * 6 + 0.2); ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x + (spread || 0) * ph + Math.sin(ph * 5 + seed * 9) * 0.012, y - ph * rise, r0 + ph * (r1 - r0), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function topPt(b, fx, fy) { // a point on a box's top face: fx across, fy back
  const dy = b.d * DEPTH; return [b.x - b.w / 2 + b.w * fx + b.d * fy, b.y - b.h - dy * fy];
}
function fan(ctx, x, y, r, sq) {
  ctx.fillStyle = RIM; ctx.beginPath(); ctx.ellipse(x, y, r, r * sq, 0, 0, 7); ctx.fill();
  ctx.fillStyle = FAN; ctx.beginPath(); ctx.ellipse(x, y, r * 0.66, r * 0.66 * sq, 0, 0, 7); ctx.fill();
}
function drawRack(ctx, b, env, night) {
  const hot = b.a.hot, on = beat(env), x = b.x, y = b.y, w = b.w, h = b.h;
  if (night) {
    if (hot) { const P = [[x - w / 2, y], [x + w / 2, y], topPt(b, 1, 0), topPt(b, 1, 1), topPt(b, 0, 1), topPt(b, 0, 0)]; hotRing(ctx, P, 0, on); }
    for (let k = 0; k < 4; k++) {
      ctx.globalAlpha = hot ? (on ? 1 : 0.3) : ledAlpha(env, k * 0.09, b.seed);
      ctx.fillStyle = hot ? HOT : LED_NIGHT; ctx.beginPath(); ctx.arc(x - w * 0.33 + k * w * 0.22, y - h * 0.45, hot ? 0.022 : 0.016, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1; return;
  }
  boxFaces(ctx, x, y, w, h, b.d, WALL, shade(WALL, 0.78), TOP);
  const f = topPt(b, 0.62, 0.5); fan(ctx, f[0], f[1], 0.026, 0.55);
  for (let k = 0; k < 4; k++) {
    ctx.globalAlpha = hot ? (on ? 1 : 0.35) : ledAlpha(env, k * 0.09, b.seed);
    ctx.fillStyle = hot ? HOT : LED; ctx.beginPath(); ctx.arc(x - w * 0.33 + k * w * 0.22, y - h * 0.45, 0.013, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (b.steam) { const s = topPt(b, 0.3, 0.5); steam(ctx, s[0], s[1], 2, 0.16, 0.022, 0.05, b.seed, env); }
}
function drawHall(ctx, b, env, night) {
  const hot = b.a.hot, on = beat(env), x = b.x, y = b.y, w = b.w, h = b.h, n = b.leds;
  if (night) {
    if (hot) { const P = [[x - w / 2, y], [x + w / 2, y], topPt(b, 1, 0), topPt(b, 1, 1), topPt(b, 0, 1), topPt(b, 0, 0)]; hotRing(ctx, P, 0, on); }
    for (let k = 0; k < n; k++) {
      ctx.globalAlpha = hot ? (on ? 1 : 0.3) : ledAlpha(env, k * 0.06, b.seed);
      ctx.fillStyle = hot ? HOT : LED_NIGHT; ctx.beginPath(); ctx.arc(x - w * 0.4 + k * w * 0.8 / (n - 1), y - h * 0.62, hot ? 0.018 : 0.013, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1; return;
  }
  boxFaces(ctx, x, y, w, h, b.d, WALL, shade(WALL, 0.78), ROOF_HALL);
  ctx.fillStyle = ROOF_EDGE; // the roof's lit near edge
  ctx.beginPath(); ctx.moveTo(x - w / 2, y - h); ctx.lineTo(x + w / 2, y - h); ctx.lineTo(x + w / 2 + 0.012, y - h - 0.007); ctx.lineTo(x - w / 2 + 0.012, y - h - 0.007); ctx.closePath(); ctx.fill();
  const [cols, rows] = b.fans;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const p = topPt(b, (c + 0.5) / cols, (r + 0.5) / rows); fan(ctx, p[0], p[1], Math.min(0.03, b.w / cols * 0.3), 0.55); }
  ctx.fillStyle = '#1E2230'; ctx.fillRect(x + w * 0.28, y - h * 0.62, w * 0.12, h * 0.62); // a door
  for (let k = 0; k < n; k++) {
    ctx.globalAlpha = hot ? (on ? 1 : 0.35) : ledAlpha(env, k * 0.06, b.seed);
    ctx.fillStyle = hot ? HOT : LED; ctx.beginPath(); ctx.arc(x - w * 0.4 + k * w * 0.8 / (n - 1), y - h * 0.62, 0.011, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (b.steam) { const s = topPt(b, 0.2, 0.5); steam(ctx, s[0], s[1], 2, 0.18, 0.024, 0.055, b.seed, env); }
}
function drawGen(ctx, b, env, night) {
  if (night) return;
  boxFaces(ctx, b.x, b.y, b.w, b.h, b.d, '#3A4256', '#2E3546', '#6B7590');
  ctx.fillStyle = '#2A3040'; ctx.fillRect(b.x + b.w * 0.18, b.y - b.h - 0.05, 0.012, 0.05);
  ctx.fillStyle = '#1E2230'; for (let k = 0; k < 3; k++) ctx.fillRect(b.x - b.w * 0.36 + k * 0.02, b.y - b.h * 0.7, 0.01, b.h * 0.45);
}
function drawUnit(ctx, b, env, night) { // a boxy cooling tower, steaming
  if (night) { ctx.globalAlpha = 0.16; ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(b.x + b.d / 2, b.y - b.h - 0.08, 0.07, 0, 7); ctx.fill(); ctx.globalAlpha = 1; return; }
  boxFaces(ctx, b.x, b.y, b.w, b.h, b.d, CONCRETE, shade(CONCRETE, 0.8), shade(CONCRETE, 1.1));
  ctx.fillStyle = 'rgba(60,70,90,.35)'; for (let k = 0; k < 3; k++) ctx.fillRect(b.x - b.w * 0.36, b.y - b.h * (0.78 - k * 0.24), b.w * 0.72, 0.008);
  const p = topPt(b, 0.5, 0.5); fan(ctx, p[0], p[1], b.w * 0.3, 0.55);
  steam(ctx, p[0], p[1] - 0.01, 3, 0.26, 0.03, 0.075, b.seed, env, 0.03);
}
function drawTower(ctx, b, env, night) { // a cooling tower with a waist, and its plume
  const x = b.x, y = b.y, H = b.H, rb = b.rb, rw = b.rw, rt = b.rt, ty = y - H;
  if (night) { // the plume catches the campus lights
    ctx.globalAlpha = 0.13; ctx.fillStyle = '#FFE9D2';
    ctx.beginPath(); ctx.ellipse(x + 0.04, ty - 0.12, 0.1, 0.13, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    beaconAt(ctx, x, ty - 0.004, b.seed, env, true); return;
  }
  ctx.fillStyle = '#C3C9D5';
  ctx.beginPath(); ctx.moveTo(x - rb, y); ctx.quadraticCurveTo(x - rw * 0.7, y - H * 0.62, x - rt, ty); ctx.lineTo(x + rt, ty); ctx.quadraticCurveTo(x + rw * 0.7, y - H * 0.62, x + rb, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(70,78,100,.28)'; // shade on the far side
  ctx.beginPath(); ctx.moveTo(x + rb * 0.1, y); ctx.quadraticCurveTo(x + rw * 0.25, y - H * 0.62, x + rt * 0.2, ty); ctx.lineTo(x + rt, ty); ctx.quadraticCurveTo(x + rw * 0.7, y - H * 0.62, x + rb, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#E3E7EE'; ctx.beginPath(); ctx.ellipse(x, ty, rt, rt * 0.32, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#4A5068'; ctx.beginPath(); ctx.ellipse(x, ty + 0.002, rt * 0.82, rt * 0.24, 0, 0, 7); ctx.fill();
  steam(ctx, x, ty - 0.02, 4, 0.42, 0.045, 0.12, b.seed, env, 0.08);
}
function beaconAt(ctx, x, y, seed, env, night) { // a red light like the towns' beacons, a little smaller
  const on = !env.motion || Math.sin(env.t * 4 + seed * 20) > 0;
  if (night) { if (!on) return; ctx.globalAlpha = 0.9; ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(x, y, 0.03, 0, 7); ctx.fill(); ctx.globalAlpha = 1; return; }
  ctx.fillStyle = on ? HOT : HOT_OFF; ctx.beginPath(); ctx.arc(x, y, 0.018, 0, 7); ctx.fill();
}
function drawMast(ctx, b, env, night) { // the substation: transformers and a lattice mast with a red light
  const x = b.x, y = b.y, H = 0.42;
  if (night) { beaconAt(ctx, x, y - H, b.seed, env, true); return; }
  boxFaces(ctx, x - 0.06, y + 0.01, 0.06, 0.05, 0.04, '#5A6278', '#474E62', '#7C849A');
  boxFaces(ctx, x + 0.05, y + 0.02, 0.06, 0.05, 0.04, '#5A6278', '#474E62', '#7C849A');
  ctx.strokeStyle = '#2A3040'; ctx.lineWidth = 0.009;
  ctx.beginPath(); ctx.moveTo(x - 0.035, y); ctx.lineTo(x - 0.006, y - H); ctx.moveTo(x + 0.035, y); ctx.lineTo(x + 0.006, y - H);
  for (let k = 1; k < 6; k++) { const f0 = (k - 1) / 6, f1 = k / 6, w0 = 0.035 - 0.029 * f0, w1 = 0.035 - 0.029 * f1; ctx.moveTo(x - w0, y - H * f0); ctx.lineTo(x + w1, y - H * f1); ctx.moveTo(x + w0, y - H * f0); ctx.lineTo(x - w1, y - H * f1); }
  ctx.moveTo(x - 0.06, y - H * 0.78); ctx.lineTo(x + 0.06, y - H * 0.78); ctx.stroke();
  beaconAt(ctx, x, y - H, b.seed, env, false);
}
function prism(ctx, fp, h, walls, wallCol, roofCol) {
  for (const w of walls) {
    ctx.fillStyle = shade(wallCol, w.f);
    ctx.beginPath(); ctx.moveTo(w.A[0], w.A[1]); ctx.lineTo(w.B[0], w.B[1]); ctx.lineTo(w.B[0], w.B[1] - h); ctx.lineTo(w.A[0], w.A[1] - h); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = roofCol; poly(ctx, fp, h); ctx.fill();
}
function wallLeds(ctx, leds, env, seed, hot, on, night) {
  for (const l of leds) {
    ctx.globalAlpha = hot ? (on ? 1 : 0.3) : ledAlpha(env, l[2] * 0.6, seed);
    ctx.fillStyle = hot ? HOT : night ? LED_NIGHT : LED;
    ctx.fillRect(l[0] - 0.009, l[1] - 0.006, 0.018, 0.012);
  }
  ctx.globalAlpha = 1;
}
function seams(ctx, walls, h, col, alpha, width) { // a line of light along the top of each front wall
  ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = width; ctx.beginPath();
  for (const w of walls) { ctx.moveTo(w.A[0], w.A[1] - h); ctx.lineTo(w.B[0], w.B[1] - h); }
  ctx.stroke(); ctx.globalAlpha = 1;
}
function lampsNight(ctx, lamps) {
  for (const p of lamps) {
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 0.13);
    g.addColorStop(0, 'rgba(255,170,80,.32)'); g.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,150,.95)'; ctx.beginPath(); ctx.arc(p[0], p[1] - 0.045, 0.014, 0, 7); ctx.fill();
  }
}
function hotRing(ctx, fp, h, on) { // a cluster running hot: its roofs outlined in red, on the shared beat
  ctx.globalAlpha = on ? 0.62 : 0.16; ctx.strokeStyle = HOT; ctx.lineWidth = 0.03; ctx.lineJoin = 'round';
  poly(ctx, fp, h); ctx.stroke(); ctx.globalAlpha = 1;
}
function strips(ctx, list, h) { // rows of chillers, their fans drawn as dots along each row
  if (!list || !list.length) return;
  ctx.lineCap = 'round'; ctx.strokeStyle = STRIP; ctx.lineWidth = 0.075; ctx.beginPath();
  for (const r of list) { ctx.moveTo(r[0], r[1] - h); ctx.lineTo(r[2], r[3] - h); }
  ctx.stroke();
  ctx.setLineDash([0.001, 0.085]); ctx.lineDashOffset = -0.03;
  ctx.strokeStyle = RIM; ctx.lineWidth = 0.056; ctx.stroke();
  ctx.strokeStyle = FAN; ctx.lineWidth = 0.034; ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'butt';
}
function stripLights(ctx, list, h, hot, on) {
  if (!list) return;
  ctx.fillStyle = hot ? HOT : LED_NIGHT; ctx.globalAlpha = hot ? (on ? 0.95 : 0.25) : 0.8;
  for (const r of list) { ctx.beginPath(); ctx.arc(r[0] - 0.02, r[1] - h, 0.013, 0, 7); ctx.arc(r[2] + 0.02, r[3] - h, 0.013, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
}
function drawSlab(ctx, b, env, night) {
  const hot = b.a.hot, on = beat(env), h = b.h;
  if (night) {
    if (hot) hotRing(ctx, b.fp, h, on);
    seams(ctx, b.walls, h, hot ? HOT : LED_NIGHT, hot ? (on ? 0.9 : 0.25) : b.a.T === 3 ? 0.4 : 0.5, 0.012);
    wallLeds(ctx, b.leds, env, b.seed, hot, on, true);
    stripLights(ctx, b.strips, h, hot, on);
    if (b.board) boardNight(ctx, b, env, hot, on);
    lampsNight(ctx, b.lamps);
    return;
  }
  prism(ctx, b.fp, h, b.walls, WALL, b.board ? BOARD : ROOF);
  ctx.strokeStyle = ROOF_EDGE; ctx.lineWidth = 0.012; ctx.beginPath(); // the roof's near edge catches the light
  for (const w of b.walls) { ctx.moveTo(w.A[0], w.A[1] - h); ctx.lineTo(w.B[0], w.B[1] - h); }
  ctx.stroke();
  strips(ctx, b.strips, h);
  if (b.board) boardDay(ctx, b);
  wallLeds(ctx, b.leds, env, b.seed, hot, on, false);
  posts(ctx, b.lamps);
}
function posts(ctx, lamps) { ctx.fillStyle = '#20252F'; for (const p of lamps) ctx.fillRect(p[0] - 0.005, p[1] - 0.045, 0.01, 0.045); }
function boardDay(ctx, b) {
  const B = b.board, h = b.h;
  ctx.strokeStyle = TRACE; ctx.lineWidth = 0.011; ctx.lineJoin = 'round';
  for (const tr of B.traces) { ctx.beginPath(); tr.pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1] - h) : ctx.moveTo(p[0], p[1] - h))); ctx.stroke(); }
  ctx.fillStyle = TRACE;
  for (const tr of B.traces) { const p = tr.pts[tr.pts.length - 1]; ctx.beginPath(); ctx.arc(p[0], p[1] - h, 0.017, 0, 7); ctx.fill(); }
  for (const v of B.vias) { ctx.beginPath(); ctx.arc(v[0], v[1] - h, 0.01, 0, 7); ctx.fill(); }
  const d = B.die;
  ctx.fillStyle = '#1A1E2B'; ctx.fillRect(B.c[0] - d, B.c[1] - h - d * 0.8, d * 2, d * 1.6);
  ctx.strokeStyle = '#7C88A6'; ctx.lineWidth = 0.008; ctx.strokeRect(B.c[0] - d, B.c[1] - h - d * 0.8, d * 2, d * 1.6);
}
function boardNight(ctx, b, env, hot, on) {
  const B = b.board, h = b.h, col = hot ? HOT : LED_NIGHT;
  ctx.strokeStyle = col; ctx.lineWidth = 0.009; ctx.lineJoin = 'round'; ctx.globalAlpha = hot ? (on ? 0.6 : 0.2) : 0.42;
  for (const tr of B.traces) { ctx.beginPath(); tr.pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1] - h) : ctx.moveTo(p[0], p[1] - h))); ctx.stroke(); }
  ctx.globalAlpha = hot ? (on ? 0.9 : 0.3) : 0.75; ctx.fillStyle = col;
  for (const tr of B.traces) { const p = tr.pts[tr.pts.length - 1]; ctx.beginPath(); ctx.arc(p[0], p[1] - h, 0.016, 0, 7); ctx.fill(); }
  if (!hot) for (const tr of B.traces) { // data running out from the die
    const u = ((env.motion ? env.t * 0.35 : 0.5) + tr.ph) % 1; let want = u * tr.len, p = tr.pts[0];
    for (let q = 1; q < tr.pts.length; q++) {
      const A = tr.pts[q - 1], C = tr.pts[q], l = Math.hypot(C[0] - A[0], C[1] - A[1]);
      if (want <= l) { p = [A[0] + (C[0] - A[0]) * want / l, A[1] + (C[1] - A[1]) * want / l]; break; }
      want -= l; p = C;
    }
    ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.arc(p[0], p[1] - h, 0.018, 0, 7); ctx.fill();
  }
  const d = B.die; ctx.globalAlpha = hot ? (on ? 0.7 : 0.25) : 0.55; ctx.strokeStyle = col; ctx.lineWidth = 0.012;
  ctx.strokeRect(B.c[0] - d, B.c[1] - h - d * 0.8, d * 2, d * 1.6);
  ctx.globalAlpha = 1;
}
function drawShells(ctx, b, env, night) {
  const hot = b.a.hot, on = beat(env), h = b.h;
  if (night) {
    if (hot) hotRing(ctx, b.fp, h, on);
    seams(ctx, b.walls, h, hot ? HOT : LED_NIGHT, hot ? (on ? 0.9 : 0.25) : 0.55, 0.012);
    wallLeds(ctx, b.leds, env, b.seed, hot, on, true);
    b.layers.forEach((L, j) => {
      seams(ctx, L.walls, L.h, hot ? HOT : j % 2 ? VIOLET : LED_NIGHT, hot ? (on ? 0.9 : 0.25) : 0.7, 0.012);
      wallLeds(ctx, L.leds, env, b.seed + j, hot, on, true);
    });
    const g = ctx.createRadialGradient(0, b.top, 0.02, 0, b.top, 0.5);
    g.addColorStop(0, hot ? 'rgba(255,90,110,.22)' : 'rgba(138,111,209,.32)'); g.addColorStop(1, hot ? 'rgba(255,90,110,0)' : 'rgba(138,111,209,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, b.top, 0.5, 0, 7); ctx.fill();
    lampsNight(ctx, b.lamps);
    nightEye(ctx, b, 0, b.top, 0.1, 0.06, b.seed, env);
    return;
  }
  prism(ctx, b.fp, h, b.walls, SHELL, SHELL_ROOF);
  ctx.strokeStyle = '#5A6380'; ctx.lineWidth = 0.008; ctx.beginPath();
  for (const f of b.fins.filter(f => f[0] === 0)) { ctx.moveTo(f[1], f[2]); ctx.lineTo(f[3], f[4]); }
  ctx.stroke();
  b.layers.forEach((L, j) => {
    prism(ctx, L.fp, L.h, L.walls, shade(SHELL, 1 + j * 0.06), shade(SHELL_ROOF, 1 + j * 0.08));
    ctx.strokeStyle = '#5A6380'; ctx.lineWidth = 0.008; ctx.beginPath();
    for (const f of b.fins.filter(f => f[0] === j + 1)) { ctx.moveTo(f[1], f[2]); ctx.lineTo(f[3], f[4]); }
    ctx.stroke();
    wallLeds(ctx, L.leds, env, b.seed + j, hot, on, false);
  });
  wallLeds(ctx, b.leds, env, b.seed, hot, on, false);
  posts(ctx, b.lamps);
  drawEye(ctx, b, 0, b.top, 0.1, 0.06, b.seed, env);
}
function drawConduit(ctx, b, env, night) { // a covered bridge over the lane to the next tile
  const i = b.i, A = CORN[i], B = CORN[(i + 1) % 6], ex = B[0] - A[0], ey = B[1] - A[1], el = Math.hypot(ex, ey);
  const ux = ex / el, uy = ey / el, nx = uy, ny = -ux, half = 0.035, reach = 0.085;
  const fp = [[b.x - ux * half - nx * reach, b.y - uy * half - ny * reach], [b.x + ux * half - nx * reach, b.y + uy * half - ny * reach],
              [b.x + ux * half + nx * reach, b.y + uy * half + ny * reach], [b.x - ux * half + nx * reach, b.y - uy * half + ny * reach]];
  const walls = b.walls || (b.walls = wallsOf(fp, b.h));
  if (night) {
    const hot = b.a.hot, on = beat(env);
    ctx.globalAlpha = hot ? (on ? 0.9 : 0.25) : 0.75; ctx.strokeStyle = hot ? HOT : LED_NIGHT; ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.moveTo(b.x - nx * reach, b.y - ny * reach - b.h); ctx.lineTo(b.x + nx * reach, b.y + ny * reach - b.h); ctx.stroke();
    if (!hot && env.motion) { const u = (env.t * 0.6 + b.seed) % 1 * 2 - 1; ctx.fillStyle = LED_NIGHT; ctx.beginPath(); ctx.arc(b.x + nx * reach * u, b.y + ny * reach * u - b.h, 0.016, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1; return;
  }
  prism(ctx, fp, b.h, walls, WALL, BOARD);
}
function drawDC(ctx, b, env, night) {
  switch (b.k) {
    case 'rack': drawRack(ctx, b, env, night); break;
    case 'hall': drawHall(ctx, b, env, night); break;
    case 'gen': drawGen(ctx, b, env, night); break;
    case 'unit': drawUnit(ctx, b, env, night); break;
    case 'tower': drawTower(ctx, b, env, night); break;
    case 'mast': drawMast(ctx, b, env, night); break;
    case 'slab': drawSlab(ctx, b, env, night); break;
    case 'shells': drawShells(ctx, b, env, night); break;
    case 'conduit': drawConduit(ctx, b, env, night); break;
  }
}

/* ---------- data centres: the ground ---------- */
/* intake[j] for a sea wedge j: { side: 'a' | 'b' | 'o' (where the data centre is), T: the highest art tier it cools } */
function intakePipe(j, side) { // from the shore it shares with the data centre, out into the water
  if (side === 'a') return [wpt(j, 0.46, 0), wpt(j, 0.42, 0.2)];
  if (side === 'b') return [wpt(j, 0, 0.46), wpt(j, 0.2, 0.42)];
  return [wpt(j, 0.5, 0.5), wpt(j, 0.36, 0.36)];
}
function podSpots(j, side) { return side === 'b' ? [wpt(j, 0.52, 0.24), wpt(j, 0.3, 0.12)] : [wpt(j, 0.24, 0.52), wpt(j, 0.12, 0.3)]; }
function capsule(ctx, x, y, w, hgt) { const r = hgt / 2; ctx.beginPath(); ctx.moveTo(x - w / 2 + r, y - r); ctx.lineTo(x + w / 2 - r, y - r); ctx.arc(x + w / 2 - r, y, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x - w / 2 + r, y + r); ctx.arc(x - w / 2 + r, y, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); }
function drawDCGround(ctx, a) {
  if (a.T >= 2) { // a fence along the cluster's edge
    ctx.strokeStyle = 'rgba(214,220,234,.45)'; ctx.lineWidth = 0.012; ctx.setLineDash([0.03, 0.022]); ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      if (a.w[i] !== 'D') continue;
      const O = [0, 0], A = CORN[i], B = CORN[(i + 1) % 6];
      const seg = (P, Q, cx, cy) => { const k = 0.035; ctx.moveTo(P[0] + (cx - P[0]) * k, P[1] + (cy - P[1]) * k); ctx.lineTo(Q[0] + (cx - Q[0]) * k, Q[1] + (cy - Q[1]) * k); };
      const c = wpt(i, 0.33, 0.33);
      if (a.w[(i + 5) % 6] !== 'D') seg(O, A, c[0], c[1]);
      if (a.w[(i + 1) % 6] !== 'D') seg(O, B, c[0], c[1]);
      if (!a.nb[i]) seg(A, B, c[0], c[1]);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (!a.intake) return;
  for (let j = 0; j < 6; j++) { // one intake for each sea wedge a data centre draws on, as the rules count them
    const it = a.intake[j]; if (!it) continue;
    if (it.T >= 5) for (const q of podSpots(j, it.side).slice(0, it.T >= 6 ? 2 : 1)) { // server pods, sunk in the sea
      ctx.fillStyle = 'rgba(26,34,56,.5)'; capsule(ctx, q[0], q[1], 0.15, 0.05); ctx.fill();
    }
    const [A, B] = intakePipe(j, it.side);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#2B3142'; ctx.lineWidth = 0.032; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    ctx.strokeStyle = '#5C6680'; ctx.lineWidth = 0.01; ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#2B3142'; ctx.fillRect(B[0] - 0.03, B[1] - 0.03, 0.06, 0.06);
    ctx.strokeStyle = 'rgba(240,252,255,.75)'; ctx.lineWidth = 0.016; // foam where the water is drawn in
    ctx.beginPath(); ctx.arc(B[0], B[1], 0.065, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(B[0], B[1], 0.065, Math.PI * 0.1, Math.PI * 0.6); ctx.stroke();
  }
}
function drawDCGroundNight(ctx, a, env) {
  if (a.intake) for (let j = 0; j < 6; j++) {
    const it = a.intake[j]; if (!it) continue;
    const B = intakePipe(j, it.side)[1];
    ctx.globalAlpha = 0.85; ctx.fillStyle = LED_NIGHT; ctx.beginPath(); ctx.arc(B[0], B[1], 0.014, 0, 7); ctx.fill();
    if (it.T >= 5) podSpots(j, it.side).slice(0, it.T >= 6 ? 2 : 1).forEach((q, k) => {
      const g = ctx.createRadialGradient(q[0], q[1], 0.01, q[0], q[1], 0.13); // light through the water
      g.addColorStop(0, 'rgba(127,230,218,.34)'); g.addColorStop(1, 'rgba(127,230,218,0)');
      ctx.globalAlpha = 0.75 + (env.motion ? 0.25 * Math.sin(env.t * 1.2 + k * 2 + j) : 0); ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.13, 0.08, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = LED_NIGHT; ctx.lineWidth = 0.008; capsule(ctx, q[0], q[1], 0.15, 0.05); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
  if (!a.roofAt) return;
  for (let i = 0; i < 6; i++) { // heat rising off a wedge that is running hot and will fall to meadow
    if (a.w[i] !== 'D' || !(a.d[i] > 0) || !a.roofAt[i]) continue;
    const [x, y] = a.roofAt[i], d = a.d[i], tt = env.motion ? env.t : 0;
    ctx.strokeStyle = `rgba(255,112,84,${Math.min(0.95, 0.45 + d * 0.18)})`; ctx.lineWidth = 0.022; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const x0 = x + (k - 1) * 0.07, ph = tt * 5 + k * 2.1 + a.sid;
      ctx.beginPath();
      for (let s = 0; s <= 6; s++) { const yy = y - 0.02 - s * 0.03, xx = x0 + Math.sin(ph + s * 1.25) * 0.016; s ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
}

const Art = { TIERS, SHARE, tierIndex, variedTiers, planTile, drawBuilding, drawTownGround,
  DC_TIERS, dcTierIndex, dcVariedTiers, planDC, drawDC, drawDCGround, drawDCGroundNight };
root.Art = Art;
})(typeof window !== 'undefined' ? window : this);
