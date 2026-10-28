/* Numogarden town art: buildings that grow with a town through eight tiers, from SVL's art lab (approved 2026-10-28).
   Ported from the lab's "Proposed" code (specs/art-lab.html, private). Renderer only: nothing here touches the rules.
   planTile() lists a town tile's buildings in local units (one hex radius = 1), drawBuilding() draws one of them,
   and variedTiers() hands a big town's tallest art to the tiles at its heart. The page caches the plans and draws
   every visible building as one list, back to front. */
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

const Art = { TIERS, SHARE, tierIndex, variedTiers, planTile, drawBuilding, drawTownGround };
root.Art = Art;
})(typeof window !== 'undefined' ? window : this);
