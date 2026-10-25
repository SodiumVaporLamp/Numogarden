/* Numogarden simulation core.
   Pure and deterministic given a seed: no DOM, no clock. Runs in Node (harness) and in the page.
   A tile is six wedges; wedge i faces edge i and touches wedge (i+3)%6 of the neighbour in DIRS[i].
   Time advances one step per placement. */
(function (root) {
'use strict';

const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]; // flat-top axial, edge i at 30+60i degrees
const BASE = ['H', 'F', 'J', 'S']; // Hamlet (compute), Field (corpus), Jungle (the Outside), Sea (Lemurian)
const LAND = ['H', 'F', 'J', 'S', 'D']; // terrains that form clusters; D (data centre) only arrives at night
const XW = ['X', 'X', 'X', 'X', 'X', 'X'];

const CFG = {
  WEIGHTS: { H: 0.26, F: 0.26, J: 0.28, S: 0.20 },
  NIGHT_WEIGHTS: { H: 0.26, D: 0.26, J: 0.28, S: 0.20 }, // at night the corpus is spent: data centres take the fields' place
  DC_AFTER_WAKE: true,  // ... but only once a town has built itself since nightfall
  COOL_K: 6,            // data-centre wedges one sea contact can cool
  CRIT: 24,             // hamlet wedges for a town to start building itself (critical mass)
  MATURE: 40,           // steps a place must have been a town before it can wake up
  FLUSH: 2,             // supply multiple at which a town wakes below critical mass (0 = off)
  STARVE_MIN: 4,        // hamlets smaller than this get by on their own
  FALLOW_J: 6,          // fields go fallow only beside a jungle at least this big
  SUPPLY_K: 3,          // hamlet wedges one field/sea contact can feed
  DECAY_T: 3,           // hungry steps before a wedge falls to meadow
  MEADOW_TO_JUNGLE: 0.35,
  JCRIT: 12,            // a jungle this big creeps into neglected land
  JUNGLE_INTO_DECAY: 0.3,
  SPRAWL_BASE: 0.35, SPRAWL_SLOPE: 0.02, SPRAWL_MAX: 0.85, TRY_EVERY: 20, // one more build try per TRY_EVERY wedges above CRIT
  CITY: 24,             // a hamlet cluster this big is a city, and cities reinforce themselves:
  CITY_BITE: 0.1,       //   a big jungle takes a decaying city wedge with this chance (full speed in a Sink area,
                        //   from a deep jungle, or when the city has under half the supply it needs),
  CITY_SLOPE: 0.04, CITY_TRY_EVERY: 10, // and building climbs with size twice as fast
  GROK_T: 60,           // a fed town that stays within one wedge of one size this long groks: it jumps a tier
  GROK_MIN: 18,         // and only a town this big, three quarters of the way to CRIT (smaller ones are mostly careless play)
  TRADE_BONUS: 0.15, HOME_BONUS: 0.10,
  METRO_EVERY: 10,
  CURRENT_FX: true,     // currents act on the land (false = measure where they would be, for the harness baseline)
  CURRENT_LINGER: 3,    // steps a current keeps flowing after its syzygy breaks
  SURGE_BONUS: 0.25,    // Surge: extra self-building chance,
  SURGE_MATURE: 0.5,    //   and towns wake after this share of MATURE
  WARP_TRIES: 2,        // Warp: building tries per step are multiplied by this
  PLEX_EVERY: 5, PLEX_CAP: 0.08, // Plex: one wedge turns wild every 5 steps while wild land is under 8%
  RUMOR_LIFE: 15, RUMOR_NEED: 3,
  HAND_MAX: 4, LEMUR_MAX: 10, METER_MAX: 15,
  TIERS: { H: [1, 6, 12, 24, 40], S: [1, 10, 20, 35], J: [1, 12, 30], F: [1, 10, 25], D: [1] },
  LEVELS: [0, 45, 130, 280, 520]
};

/* The Pandemonium Matrix demon names and zone pairs, as encoded in SVL's Numogram Lab (DEMON_TABLE).
   Index = mesh number a(a-1)/2 + b. */
const DEMONS = [[1,0,'Lurgo'],[2,0,'Duoddod'],[2,1,'Doogu'],[3,0,'Ixix'],[3,1,'Ixigool'],[3,2,'Ixidod'],[4,0,'Krako'],[4,1,'Sukugool'],[4,2,'Skoodu'],[4,3,'Skarkix'],[5,0,'Tokhatto'],[5,1,'Tukkamu'],[5,2,'Kuttadid'],[5,3,'Tikkitix'],[5,4,'Katak'],[6,0,'Tchu'],[6,1,'Djungo'],[6,2,'Djuddha'],[6,3,'Djynxx'],[6,4,'Tchakki'],[6,5,'Tchattuk'],[7,0,'Puppo'],[7,1,'Bubbamu'],[7,2,'Oddubb'],[7,3,'Pabbakis'],[7,4,'Ababbatok'],[7,5,'Papatakoo'],[7,6,'Bobobja'],[8,0,'Minommo'],[8,1,'Murrumur'],[8,2,'Nammamad'],[8,3,'Mummumix'],[8,4,'Numko'],[8,5,'Muntuk'],[8,6,'Mommoljo'],[8,7,'Mombbo'],[9,0,'Uttunul'],[9,1,'Tutagool'],[9,2,'Unnunddo'],[9,3,'Ununuttix'],[9,4,'Ununak'],[9,5,'Tukutu'],[9,6,'Unnutchi'],[9,7,'Nuttubab'],[9,8,'Ummnu']];
const CURRENTS = { 9: 'Plex', 7: 'Surge', 5: 'Hold', 3: 'Warp', 1: 'Sink' }; // keyed by syzygy difference
const TCSET = [1, 2, 4, 5, 7, 8];

function key(q, r) { return q + ',' + r; }
function dr(n) { n = Math.abs(Math.round(n)); return n === 0 ? 0 : 1 + (n - 1) % 9; }
/* AQ as in the Numogram Lab: A=10..Z=35, digits at face value */
function aqOf(s) {
  let t = 0;
  for (const ch of String(s).toLowerCase()) {
    if (ch >= 'a' && ch <= 'z') t += ch.charCodeAt(0) - 87;
    else if (ch >= '0' && ch <= '9') t += ch.charCodeAt(0) - 48;
  }
  return t;
}
function region(z) { return (z === 3 || z === 6) ? 'warp' : ((z === 9 || z === 0) ? 'plex' : 'tc'); }
function mesh(a, b) { if (a < b) { const t = a; a = b; b = t; } return a * (a - 1) / 2 + b; }
function demonClass(a, b) {
  const x = TCSET.includes(a), y = TCSET.includes(b);
  return x && y ? 'chrono' : (!x && !y ? 'xeno' : 'amphi');
}

/* mulberry32 kept in a plain object so the whole state serializes */
function rnd(st) {
  let a = st.s = (st.s + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rint(st, n) { return Math.floor(rnd(st) * n); }
function pickIdx(st, wts) {
  let s = 0; for (const w of wts) s += w;
  let x = rnd(st) * s;
  for (let i = 0; i < wts.length; i++) { x -= wts[i]; if (x < 0) return i; }
  return wts.length - 1;
}

function rot(w, k) { const o = new Array(6); for (let i = 0; i < 6; i++) o[(i + k) % 6] = w[i]; return o; }
function tileZone(t) { return t.kind === 'x' ? 0 : dr(aqOf(t.w.join(''))); }
function matches(a, b) {
  if (a === b || a === 'X' || b === 'X') return true;
  if (a === 'M') return b === 'F' || b === 'J';
  if (b === 'M') return a === 'F' || a === 'J';
  return false;
}

/* the deck: day weights until night (weirdness 4), then the night weights */
function deckOf(state) { return state.dcSince != null ? CFG.NIGHT_WEIGHTS : CFG.WEIGHTS; }
/* the fields are spent once it is night and a town has built itself since nightfall
   (a world that never woke, or went quiet, keeps its fields until a town builds again) */
function nightDeck(state, ev) {
  if (state.dcSince != null || state.level < 4) return;
  if (state.nightAt == null) state.nightAt = state.turn;
  if (CFG.DC_AFTER_WAKE && !(state.stats.lastSelfBuild >= state.nightAt)) return;
  state.dcSince = state.turn;
  pushEvent(state, ev, 'dc', 'The fields are spent. Data centres start to arrive.');
}
function genTile(st, W) {
  W = W || CFG.WEIGHTS;
  const types = Object.keys(W), wts = types.map(t => W[t]);
  const r = rnd(st);
  const k = r < 0.18 ? 1 : (r < 0.68 ? 2 : 3);
  let lens;
  if (k === 1) lens = [6];
  else if (k === 2) { const a = 1 + rint(st, 5); lens = [a, 6 - a]; }
  else {
    const c1 = 1 + rint(st, 5); let c2 = 1 + rint(st, 5); let g = 0;
    while (c2 === c1 && g++ < 20) c2 = 1 + rint(st, 5);
    if (c2 === c1) c2 = c1 === 5 ? 1 : c1 + 1;
    const a = Math.min(c1, c2), b = Math.max(c1, c2);
    lens = [a, b - a, 6 - b];
  }
  const segs = [];
  for (let s = 0; s < k; s++) {
    let t, g = 0;
    do { t = types[pickIdx(st, wts)]; } while (segs.includes(t) && g++ < 40);
    if (segs.includes(t)) t = types.find(x => !segs.includes(x));
    segs.push(t);
  }
  const w = new Array(6); let pos = rint(st, 6);
  for (let s = 0; s < k; s++) for (let n = 0; n < lens[s]; n++) { w[pos % 6] = segs[s]; pos++; }
  return w;
}

const NAME_A = ['Mum', 'Pud', 'Bram', 'Lem', 'Tok', 'Nib', 'Wib', 'Kit', 'Dod', 'Ux', 'Plex', 'Mur', 'Tik', 'Odd', 'Bub', 'Skoo', 'Jyn', 'Kat', 'Ixi', 'Num', 'Pip', 'Hum', 'Gib', 'Tut'];
const NAME_B = ['', '', '', 'ble', 'ka', 'ri', 'lo', 'dub', 'mu', 'ti', 'x', 'pa', 'nu'];
const NAME_C = ['wick', 'ton', 'by', 'ham', 'mere', 'ford', 'stead', 'burrow', 'hollow', 'nul', 'dod', 'mix', 'gool', 'tak', 'well', 'cot'];
function genName(st) {
  const s = NAME_A[rint(st, NAME_A.length)] + NAME_B[rint(st, NAME_B.length)] + NAME_C[rint(st, NAME_C.length)];
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function newGame(seed) {
  const state = {
    v: 1, seed: seed >>> 0, rng: { s: (seed >>> 0) || 1 }, turn: 0, stars: 0, meter: 0, streak: 0, level: 0,
    map: {}, nextId: 1, nextTag: 1, offers: [], hand: [], choices: 0,
    pending: [], spawns: [], builders: 0, ferries: 0, currents: [],
    groups: {}, lemurs: [], events: [],
    stats: { sprawl: 0, spawn: 0, reclaim: 0, decline: 0, firstSelfBuild: null, selfBuildAfter50: 0, reclaimAfter50: 0,
             perfect: 0, snug: 0, rumorsReal: 0, rumorsFaded: 0, syzygies: 0, lemurs: 0, wild: 0, groks: 0 }
  };
  addTile(state, 0, 0, ['H', 'H', 'F', 'F', 'S', 'J'], 'n');
  for (let i = 0; i < 3; i++) state.offers.push(genTile(state.rng));
  return state;
}

function addTile(state, q, r, w, kind, extra) {
  const t = { id: state.nextId++, q, r, w: w.slice(), d: [0, 0, 0, 0, 0, 0], tg: [0, 0, 0, 0, 0, 0], kind, born: state.turn };
  if (extra) Object.assign(t, extra);
  t.z = tileZone(t);
  state.map[key(q, r)] = t;
  return t;
}

function evalPlacement(state, w, q, r) {
  let m = 0, n = 0; const edges = [];
  for (let i = 0; i < 6; i++) {
    const nb = state.map[key(q + DIRS[i][0], r + DIRS[i][1])];
    if (!nb) { edges.push(0); continue; }
    n++;
    const ok = matches(w[i], nb.w[(i + 3) % 6]);
    if (ok) m++;
    edges.push(ok ? 1 : -1);
  }
  return { m, n, edges };
}

function hasNeighbour(state, q, r) {
  for (const d of DIRS) if (state.map[key(q + d[0], r + d[1])]) return true;
  return false;
}
function frontier(state) {
  const seen = {}, out = [];
  for (const k in state.map) {
    const t = state.map[k];
    for (const d of DIRS) {
      const q = t.q + d[0], r = t.r + d[1], kk = key(q, r);
      if (!state.map[kk] && !seen[kk]) { seen[kk] = 1; out.push([q, r]); }
    }
  }
  return out;
}
function hexDist(aq, ar, bq, br) { const dq = aq - bq, drr = ar - br; return (Math.abs(dq) + Math.abs(drr) + Math.abs(dq + drr)) / 2; }
function ferryCells(state, range) {
  range = range || 3;
  const seen = {}, out = [];
  for (const k in state.map) {
    const t = state.map[k];
    for (let dq = -range; dq <= range; dq++) for (let drr = -range; drr <= range; drr++) {
      if (hexDist(0, 0, dq, drr) > range) continue;
      const q = t.q + dq, r = t.r + drr, kk = key(q, r);
      if (!state.map[kk] && !seen[kk]) { seen[kk] = 1; out.push([q, r]); }
    }
  }
  return out;
}

function slotTiles(state) {
  const out = state.offers.map((w, i) => ({ from: 'offer', i, kind: 'n', w }));
  state.hand.forEach((h, i) => out.push({ from: 'hand', i, kind: h.kind, w: h.kind === 'x' ? XW : h.w }));
  return out;
}

function pushEvent(state, ev, kind, txt, extra) {
  const e = Object.assign({ turn: state.turn, kind, txt }, extra || {});
  ev.push(e);
  state.events.push(e);
  if (state.events.length > 80) state.events.splice(0, state.events.length - 80);
}

function spawnLemur(state, d, k, ev, why) {
  if (state.level < 1) return;
  const [a, b, name] = DEMONS[d];
  state.lemurs.push({ d, k, born: state.turn, s: rint(state.rng, 1e9) });
  if (state.lemurs.length > CFG.LEMUR_MAX) state.lemurs.shift();
  state.stats.lemurs++;
  const pair = a + '::' + b;
  const msg = why === 'syzygy' ? `${name} (${pair}) slips through a syzygy to look around.`
    : why === 'rumor' ? `${name} (${pair}) moved into the rumor that came true.`
    : why === 'jungle' ? `${name} (${pair}) has been living in the deep jungle all along.`
    : `${name} (${pair}) wanders in, curious.`;
  pushEvent(state, ev, 'lemur', msg, { d });
}

function grant(state, item, ev) {
  if (state.hand.length >= CFG.HAND_MAX) { state.stars += 5; pushEvent(state, ev, 'reward', 'Hand full, so the bonus turns into +5★.'); return; }
  state.hand.push(item);
}
function choose(state, which) {
  if (state.choices <= 0) return false;
  state.choices--;
  const ev = [];
  grant(state, which === 'r' ? { kind: 'r', w: genTile(state.rng, deckOf(state)) } : { kind: 'x' }, ev);
  return ev;
}

function place(state, slotRef, q, r, k, opts) {
  opts = opts || {};
  const kk = key(q, r);
  if (state.map[kk]) return { ok: false, why: 'occupied' };
  if (opts.ferry) {
    if (state.ferries <= 0) return { ok: false, why: 'no ferry' };
    let near = false;
    for (const t of Object.values(state.map)) if (hexDist(t.q, t.r, q, r) <= 3) { near = true; break; }
    if (!near) return { ok: false, why: 'too far' };
  } else if (!hasNeighbour(state, q, r)) return { ok: false, why: 'not adjacent' };
  let kind, w;
  if (slotRef.from === 'offer') { w = state.offers[slotRef.i]; kind = 'n'; }
  else { const h = state.hand[slotRef.i]; if (!h) return { ok: false, why: 'no slot' }; kind = h.kind; w = kind === 'x' ? XW : h.w; }
  if (!w) return { ok: false, why: 'no slot' };
  w = rot(w, k || 0);
  const ev = evalPlacement(state, w, q, r);
  const out = { ok: true, m: ev.m, n: ev.n, gain: 0, events: [] };
  const t = addTile(state, q, r, w, kind);
  if (slotRef.from === 'offer') state.offers[slotRef.i] = genTile(state.rng, deckOf(state));
  else state.hand.splice(slotRef.i, 1);
  if (opts.ferry) state.ferries--;
  if (kind !== 'r') scorePlacement(state, t, ev, out);
  step(state, out.events);
  return out;
}

function scorePlacement(state, t, ev, out) {
  let gain = ev.m;
  const E = out.events;
  // a fit is clean when every edge it touches agrees; tighter spots are worth more
  const clean = ev.n >= 2 && ev.m === ev.n;
  out.fit = clean ? (ev.n >= 4 ? 'perfect' : ev.n >= 3 ? 'snug' : 'clean') : (ev.m === 0 ? 'none' : 'partial');
  if (clean) {
    state.streak++;
    if (ev.n >= 3) { gain += 1; state.stats.snug++; }
    gain += Math.min(state.streak - 1, 4);
    state.meter += ev.n >= 3 ? 2 : 1;
    if (ev.n >= 4) {
      gain += 2 * ev.n;
      state.stats.perfect++;
      grant(state, { kind: 'x' }, E);
      pushEvent(state, E, 'reward', ev.n === 6 ? 'Flawless: all six edges agree. A Plex tile appears in your hand.' : `Perfect fit: all ${ev.n} edges agree. A Plex tile appears in your hand.`);
    }
    while (state.meter >= CFG.METER_MAX) { state.meter -= CFG.METER_MAX; state.choices++; }
  } else state.streak = 0;
  // syzygies: zones summing to nine across a shared edge
  const nbz = [];
  let syz = null;
  for (let i = 0; i < 6; i++) {
    const nb = state.map[key(t.q + DIRS[i][0], t.r + DIRS[i][1])];
    if (!nb || nb.kind === 'r') continue;
    nbz.push(nb.z);
    if (!syz && t.z + nb.z === 9) syz = [t.z, nb.z];
  }
  if (syz && state.level >= 1) {
    gain += 3;
    state.stats.syzygies++;
    const d = mesh(syz[0], syz[1]);
    if (!state.lemurs.some(l => l.d === d)) spawnLemur(state, d, key(t.q, t.r), E, 'syzygy');
    else pushEvent(state, E, 'current', `A ${CURRENTS[Math.abs(syz[0] - syz[1])] || 'Plex'} current hums between zones ${syz[0]} and ${syz[1]} (+3★).`, { quiet: true });
  } else if (out.fit === 'perfect' && state.level >= 1) {
    const others = nbz.filter(z => z !== t.z);
    const z2 = others.length ? others[rint(state.rng, others.length)] : (t.z + 1 + rint(state.rng, 8)) % 10;
    if (z2 !== t.z) spawnLemur(state, mesh(t.z, z2), key(t.q, t.r), E, 'perfect');
  }
  state.stars += gain;
  out.gain = gain;
}

function clearTile(state, q, r) {
  const k = key(q, r);
  if (state.builders <= 0 || !state.map[k] || Object.keys(state.map).length <= 1) return false;
  delete state.map[k];
  state.builders--;
  return true;
}

/* ---------- the living part ---------- */

function step(state, ev) {
  state.turn++;
  commitPending(state, ev);
  const C = clusters(state);
  tagAndTier(state, C, ev);
  updateCurrents(state);
  rules(state, C, ev);
  rumors(state, ev);
  levelUp(state, ev);
  nightDeck(state, ev);
}

function commitPending(state, ev) {
  const byId = {};
  for (const k in state.map) byId[state.map[k].id] = state.map[k];
  const P = state.pending; state.pending = [];
  const late = state.turn > 50;
  for (const p of P) {
    const t = byId[p.id];
    if (!t || t.kind === 'r' || t.w[p.i] !== p.from) continue;
    t.w[p.i] = p.to; t.d[p.i] = 0; t.tg[p.i] = 0; t.z = tileZone(t);
    if (p.cause === 'sprawl') {
      state.stats.sprawl++;
      if (state.stats.firstSelfBuild == null) state.stats.firstSelfBuild = state.turn;
      state.stats.lastSelfBuild = state.turn;
      if (late) state.stats.selfBuildAfter50++;
    } else if (p.cause === 'reclaim') {
      state.stats.reclaim++;
      if (late) state.stats.reclaimAfter50++;
    } else if (p.cause === 'plex') state.stats.wild = (state.stats.wild || 0) + 1;
    else {
      state.stats.decline++;
      if (p.cause === 'overheat') state.stats.overheat = (state.stats.overheat || 0) + 1;
    }
  }
  for (const s of state.spawns) {
    if (state.map[s.k]) continue;
    addTile(state, s.q, s.r, s.w, 'n', { auto: true });
    state.stats.spawn++;
    if (state.stats.firstSelfBuild == null) state.stats.firstSelfBuild = state.turn;
    state.stats.lastSelfBuild = state.turn;
    if (late) state.stats.selfBuildAfter50++;
    const G = state.groups[s.tag];
    pushEvent(state, ev, 'spawn', `${G && G.name ? G.name : 'A metropolis'} laid a tile all by itself.`, { k: s.k });
  }
  state.spawns = [];
}

function clusters(state) {
  const tiles = [], idx = {};
  for (const k in state.map) { const t = state.map[k]; if (t.kind === 'r') continue; idx[k] = tiles.length; tiles.push(t); }
  const n = tiles.length;
  const nb = new Int32Array(n * 6).fill(-1);
  for (let a = 0; a < n; a++) {
    const t = tiles[a];
    for (let i = 0; i < 6; i++) { const b = idx[key(t.q + DIRS[i][0], t.r + DIRS[i][1])]; if (b !== undefined) nb[a * 6 + i] = b; }
  }
  const C = { tiles, idx, nb, byType: {} };
  const par = new Int32Array(n * 6);
  for (const T of LAND) {
    par.fill(-1);
    for (let a = 0; a < n; a++) for (let i = 0; i < 6; i++) { const c = tiles[a].w[i]; if (c === T || c === 'X') par[a * 6 + i] = a * 6 + i; }
    const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const uni = (x, y) => { x = find(x); y = find(y); if (x !== y) { if (x < y) par[y] = x; else par[x] = y; } };
    for (let a = 0; a < n; a++) for (let i = 0; i < 6; i++) {
      const x = a * 6 + i;
      if (par[x] < 0) continue;
      const j = a * 6 + (i + 1) % 6; if (par[j] >= 0) uni(x, j);
      const b = nb[x]; if (b >= 0) { const o = b * 6 + (i + 3) % 6; if (par[o] >= 0) uni(x, o); }
    }
    const groups = new Map();
    for (let x = 0; x < n * 6; x++) {
      if (par[x] < 0) continue;
      if (tiles[(x / 6) | 0].w[x % 6] !== T) continue;
      const r = find(x);
      let g = groups.get(r); if (!g) { g = { T, w: [] }; groups.set(r, g); }
      g.w.push(x);
    }
    const list = [...groups.values()];
    const cid = new Int32Array(n * 6).fill(-1);
    list.forEach((g, gi) => { g.size = g.w.length; g.gi = gi; for (const x of g.w) cid[x] = gi; });
    C.byType[T] = { list, cid };
  }
  return C;
}
function adjW(C, x) {
  const a = (x / 6) | 0, i = x % 6;
  const out = [a * 6 + (i + 1) % 6, a * 6 + (i + 5) % 6];
  const b = C.nb[x]; if (b >= 0) out.push(b * 6 + (i + 3) % 6);
  return out;
}
function wt(C, x) { return C.tiles[(x / 6) | 0].w[x % 6]; }
function getD(C, x) { return C.tiles[(x / 6) | 0].d[x % 6]; }
function setD(C, x, v) { C.tiles[(x / 6) | 0].d[x % 6] = v; }

/* supply a town needs: linear in size, which is what stops one city eating the map
   (a sub-linear version let a seaside city reach 75% of the map in every run) */
function needFor(size) { return Math.ceil(size / CFG.SUPPLY_K); }
function tierOf(T, size) { const TT = CFG.TIERS[T]; let k = -1; for (let i = 0; i < TT.length; i++) if (size >= TT[i]) k = i; return k; }

function tagAndTier(state, C, ev) {
  const turn = state.turn;
  for (const T of LAND) {
    for (const g of C.byType[T].list) {
      let best = 0, bestTier = -99, bestNamed = false;
      const seen = [];
      for (const x of g.w) {
        const tg = C.tiles[(x / 6) | 0].tg[x % 6];
        if (!tg || seen.includes(tg)) continue;
        seen.push(tg);
        const G = state.groups[tg];
        if (!G || G.T !== T) continue;
        const named = !!G.name;
        if (named > bestNamed || (named === bestNamed && (G.tier > bestTier || (G.tier === bestTier && tg < best)))) { best = tg; bestTier = G.tier; bestNamed = named; }
      }
      if (!best || !state.groups[best]) { best = state.nextTag++; state.groups[best] = { T, tier: -1, born: turn }; }
      const G = state.groups[best];
      for (const x of g.w) C.tiles[(x / 6) | 0].tg[x % 6] = best;
      // absorbed groups
      for (const tg of seen) {
        if (tg === best) continue;
        const O = state.groups[tg];
        if (O && O.T === T) {
          if (T === 'H' && O.name && G.name) pushEvent(state, ev, 'merge', `${O.name} and ${G.name} grew into one place. It keeps the name ${G.name}.`);
          G.tier = Math.max(G.tier, O.tier);
          delete state.groups[tg];
        }
      }
      g.tag = best; G.size = g.size; G.seen = turn;
      const tier = tierOf(T, g.size);
      if (tier > G.tier) { for (let k = Math.max(0, G.tier + 1); k <= tier; k++) onTier(state, G, k, g, C, ev); G.tier = tier; }
    }
  }
  for (const tg in state.groups) {
    const G = state.groups[tg];
    if (G.seen !== turn) {
      if (G.T === 'H' && G.name) pushEvent(state, ev, 'lost', `The Outside took ${G.name} back. Only meadow remains.`);
      delete state.groups[tg];
    }
  }
}

function onTier(state, G, k, g, C, ev) {
  if (k === 0) return;
  if (G.T === 'H') {
    if (k === 1) {
      let oldest = g.w[0];
      for (const x of g.w) if (C.tiles[(x / 6) | 0].id < C.tiles[(oldest / 6) | 0].id) oldest = x;
      const home = C.tiles[(oldest / 6) | 0];
      G.name = genName(state.rng);
      G.aq = aqOf(G.name); G.zone = dr(G.aq); G.homeZone = home.z; G.homed = G.zone === home.z;
      pushEvent(state, ev, 'village', state.level >= 2 ? `A village named itself ${G.name}. AQ ${G.aq} → zone ${G.zone}.` : `A village named itself ${G.name}.`);
      if (G.homed && state.level >= 2) pushEvent(state, ev, 'homed', `${G.name}'s name comes home: it plexes to zone ${G.zone}, the zone it was founded on. It will grow faster.`);
    } else if (k === 2) {
      G.townSince = state.turn;
      state.builders++;
      pushEvent(state, ev, 'town', `${G.name || 'A village'} is a town now. (+1 builder)`);
    } else if (k === 3) {
      state.builders++;
      pushEvent(state, ev, 'city', `${G.name || 'A town'} reached critical mass. It is a city, and it will start building itself. (+1 builder)`);
    } else if (k === 4) {
      state.builders += 2;
      pushEvent(state, ev, 'metro', `${G.name || 'A metropolis'} is a metropolis. It has started laying its own tiles. (+2 builders)`);
    }
  } else if (G.T === 'S') {
    const add = k === 3 ? 2 : 1;
    state.ferries += add;
    const txt = k === 1 ? 'A lake has formed. A ferry is ready (+1).' : k === 2 ? 'The lake became a sea. Boats everywhere (+1 ferry).' : 'The Lemurian sea surfaces (+2 ferries).';
    pushEvent(state, ev, 'sea', txt);
  } else if (G.T === 'J') {
    if (k === 1) pushEvent(state, ev, 'jungle', 'The Outside thickens. Untended land next to it is at risk now.');
    if (k === 2) {
      pushEvent(state, ev, 'jungle', 'Deep jungle. Something lives in there.');
      const x = g.w[rint(state.rng, g.w.length)]; const t = C.tiles[(x / 6) | 0];
      spawnLemur(state, rint(state.rng, DEMONS.length), key(t.q, t.r), ev, 'jungle');
    }
  } else if (G.T === 'F') {
    const bonus = k === 1 ? 5 : 10;
    state.stars += bonus;
    pushEvent(state, ev, 'harvest', `A big harvest. The corpus grows (+${bonus}★).`);
  }
}

function mostExposed(C, ws, T, st) {
  let best = [], bestScore = -1;
  for (const x of ws) {
    const d = getD(C, x);
    let e = C.nb[x] < 0 ? 1 : 0;
    for (const y of adjW(C, x)) if (wt(C, y) !== T) e++;
    const score = d * 10 + e; // keep chewing on the wedge already decaying
    if (score > bestScore) { bestScore = score; best = [x]; } else if (score === bestScore) best.push(x);
  }
  return best[rint(st, best.length)];
}

function rules(state, C, ev) {
  const H = C.byType.H, F = C.byType.F, J = C.byType.J, S = C.byType.S;
  const st = state.rng, P = state.pending;
  const pend = new Set();
  const fx = currentFx(state);
  const tid = x => C.tiles[(x / 6) | 0].id;
  const held = x => fx.hold.has(tid(x));
  const tick = x => fx.warp.has(tid(x)) ? 2 : 1; // Warp: decay runs twice as fast
  const sunk = x => fx.sunk.has(tid(x));          // Sink: cities lose their protection
  const addP = (x, to, cause) => {
    const t = C.tiles[(x / 6) | 0], i = x % 6, k = t.id + ':' + i;
    if (pend.has(k) || t.w[i] === to || t.w[i] === 'X' || fx.hold.has(t.id)) return false;
    pend.add(k); P.push({ id: t.id, i, from: t.w[i], to, cause }); return true;
  };

  // hamlets: supply from adjacent fields and sea; shared seas mean trade
  const seaTowns = new Map();
  for (const g of H.list) {
    const sup = new Set();
    for (const x of g.w) for (const y of adjW(C, x)) {
      const c = wt(C, y);
      if (c === 'F' || c === 'S') {
        sup.add(y);
        if (c === 'S') { const sg = S.cid[y]; if (sg >= 0) { if (!seaTowns.has(sg)) seaTowns.set(sg, new Set()); seaTowns.get(sg).add(g.gi); } }
      }
    }
    g.supply = sup.size; g.need = needFor(g.size);
  }
  for (const hs of seaTowns.values()) if (hs.size >= 2) for (const gi of hs) H.list[gi].trade = true;
  // a city holds its ground against the jungle unless it is starving badly
  for (const g of H.list) g.shield = g.size >= CFG.CITY && 2 * g.supply >= g.need;

  for (const g of H.list) {
    if (g.supply >= g.need) { g.fed = true; for (const x of g.w) setD(C, x, 0); continue; }
    g.fed = false;
    if (g.size < CFG.STARVE_MIN) continue;
    const free = fx.hold.size ? g.w.filter(x => !held(x)) : g.w; // Hold: no decay in its area
    if (free.length) {
      const x = mostExposed(C, free, 'H', st);
      const d = getD(C, x) + tick(x); setD(C, x, d);
      if (d >= CFG.DECAY_T) addP(x, 'M', 'starve');
    }
    const G = state.groups[g.tag];
    if (G && G.name && G.tier >= 2 && (G.warned == null || state.turn - G.warned > 25)) {
      G.warned = state.turn;
      pushEvent(state, ev, 'hungry', `${G.name} is hungry. It needs fields or sea next to it.`);
    }
  }

  // data centres: cooled by sea, one contact per COOL_K wedges; a hot cluster sheds its most exposed wedge to meadow
  for (const g of C.byType.D.list) {
    const sea = new Set();
    for (const x of g.w) for (const y of adjW(C, x)) if (wt(C, y) === 'S') sea.add(y);
    g.cool = sea.size; g.coolNeed = Math.ceil(g.size / CFG.COOL_K);
    state.stats.dcSteps = (state.stats.dcSteps || 0) + 1;
    if (g.cool >= g.coolNeed) { g.cooled = true; state.stats.dcCooled = (state.stats.dcCooled || 0) + 1; for (const x of g.w) setD(C, x, 0); continue; }
    g.cooled = false;
    const free = fx.hold.size ? g.w.filter(x => !held(x)) : g.w;
    if (!free.length) continue;
    const x = mostExposed(C, free, 'D', st);
    const d = getD(C, x) + tick(x); setD(C, x, d);
    if (d >= CFG.DECAY_T) addP(x, 'M', 'overheat');
  }

  // grokking: a fed place that has stayed the same size for a long time jumps a tier.
  // At city tier a town of 12+ wakes up under the usual rule, so a settled world starts moving again.
  for (const g of H.list) {
    const G = state.groups[g.tag];
    if (!G || !G.name) continue;
    if (G.flat == null || Math.abs(g.size - G.flat) > 1 || G.flatTier !== G.tier || !g.fed) {
      G.flat = g.size; G.flatSince = state.turn; G.flatTier = G.tier; continue;
    }
    if (G.tier < 1 || G.tier >= 3 || g.size < CFG.GROK_MIN || state.turn - G.flatSince < CFG.GROK_T) continue;
    G.tier++; state.builders++; state.stats.groks = (state.stats.groks || 0) + 1;
    if (G.tier === 2) G.townSince = state.turn;
    G.flat = g.size; G.flatSince = state.turn; G.flatTier = G.tier;
    pushEvent(state, ev, 'grok', `${G.name} has been the same size for so long that something clicked. It groks: it counts as a ${G.tier === 2 ? 'town' : 'city'} now. (+1 builder)`);
  }

  // fields: worked if a hamlet touches them; untended fields next to jungle go fallow
  for (const g of F.list) {
    let worked = false; const nearJ = [];
    for (const x of g.w) for (const y of adjW(C, x)) {
      const c = wt(C, y);
      if (c === 'H') worked = true;
      else if (c === 'J') { const jg = J.cid[y]; if (jg >= 0 && J.list[jg].size >= CFG.FALLOW_J) nearJ.push(x); }
    }
    if (worked) { for (const x of g.w) setD(C, x, 0); continue; }
    const cand = fx.hold.size ? nearJ.filter(x => !held(x)) : nearJ;
    if (!cand.length) continue;
    let x = cand[0];
    for (const y of cand) if (getD(C, y) > getD(C, x)) x = y;
    if (getD(C, x) === 0) x = cand[rint(st, cand.length)];
    const d = getD(C, x) + tick(x); setD(C, x, d);
    if (d >= CFG.DECAY_T) addP(x, 'M', 'fallow');
  }

  // Sink: each current wears down one hamlet or field wedge in its area, the most worn first
  for (const area of fx.sink) {
    const ws = [];
    for (const t of area) {
      if (fx.hold.has(t.id)) continue;
      const a = C.idx[key(t.q, t.r)];
      for (let i = 0; i < 6; i++) if (t.w[i] === 'H' || t.w[i] === 'F') ws.push(a * 6 + i);
    }
    if (!ws.length) continue;
    let top = -1, best = [];
    for (const x of ws) { const d = getD(C, x); if (d > top) { top = d; best = [x]; } else if (d === top) best.push(x); }
    const x = best[rint(st, best.length)];
    const d = getD(C, x) + tick(x); setD(C, x, d);
    if (d >= CFG.DECAY_T) addP(x, 'M', 'sink');
  }

  // Plex: every few steps a current turns one wedge in its area wild, while wild land stays scarce
  if (fx.plex.length) {
    let nx = 0, nw = 0;
    for (const t of C.tiles) for (const c of t.w) { nw++; if (c === 'X') nx++; }
    for (const area of fx.plex) {
      if (nx >= CFG.PLEX_CAP * nw) break;
      const ws = [];
      for (const t of area) {
        if (fx.hold.has(t.id)) continue;
        const a = C.idx[key(t.q, t.r)];
        for (let i = 0; i < 6; i++) if (t.w[i] !== 'X' && !pend.has(t.id + ':' + i)) ws.push(a * 6 + i);
      }
      if (ws.length && addP(ws[rint(st, ws.length)], 'X', 'plex')) nx++;
    }
  }

  // meadow next to jungle gets reclaimed
  for (let a = 0; a < C.tiles.length; a++) for (let i = 0; i < 6; i++) {
    const x = a * 6 + i;
    if (C.tiles[a].w[i] !== 'M') continue;
    let nj = false; for (const y of adjW(C, x)) if (wt(C, y) === 'J') { nj = true; break; }
    if (nj && rnd(st) < CFG.MEADOW_TO_JUNGLE) addP(x, 'J', 'reclaim');
  }
  // big jungle creeps into neglected hamlets and fields; a city slows it down unless the jungle is deep
  for (const g of J.list) {
    if (g.size < CFG.JCRIT) continue;
    const deep = g.size >= CFG.TIERS.J[2];
    for (const x of g.w) for (const y of adjW(C, x)) {
      const c = wt(C, y);
      if ((c !== 'H' && c !== 'F') || getD(C, y) < 1) continue;
      const city = c === 'H' && !deep && H.list[H.cid[y]].shield && !sunk(y);
      if (rnd(st) < (city ? CFG.CITY_BITE : CFG.JUNGLE_INTO_DECAY)) addP(y, 'J', 'reclaim');
    }
  }

  // sprawl: fed towns past critical mass build into neighbouring wedges
  for (const g of H.list) {
    const G = state.groups[g.tag];
    let surge = false, warp = false;
    if (fx.surge.size || fx.warp.size) for (const x of g.w) { const id = tid(x); if (fx.surge.has(id)) surge = true; if (fx.warp.has(id)) warp = true; }
    // a town that has ever reached critical mass stays awake while it is still a town
    const mature = G && G.townSince != null && state.turn - G.townSince >= (surge ? CFG.MATURE * CFG.SURGE_MATURE : CFG.MATURE);
    const big = g.size >= CFG.CRIT || (G && G.tier >= 3 && g.size >= CFG.TIERS.H[2]);
    const flush = CFG.FLUSH > 0 && g.size >= CFG.TIERS.H[2] && g.supply >= CFG.FLUSH * g.need; // a well-fed town wakes early
    const awake = mature && (big || flush);
    if (!awake || !g.fed) continue;
    if (needFor(g.size + 1) > g.supply) continue;
    const city = g.size >= CFG.CITY, over = Math.max(0, g.size - CFG.CRIT);
    let p = Math.min(CFG.SPRAWL_MAX, CFG.SPRAWL_BASE + (city ? CFG.CITY_SLOPE : CFG.SPRAWL_SLOPE) * over);
    if (g.trade) p += CFG.TRADE_BONUS;
    if (G && G.homed) p += CFG.HOME_BONUS;
    if (surge) p += CFG.SURGE_BONUS;
    const tries = (1 + Math.floor(over / (city ? CFG.CITY_TRY_EVERY : CFG.TRY_EVERY))) * (warp ? CFG.WARP_TRIES : 1); // Warp: builds twice per step
    for (let k = 0; k < tries; k++) {
      if (rnd(st) >= p) continue;
      const cand = [], wts = [];
      for (const x of g.w) for (const y of adjW(C, x)) {
        const c = wt(C, y);
        const w = c === 'M' ? 4 : c === 'J' ? 3 : c === 'F' ? 1 : 0;
        if (w) { cand.push(y); wts.push(w); }
      }
      if (!cand.length) break;
      addP(cand[pickIdx(st, wts)], 'H', 'sprawl');
    }
    if (G && !G.building) {
      G.building = true;
      pushEvent(state, ev, 'sprawl', `${G.name || 'A town'} is building itself now. Watch the glowing edges.`);
    }
  }

  // metropolises lay their own tiles onto empty edges
  const planned = new Set(state.spawns.map(s => s.k));
  for (const g of H.list) {
    if (g.size < CFG.TIERS.H[4] || !g.fed) continue;
    const G = state.groups[g.tag]; if (!G) continue;
    if (G.lastSpawn != null && state.turn - G.lastSpawn < CFG.METRO_EVERY) continue;
    const cells = [];
    for (const x of g.w) {
      if (C.nb[x] >= 0) continue;
      const t = C.tiles[(x / 6) | 0], i = x % 6, q = t.q + DIRS[i][0], r = t.r + DIRS[i][1], kk = key(q, r);
      if (!state.map[kk] && !planned.has(kk)) cells.push([q, r]);
    }
    if (!cells.length) continue;
    const [q, r] = cells[rint(st, cells.length)];
    const w = [];
    for (let i = 0; i < 6; i++) {
      const nb = state.map[key(q + DIRS[i][0], r + DIRS[i][1])];
      const c = nb && nb.kind !== 'r' ? nb.w[(i + 3) % 6] : 'H';
      w.push(c === 'M' ? 'F' : c === 'X' ? 'H' : c);
    }
    state.spawns.push({ k: key(q, r), q, r, w, tag: g.tag });
    planned.add(key(q, r));
    G.lastSpawn = state.turn;
  }
}

function rumors(state, ev) {
  for (const k of Object.keys(state.map)) {
    const t = state.map[k];
    if (t.kind !== 'r') continue;
    let ok = 0;
    for (let i = 0; i < 6; i++) {
      const nb = state.map[key(t.q + DIRS[i][0], t.r + DIRS[i][1])];
      if (nb && nb.kind !== 'r' && matches(t.w[i], nb.w[(i + 3) % 6])) ok++;
    }
    if (ok >= CFG.RUMOR_NEED) {
      t.kind = 'n'; t.real = state.turn;
      state.stars += 10; state.stats.rumorsReal++;
      pushEvent(state, ev, 'rumor', 'A rumor became real because enough of the land believed it (+10★).', { k });
      const zs = [];
      for (const d of DIRS) { const nb = state.map[key(t.q + d[0], t.r + d[1])]; if (nb && nb.z !== t.z) zs.push(nb.z); }
      const z2 = zs.length ? zs[rint(state.rng, zs.length)] : (t.z + 4) % 10;
      spawnLemur(state, mesh(t.z, z2), k, ev, 'rumor');
    } else if (state.turn - t.born > CFG.RUMOR_LIFE) {
      delete state.map[k];
      state.stats.rumorsFaded++;
      pushEvent(state, ev, 'faded', 'A rumor faded. Nobody believed it.', { k });
    }
  }
}

const LEVEL_TXT = [
  '',
  'The tiles have started counting. Each one shows its zone now. Zones that sum to nine attract visitors and open currents that change the land.',
  'Towns have started adding up their own names. A name that sums to the zone it stands on grows faster.',
  'The houses have opened their eyes. They seem to like you.',
  'Night has fallen. The currents glow, and the map is thinking.'
];
function levelUp(state, ev) {
  let L = 0; for (let i = 0; i < CFG.LEVELS.length; i++) if (state.stars >= CFG.LEVELS[i]) L = i;
  while (state.level < L) { state.level++; pushEvent(state, ev, 'level', LEVEL_TXT[state.level], { level: state.level }); }
}

/* syzygies on the board: adjacent real tiles whose zones sum to nine. Each pair carries the current
   named by the difference of its zones, running from the higher zone to the lower. */
function syzygyPairs(state) {
  const out = [];
  for (const k in state.map) {
    const t = state.map[k];
    if (t.kind === 'r') continue;
    for (let i = 0; i < 3; i++) {
      const kb = key(t.q + DIRS[i][0], t.r + DIRS[i][1]), nb = state.map[kb];
      if (!nb || nb.kind === 'r' || t.z + nb.z !== 9) continue;
      const hi = Math.max(t.z, nb.z);
      const [A, B] = t.id < nb.id ? [t, nb] : [nb, t];
      out.push({ a: A.id, b: B.id, ka: key(A.q, A.r), kb: key(B.q, B.r), hi, lo: 9 - hi, name: CURRENTS[2 * hi - 9], top: t.z === hi ? t.id : nb.id });
    }
  }
  return out;
}
/* where a current acts: its two tiles and every real tile touching either */
function currentArea(state, c) {
  const out = [], seen = new Set();
  for (const k0 of [c.ka, c.kb]) {
    const t = state.map[k0]; if (!t) continue;
    for (let i = -1; i < 6; i++) {
      const kk = i < 0 ? k0 : key(t.q + DIRS[i][0], t.r + DIRS[i][1]), nb = state.map[kk];
      if (!nb || nb.kind === 'r' || seen.has(kk)) continue;
      seen.add(kk); out.push(nb);
    }
  }
  return out;
}
/* currents flow from weirdness 1 and linger a few steps after their syzygy breaks, so land
   that shifts zones back and forth doesn't make them flicker. A removed tile ends its current. */
function updateCurrents(state) {
  if (state.level < 1) { state.currents = []; return; }
  const live = new Map(syzygyPairs(state).map(c => [c.a + ':' + c.b, c]));
  const out = [];
  for (const c of state.currents || []) {
    const k = c.a + ':' + c.b, p = live.get(k);
    if (p) { Object.assign(c, p); c.gone = 0; live.delete(k); out.push(c); continue; }
    const A = state.map[c.ka], B = state.map[c.kb];
    if (!A || !B || A.id !== c.a || B.id !== c.b) continue;
    if (++c.gone <= CFG.CURRENT_LINGER) out.push(c);
  }
  for (const p of live.values()) out.push(Object.assign(p, { since: state.turn, gone: 0 }));
  state.currents = out;
}
function activeCurrents(state) { return state.currents || []; }
/* what the currents do this step, by tile id: Hold freezes its surroundings, Warp doubles decay and building,
   Surge speeds towns up; Sink and Plex act once per current */
function currentFx(state) {
  const fx = { hold: new Set(), warp: new Set(), surge: new Set(), sunk: new Set(), sink: [], plex: [] };
  if (!CFG.CURRENT_FX) return fx;
  for (const c of activeCurrents(state)) {
    const area = currentArea(state, c);
    // Hold is a calm eye: it holds the land around its pair but not the pair, so it can still end
    if (c.name === 'Hold') { for (const t of area) if (t.id !== c.a && t.id !== c.b) fx.hold.add(t.id); }
    else if (c.name === 'Warp' || c.name === 'Surge') for (const t of area) fx[c.name.toLowerCase()].add(t.id);
    else if (c.name === 'Sink') { fx.sink.push(area); for (const t of area) fx.sunk.add(t.id); }
    else if (c.name === 'Plex' && state.turn > c.since && (state.turn - c.since) % CFG.PLEX_EVERY === 0) fx.plex.push(area);
  }
  return fx;
}

/* clusters for the renderer: per wedge cluster size, tier and group tag, plus town labels */
function view(state) {
  const C = clusters(state);
  const info = {};
  for (const T of LAND) {
    for (const g of C.byType[T].list) {
      const tier = tierOf(T, g.size);
      let tag = 0;
      for (const x of g.w) { const tg = C.tiles[(x / 6) | 0].tg[x % 6]; if (tg) { tag = tg; break; } }
      for (const x of g.w) { const t = C.tiles[(x / 6) | 0]; (info[t.id] || (info[t.id] = []))[x % 6] = { size: g.size, tier, tag }; }
      g.tag = tag; g.tier = tier;
    }
  }
  const labels = [];
  for (const g of C.byType.H.list) {
    const G = state.groups[g.tag];
    if (!G || !G.name || g.size < CFG.TIERS.H[1]) continue;
    let sx = 0, sy = 0;
    for (const x of g.w) { const t = C.tiles[(x / 6) | 0]; sx += t.q; sy += t.r; }
    labels.push({ name: G.name, aq: G.aq, zone: G.zone, homed: G.homed, size: g.size, tier: tierOf('H', g.size), q: sx / g.size, r: sy / g.size });
  }
  const seas = C.byType.S.list.map(g => {
    let sx = 0, sy = 0; for (const x of g.w) { const t = C.tiles[(x / 6) | 0]; sx += t.q; sy += t.r; }
    return { size: g.size, q: sx / g.size, r: sy / g.size };
  });
  return { info, labels, seas };
}

function shares(state) {
  const c = { H: 0, F: 0, J: 0, S: 0, D: 0, M: 0, X: 0 }; let n = 0;
  for (const k in state.map) { const t = state.map[k]; if (t.kind === 'r') continue; for (const w of t.w) { c[w]++; n++; } }
  const out = {}; for (const k in c) out[k] = n ? c[k] / n : 0;
  out.n = n;
  return out;
}

const Sim = { DIRS, BASE, LAND, XW, CFG, deckOf, DEMONS, CURRENTS, key, dr, aqOf, region, mesh, demonClass, rnd, rint, rot, matches, genTile,
  newGame, evalPlacement, frontier, ferryCells, hasNeighbour, hexDist, slotTiles, place, choose, clearTile, step, clusters, view, shares, tileZone, tierOf,
  syzygyPairs, currentArea, activeCurrents, updateCurrents };
if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
else root.Sim = Sim;
})(typeof window !== 'undefined' ? window : this);
