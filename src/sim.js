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
  DREAM_EVERY: 6,       // a cooled data centre lays a dream (a rumor tile) on an open edge this often,
  DREAM_MAX: 2,         //   with at most this many of its dreams out at once
  CRIT: 24,             // hamlet wedges for a town to start building itself (critical mass)
  MATURE: 40,           // steps a place must have been a town before it can wake up
  FLUSH: 2,             // supply multiple at which a town wakes below critical mass (0 = off)
  STARVE_MIN: 4,        // hamlets smaller than this get by on their own
  FALLOW_J: 6,          // fields go fallow only beside a jungle at least this big
  SUPPLY_K: 3,          // hamlet wedges one sea wedge on a town's border feeds
  FIELD_FEEDS: 1,       // hamlet wedges one field wedge feeds, the whole field touching a town, shared between its towns
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
  ROADS: true,          // roads between towns (false = none, which replays the rules before them):
  ROAD_REACH: 3,        //   two fed towns with this many hexes or fewer between their nearest tiles build a road,
  ROAD_REACH_METRO: 4,  //   or this many when one of them is a metropolis, and a fed town feeds a hungry one along it;
  ROAD_LINGER: 5,       //   a road out of reach, or one of whose towns is gone, lingers this many steps, overgrown
  ROAD_WORN: 20,        //   steps for a path to wear into a road (the page draws it; the chronicle notes old roads lost)
  ROAD_DOWNHILL: false, //   true = food goes only to a smaller town (measured in tuning history 22, not chosen)
  METRO_EVERY: 10,
  CURRENT_FX: true,     // currents act on the land (false = measure where they would be, for the harness baseline)
  CURRENT_LINGER: 3,    // steps a current keeps flowing after its syzygy breaks
  SURGE_BONUS: 0.25,    // Surge: extra self-building chance,
  SURGE_MATURE: 0.5,    //   and towns wake after this share of MATURE
  WARP_TRIES: 2,        // Warp: building tries per step are multiplied by this
  PLEX_EVERY: 5, PLEX_CAP: 0.08, // Plex: one wedge turns wild every 5 steps while wild land is under 8%;
                                 // past the cap, Plex tiles from fits and gifts turn into stars too
  SPEND: true,          // wild land can be settled: each wild wedge a placed tile touches takes the terrain it faces,
                        //   and a fully wild tile is open ground for an ordinary tile
                        //   (false = wild land never changes back, which replays the rules before settling)
  DOORS: true,          // a clump of n whole Plex tiles is the nth door (up to 9), open while n Plex currents run from it;
                        //   the first time it opens that far, its demon (n::0) comes through (false = no doors)
  DOOR_BASE: 12,        //   an open door of 3 or more dreams every DOOR_BASE - n placements, with DOOR_DREAM_MAX out,
  DOOR_DREAM_MAX: 2,    //   tiles of its own zone from the day deck (DOOR_TRIES draws at most), laid at its mouth;
  DOOR_TRIES: 100,      //   a door's dream comes true with DOOR_NEED believers that aren't wild, for DOOR_STARS,
  DOOR_NEED: 2, DOOR_STARS: 20, //   and doesn't fade while its door is open
  DOOR_NEAREST: true,   //   a door with no room at its mouth dreams on the nearest empty cells instead, searching outward
                        //   through the land (false = only at its mouth, which replays the rules before it)
  LOOPS: true,          // closed loops of one current are found and drawn (specs/loops.md; no effect on the land yet)
  LOOP_SETTLE: 2,       //   a pair counts as closed once it has been on a loop this many placements in a row
  LOOP_QUIET: 20,
  LOOP_FX: ['Warp', 'Surge', 'Hold', 'Sink', 'Plex'], // the currents a closed loop doubles ([] = loops have no effect)
  LOOP_DREAMS: true,    //   a data centre touching a closed loop's area dreams every DREAM_EVERY / 2 placements       //   no chronicle line for a loop whose tiles were on a closed loop of its current this recently
  HOLD_EYE_LOOPS: true, // a Hold current holds no tile at either end of any Hold current, so Hold loops can break
                        //   (false = only its own pair, which replays the rules before it; specs/loops.md)
  LEMURS_WALK: true,    // lemurs stand on real tiles and step one hex a placement toward the nearest rumor or door dream
  LEMUR_REACH: 4,       //   within this many hexes, and otherwise wander within LEMUR_HOME of where they arrived. Their
  LEMUR_HOME: 2,        //   steps come from their own seed, never state.rng (false = they stay where they arrived)
  LEMUR_BELIEVE: true,  // walking lemurs beside a rumor or door dream add one believer between them
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
    pending: [], spawns: [], builders: 0, ferries: 0, currents: [], roads: {},
    groups: {}, lemurs: [], events: [],
    stats: { sprawl: 0, spawn: 0, reclaim: 0, decline: 0, firstSelfBuild: null, selfBuildAfter50: 0, reclaimAfter50: 0,
             perfect: 0, snug: 0, rumorsReal: 0, rumorsFaded: 0, syzygies: 0, lemurs: 0, wild: 0, groks: 0,
             roads: 0, roadFed: 0, roadFood: 0 }
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
// a fully wild ordinary tile is open ground: an ordinary tile can be built on it, which settles it
function isWildGround(t) { return !!(CFG.SPEND && t && t.kind === 'n' && t.w.every(c => c === 'X')); }
function frontier(state) {
  const seen = {}, out = [];
  for (const k in state.map) { const t = state.map[k]; if (isWildGround(t) && hasNeighbour(state, t.q, t.r)) { seen[k] = 1; out.push([t.q, t.r]); } }
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

function spawnLemur(state, d, k, ev, why, door) {
  if (state.level < 1) return;
  const [a, b, name] = DEMONS[d];
  const l = { d, k, at: k, born: state.turn, s: rint(state.rng, 1e9) };
  if (why === 'door') l.door = door;
  state.lemurs.push(l);
  if (state.lemurs.length > CFG.LEMUR_MAX) state.lemurs.shift();
  state.stats.lemurs++;
  const pair = a + '::' + b;
  const msg = why === 'syzygy' ? `${name} (${pair}) slips through a syzygy to look around.`
    : why === 'rumor' ? `${name} (${pair}) moved into the rumor that came true.`
    : why === 'jungle' ? `${name} (${pair}) has been living in the deep jungle all along.`
    : why === 'door' ? `The ${ORDINAL[door]} door is open. ${name} looks through.`
    : `${name} (${pair}) wanders in, curious.`;
  // the first two doors go to the chronicle only; from the third a toast says so too
  pushEvent(state, ev, why === 'door' ? 'door' : 'lemur', msg, why === 'door' ? { d, calm: door < 3 } : { d });
}

function grant(state, item, ev) {
  if (state.hand.length >= CFG.HAND_MAX) { state.stars += 5; pushEvent(state, ev, 'reward', 'Hand full, so the bonus turns into +5★.'); return; }
  // one cap for all wild land: past PLEX_CAP a Plex tile from a fit or a gift turns into stars
  if (item.kind === 'x' && shares(state).X >= CFG.PLEX_CAP) { state.stars += 5; state.stats.plexStars = (state.stats.plexStars || 0) + 1; pushEvent(state, ev, 'reward', 'Wild land is plentiful, so the bonus turns into +5★.'); return; }
  if (item.kind === 'x') state.stats.plexGiven = (state.stats.plexGiven || 0) + 1;
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
  const kk = key(q, r), under = state.map[kk];
  if (under && (!isWildGround(under) || opts.ferry)) return { ok: false, why: 'occupied' };
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
  if (under && kind !== 'n') return { ok: false, why: 'occupied' }; // only an ordinary tile settles wild ground
  w = rot(w, k || 0);
  const ev = evalPlacement(state, w, q, r);
  const out = { ok: true, m: ev.m, n: ev.n, gain: 0, events: [] };
  if (under) { delete state.map[kk]; state.stats.wildBuilt = (state.stats.wildBuilt || 0) + 1; state.stats.settled = (state.stats.settled || 0) + 6; }
  const t = addTile(state, q, r, w, kind);
  // the edges were counted before settling, so wild edges still match; zones and syzygies see the settled land
  if (kind === 'n') {
    const settled = settle(state, q, r, w).map(s => ({ q: s.t.q, r: s.t.r, i: s.i, to: s.to }));
    if (under) for (let i = 0; i < 6; i++) settled.push({ q, r, i, to: w[i] });
    if (settled.length) out.settled = settled;
  }
  if (slotRef.from === 'offer') state.offers[slotRef.i] = genTile(state.rng, deckOf(state));
  else state.hand.splice(slotRef.i, 1);
  if (opts.ferry) state.ferries--;
  if (kind !== 'r') scorePlacement(state, t, ev, out);
  step(state, out.events);
  return out;
}

// settling: each wild wedge of an ordinary neighbour that faces a newly placed tile takes the terrain of the new
// tile's wedge on that edge. Whole Plex tiles never change.
function settleSpots(state, q, r, w) {
  const out = [];
  if (!CFG.SPEND) return out;
  for (let i = 0; i < 6; i++) {
    const nb = state.map[key(q + DIRS[i][0], r + DIRS[i][1])], j = (i + 3) % 6;
    if (nb && nb.kind === 'n' && nb.w[j] === 'X' && w[i] !== 'X') out.push({ t: nb, i: j, to: w[i] });
  }
  return out;
}
function settle(state, q, r, w) {
  const spots = settleSpots(state, q, r, w);
  for (const s of spots) { s.t.w[s.i] = s.to; s.t.d[s.i] = 0; s.t.tg[s.i] = 0; s.t.z = tileZone(s.t); }
  if (spots.length) state.stats.settled = (state.stats.settled || 0) + spots.length;
  return spots;
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
  updateLoops(state, ev);
  rules(state, C, ev);
  doors(state, ev);
  walkLemurs(state);
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
    else if (p.cause === 'absorb') {
      state.stats.absorbed = (state.stats.absorbed || 0) + 1;
      const G = state.groups[p.tag];
      if (G) { G.absorbed = true; if (G.name) (state.absorbedNames || (state.absorbedNames = [])).push({ id: p.id, i: p.i, name: G.name }); }
    } else {
      state.stats.decline++;
      if (p.cause === 'overheat') state.stats.overheat = (state.stats.overheat || 0) + 1;
    }
  }
  for (const s of state.spawns) {
    if (state.map[s.k]) continue;
    if (s.door) { // a door's dream, laid at its mouth
      addTile(state, s.q, s.r, s.w, 'r', { door: s.door, doorOf: s.doorOf });
      state.stats.doorDreams = (state.stats.doorDreams || 0) + 1;
      if (state.stats.doorDreams === 1) pushEvent(state, ev, 'dream', `The ${ORDINAL[s.door]} door has started to dream. A door's dream comes true once ${CFG.DOOR_NEED} neighbours agree with it, not counting wild land.`, { k: s.k });
      continue;
    }
    if (s.dream) {
      // the machine believes its own dream: every side of it that faces a data centre is data centre
      const w = s.w.slice();
      for (let i = 0; i < 6; i++) {
        const nb = state.map[key(s.q + DIRS[i][0], s.r + DIRS[i][1])];
        if (nb && nb.kind !== 'r' && nb.w[(i + 3) % 6] === 'D') w[i] = 'D';
      }
      addTile(state, s.q, s.r, w, 'r', { dream: true, dreamOf: s.tag });
      state.stats.dreams = (state.stats.dreams || 0) + 1;
      if (state.stats.dreams === 1) pushEvent(state, ev, 'dream', 'The data centres have started to dream. If the land believes a dream, it comes true.', { k: s.k });
      continue;
    }
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

/* food: how many hamlet wedges a town can feed. Each sea wedge on its border feeds SUPPLY_K. Each field touching it
   feeds FIELD_FEEDS per field wedge, the whole field, shared between the towns that touch it by their size.
   A town needs food for every one of its wedges: linear in size, which is what stops one city eating the map
   (a sub-linear version let a seaside city reach 75% of the map in every run, tuning history 5). */
function feed(C) {
  const H = C.byType.H, F = C.byType.F, fieldTowns = new Map();
  for (const g of H.list) {
    const sea = new Set(), fields = new Set();
    for (const x of g.w) for (const y of adjW(C, x)) {
      const c = wt(C, y);
      if (c === 'S') sea.add(y);
      else if (c === 'F' && F.cid[y] >= 0) fields.add(F.cid[y]);
    }
    g.sea = sea; g.fields = fields; g.food = CFG.SUPPLY_K * sea.size; g.sharesField = false;
    for (const f of fields) { if (!fieldTowns.has(f)) fieldTowns.set(f, []); fieldTowns.get(f).push(g); }
  }
  for (const [f, towns] of fieldTowns) {
    const mass = F.list[f].size, total = towns.reduce((a, t) => a + t.size, 0);
    for (const t of towns) { t.food += CFG.FIELD_FEEDS * mass * t.size / total; if (towns.length > 1) t.sharesField = true; }
  }
}
/* roads: two fed towns (TIERS.H[2]+ wedges) with up to ROAD_REACH hexes between their nearest tiles build a road,
   ROAD_REACH_METRO when one of them is a metropolis. It stands while both are there and in reach, at any size, and
   lingers ROAD_LINGER steps after that, overgrown, before it goes. Roads are keyed by the towns' group records, and
   each keeps its two nearest tiles for the page. Needs feed() first. */
function updateRoads(state, C, ev) {
  if (!CFG.ROADS) return;
  const R = state.roads || (state.roads = {}), H = C.byType.H, turn = state.turn, byTag = new Map(), geo = new Map();
  for (const g of H.list) if (g.tag) byTag.set(g.tag, g);
  const geom = g => { // a town's tiles, the ones on its edge, and their bounds in cube coordinates
    let P = geo.get(g); if (P) return P;
    P = { set: new Set(), edge: [], q0: Infinity, q1: -Infinity, r0: Infinity, r1: -Infinity, s0: Infinity, s1: -Infinity };
    for (const x of g.w) P.set.add((x / 6) | 0);
    for (const a of P.set) {
      const t = C.tiles[a], s = -t.q - t.r;
      P.q0 = Math.min(P.q0, t.q); P.q1 = Math.max(P.q1, t.q); P.r0 = Math.min(P.r0, t.r); P.r1 = Math.max(P.r1, t.r); P.s0 = Math.min(P.s0, s); P.s1 = Math.max(P.s1, s);
      for (let i = 0; i < 6; i++) { const b = C.nb[a * 6 + i]; if (b < 0 || !P.set.has(b)) { P.edge.push(t); break; } }
    }
    geo.set(g, P); return P;
  };
  const near = (A, B) => { // the nearest tiles of two towns, [qA, rA, qB, rB], if they are in reach
    const lim = 1 + (Math.max(A.size, B.size) >= CFG.TIERS.H[4] ? CFG.ROAD_REACH_METRO : CFG.ROAD_REACH);
    const P = geom(A), Q = geom(B);
    if (Math.max(P.q0 - Q.q1, Q.q0 - P.q1, P.r0 - Q.r1, Q.r0 - P.r1, P.s0 - Q.s1, Q.s0 - P.s1) > lim) return null;
    for (const a of P.set) if (Q.set.has(a)) { const t = C.tiles[a]; return [t.q, t.r, t.q, t.r]; }
    let best = lim + 1, ends = null; // the nearest pair is always on the two edges
    for (const s of P.edge) for (const u of Q.edge) { const d = hexDist(s.q, s.r, u.q, u.r); if (d < best) { best = d; ends = [s.q, s.r, u.q, u.r]; } }
    return ends;
  };
  for (const k of Object.keys(R)) {
    const r = R[k], A = byTag.get(r.a), B = byTag.get(r.b), ends = A && B ? near(A, B) : null;
    if (ends) { r.seen = turn; r.ends = ends; continue; }
    // two towns that grew into one: the road is inside the town now (the chronicle already says they merged)
    const one = A || B, at = A ? C.idx[key(r.ends[2], r.ends[3])] : C.idx[key(r.ends[0], r.ends[1])];
    let merged = false;
    if (one && !(A && B) && at !== undefined) for (let i = 0; i < 6; i++) if (H.cid[at * 6 + i] === one.gi) merged = true;
    if (merged || turn - r.seen > CFG.ROAD_LINGER) {
      delete R[k];
      if (!merged && r.an && r.bn && r.seen - r.since >= CFG.ROAD_WORN) pushEvent(state, ev, 'overgrown', `The road between ${r.an} and ${r.bn} is overgrown.`);
    }
  }
  const towns = H.list.filter(g => g.tag && g.size >= CFG.TIERS.H[2] && g.food >= g.size);
  for (let i = 0; i < towns.length; i++) for (let j = i + 1; j < towns.length; j++) {
    const a = Math.min(towns[i].tag, towns[j].tag), b = Math.max(towns[i].tag, towns[j].tag), k = a + '|' + b;
    if (R[k]) continue;
    const ends = near(byTag.get(a), byTag.get(b)); if (!ends) continue;
    const an = state.groups[a] && state.groups[a].name, bn = state.groups[b] && state.groups[b].name;
    R[k] = { a, b, since: turn, seen: turn, ends, an, bn };
    state.stats.roads = (state.stats.roads || 0) + 1;
    const met = state.roadsMet || (state.roadsMet = {}), first = !Object.keys(met).length;
    if (an && bn && !met[k]) {
      met[k] = 1;
      pushEvent(state, ev, 'road', `${an} and ${bn} build a road between them.${first ? ' A town with food to spare feeds the other when it goes hungry.' : ''}`);
    }
  }
}
/* food along roads: a hungry town takes what the town at the other end of a standing road has to spare, before that
   town builds for itself. One road at a time, so food never passes through a town: the hungry town nearest to fed
   goes first, from the partner with the most to spare. Returns the flows for the page; needs feed() first. */
function roadFood(state, C) {
  const H = C.byType.H, flows = [];
  for (const g of H.list) { g.roadIn = 0; g.roadOut = 0; }
  if (!CFG.ROADS || !state.roads) return flows;
  const byTag = new Map(), links = new Map();
  for (const g of H.list) if (g.tag) byTag.set(g.tag, g);
  for (const k in state.roads) {
    const r = state.roads[k], A = byTag.get(r.a), B = byTag.get(r.b);
    if (r.seen !== state.turn || !A || !B || A === B) continue;
    if (!links.has(A)) links.set(A, []);
    if (!links.has(B)) links.set(B, []);
    links.get(A).push(B); links.get(B).push(A);
  }
  const short = g => g.size - g.food, order = (x, y) => short(x) - short(y) || x.tag - y.tag;
  const hungry = [...links.keys()].filter(g => g.size >= CFG.STARVE_MIN && g.food < g.size).sort(order);
  for (const h of hungry) for (const p of links.get(h).sort(order)) {
    const spare = p.food - p.size, need = h.size - h.food;
    if (need <= 0) break;
    if (spare <= 0 || (CFG.ROAD_DOWNHILL && p.size <= h.size)) continue;
    const n = Math.min(spare, need);
    if (spare >= need) { p.food = Math.max(p.size, p.food - need); h.food = h.size; } else { p.food = p.size; h.food += spare; }
    p.roadOut += n; h.roadIn += n; flows.push({ from: p, to: h, n });
  }
  return flows;
}
function tierOf(T, size) { const TT = CFG.TIERS[T]; let k = -1; for (let i = 0; i < TT.length; i++) if (size >= TT[i]) k = i; return k; }
/* a town wakes once it has been a town for MATURE steps (half that in a Surge) and is at critical mass,
   or still a town after once being a city, or very well fed; the page asks the same question */
function matureIn(state, G, surge) { // surge: 1 in a Surge, 2 on a closed Surge loop, which halves the wait again
  if (!G || G.townSince == null) return null;
  return Math.max(0, (surge ? CFG.MATURE * CFG.SURGE_MATURE / (surge === 2 ? 2 : 1) : CFG.MATURE) - (state.turn - G.townSince));
}
function isAwake(state, g, G, surge) {
  const mature = matureIn(state, G, surge) === 0;
  const big = g.size >= CFG.CRIT || (G && G.tier >= 3 && g.size >= CFG.TIERS.H[2]);
  const flush = CFG.FLUSH > 0 && g.size >= CFG.TIERS.H[2] && g.food >= CFG.FLUSH * g.size; // a well-fed town wakes early
  return mature && (big || flush);
}

function tagAndTier(state, C, ev) {
  const turn = state.turn;
  for (const T of LAND) {
    const list = C.byType[T].list;
    // the group records each cluster's wedges carry, best first: named, then higher tier, then older
    const cands = list.map(g => {
      const seen = [];
      for (const x of g.w) {
        const tg = C.tiles[(x / 6) | 0].tg[x % 6];
        if (!tg || seen.includes(tg)) continue;
        const G = state.groups[tg];
        if (G && G.T === T) seen.push(tg);
      }
      return seen.sort((a, b) => (!!state.groups[b].name - !!state.groups[a].name) || (state.groups[b].tier - state.groups[a].tier) || (a - b));
    });
    // a town or data centre split in pieces: the largest piece keeps the record, and the others get their own
    // (fields, jungle and sea share one record between pieces, so their tier rewards can't be earned twice)
    const split = T === 'H' || T === 'D', kept = new Array(list.length).fill(0), claimed = new Set();
    const order = list.map((g, i) => i);
    if (split) order.sort((a, b) => list[b].size - list[a].size || a - b);
    for (const i of order) {
      const tg = split ? cands[i].find(t => !claimed.has(t)) : cands[i][0];
      if (tg) { kept[i] = tg; claimed.add(tg); }
    }
    list.forEach((g, i) => {
      let best = kept[i];
      if (!best) {
        best = state.nextTag++;
        state.groups[best] = split && cands[i].length ? splitOff(state, state.groups[cands[i][0]], g, C, ev) : { T, tier: -1, born: turn };
      }
      const G = state.groups[best];
      for (const x of g.w) C.tiles[(x / 6) | 0].tg[x % 6] = best;
      // absorbed groups: records in this cluster that no cluster kept
      for (const tg of cands[i]) {
        if (tg === best || claimed.has(tg)) continue;
        const O = state.groups[tg];
        if (!O) continue;
        if (T === 'H' && O.name && G.name) pushEvent(state, ev, 'merge', `${O.name} and ${G.name} grew into one place. It keeps the name ${G.name}.`);
        G.tier = Math.max(G.tier, O.tier);
        delete state.groups[tg];
      }
      g.tag = best; G.size = g.size; G.seen = turn;
      const tier = tierOf(T, g.size);
      if (tier > G.tier) { for (let k = Math.max(0, G.tier + 1); k <= tier; k++) onTier(state, G, k, g, C, ev); G.tier = tier; }
    });
  }
  // a data centre that absorbed part of a named town takes the town's name, if it has none yet
  if (state.absorbedNames && state.absorbedNames.length) {
    const byId = {}; for (const t of C.tiles) byId[t.id] = t;
    for (const a of state.absorbedNames) {
      const t = byId[a.id]; if (!t || t.w[a.i] !== 'D') continue;
      const G = state.groups[t.tg[a.i]];
      if (!G || G.T !== 'D' || G.name) continue;
      G.name = a.name; G.aq = aqOf(a.name); G.zone = dr(G.aq);
      pushEvent(state, ev, 'absorb', `${a.name} is becoming a data centre.`);
    }
    state.absorbedNames = [];
  }
  for (const tg in state.groups) {
    const G = state.groups[tg];
    if (G.seen !== turn) {
      if (G.T === 'H' && G.name) pushEvent(state, ev, 'lost', G.absorbed ? `${G.name} is part of a data centre now.` : `The Outside took ${G.name} back. Only meadow remains.`);
      delete state.groups[tg];
    }
  }
}

/* a village names itself; the name is homed if its AQ zone is the zone of the oldest tile it stands on */
function nameGroup(state, G, g, C, ev, txt) {
  let oldest = g.w[0];
  for (const x of g.w) if (C.tiles[(x / 6) | 0].id < C.tiles[(oldest / 6) | 0].id) oldest = x;
  const home = C.tiles[(oldest / 6) | 0];
  G.name = genName(state.rng);
  G.aq = aqOf(G.name); G.zone = dr(G.aq); G.homeZone = home.z; G.homed = G.zone === home.z;
  pushEvent(state, ev, 'village', txt(G.name) + (state.level >= 2 ? ` AQ ${G.aq} → zone ${G.zone}.` : ''));
  if (G.homed && state.level >= 2) pushEvent(state, ev, 'homed', `${G.name}'s name comes home: it plexes to zone ${G.zone}, the zone it was founded on. It will grow faster.`);
}
/* the record for a piece cut off from a town or data centre. It starts at the tier its size gives, without that
   tier's rewards. A piece of a town keeps the town's clock, and a piece of village size names itself. */
function splitOff(state, P, g, C, ev) {
  const G = { T: P.T, tier: tierOf(P.T, g.size), born: state.turn };
  if (P.T === 'D' && P.lastDream != null) G.lastDream = P.lastDream;
  if (P.T !== 'H') return G;
  if (G.tier >= 2 && P.townSince != null) G.townSince = P.townSince;
  if (G.tier >= 1) nameGroup(state, G, g, C, ev, n => P.name ? `Part of ${P.name} broke away and named itself ${n}.` : `A village named itself ${n}.`);
  return G;
}

function onTier(state, G, k, g, C, ev) {
  if (k === 0) return;
  if (G.T === 'H') {
    if (k === 1) {
      nameGroup(state, G, g, C, ev, n => `A village named itself ${n}.`);
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
  const tick = x => fx.warp2.has(tid(x)) ? 4 : fx.warp.has(tid(x)) ? 2 : 1; // Warp: decay runs twice as fast, four times on a closed loop
  const sunk = x => fx.sunk.has(tid(x));          // Sink: cities lose their protection
  const addP = (x, to, cause, tag) => {
    const t = C.tiles[(x / 6) | 0], i = x % 6, k = t.id + ':' + i;
    if (pend.has(k) || t.w[i] === to || t.w[i] === 'X' || fx.hold.has(t.id)) return false;
    pend.add(k); P.push(tag ? { id: t.id, i, from: t.w[i], to, cause, tag } : { id: t.id, i, from: t.w[i], to, cause }); return true;
  };

  // hamlets: food from the fields and sea they touch, and along roads; shared seas mean trade
  feed(C);
  updateRoads(state, C, ev);
  const fed = new Set();
  for (const f of roadFood(state, C)) {
    state.stats.roadFood = (state.stats.roadFood || 0) + f.n;
    if (f.to.food >= f.to.size) fed.add(f.to);
    const k = Math.min(f.from.tag, f.to.tag) + '|' + Math.max(f.from.tag, f.to.tag), met = state.roadsMet || (state.roadsMet = {});
    const A = state.groups[f.from.tag], B = state.groups[f.to.tag];
    if (met[k] === 1 && A && A.name && B && B.name) { met[k] = 2; pushEvent(state, ev, 'roadfeed', `${A.name} feeds ${B.name} along the road.`); }
  }
  state.stats.roadFed = (state.stats.roadFed || 0) + fed.size; // town-steps a road kept fed
  const seaTowns = new Map();
  for (const g of H.list) for (const y of g.sea) { const sg = S.cid[y]; if (sg >= 0) { if (!seaTowns.has(sg)) seaTowns.set(sg, new Set()); seaTowns.get(sg).add(g.gi); } }
  for (const hs of seaTowns.values()) if (hs.size >= 2) for (const gi of hs) H.list[gi].trade = true;
  // a city holds its ground against the jungle unless it is starving badly
  for (const g of H.list) g.shield = g.size >= CFG.CITY && 2 * g.food >= g.size;

  for (const g of H.list) {
    if (g.food >= g.size) { g.fed = true; for (const x of g.w) setD(C, x, 0); continue; }
    g.fed = false;
    if (g.size < CFG.STARVE_MIN) continue;
    const free = fx.hold.size ? g.w.filter(x => !held(x)) : g.w; // Hold: no decay in its area
    if (free.length) {
      const x = mostExposed(C, free, 'H', st);
      const d = getD(C, x) + tick(x); setD(C, x, d);
      // a starving hamlet wedge beside a data centre becomes part of it instead of meadow
      if (d >= CFG.DECAY_T) {
        if (adjW(C, x).some(y => wt(C, y) === 'D')) addP(x, 'D', 'absorb', g.tag);
        else addP(x, 'M', 'starve');
      }
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

  // dreaming: every DREAM_EVERY steps a cooled data centre queues a rumor on one of its open edges,
  // made of the hamlet, field, jungle and sea wedges it touches. It keeps at most DREAM_MAX dreams out at once.
  // The sides facing a data centre are laid as data centre (commitPending), so a dream that comes true grows the machine.
  const planned = new Set(state.spawns.map(s => s.k)), dreamsOut = {};
  if (CFG.DREAM_EVERY > 0) {
    for (const k in state.map) { const t = state.map[k]; if (t.kind === 'r' && t.dreamOf) dreamsOut[t.dreamOf] = (dreamsOut[t.dreamOf] || 0) + 1; }
    for (const s of state.spawns) if (s.dream) dreamsOut[s.tag] = (dreamsOut[s.tag] || 0) + 1;
  }
  if (CFG.DREAM_EVERY > 0) for (const g of C.byType.D.list) {
    const G = state.groups[g.tag];
    if (!g.cooled || !G) continue;
    if (G.lastDream == null) G.lastDream = state.turn;
    const every = CFG.LOOP_DREAMS && fx.looped.size && g.w.some(x => fx.looped.has(tid(x))) ? CFG.DREAM_EVERY / 2 : CFG.DREAM_EVERY; // a closed loop beside it: twice as often
    if (state.turn - G.lastDream < every || (dreamsOut[g.tag] || 0) >= CFG.DREAM_MAX) continue;
    const cells = [], touch = { H: 0, F: 0, J: 0, S: 0 }, seen = new Set();
    for (const x of g.w) {
      for (const y of adjW(C, x)) { const c = wt(C, y); if (c in touch && !seen.has(y)) { seen.add(y); touch[c]++; } }
      if (C.nb[x] >= 0) continue;
      const t = C.tiles[(x / 6) | 0], i = x % 6, q = t.q + DIRS[i][0], r = t.r + DIRS[i][1], kk = key(q, r);
      if (!state.map[kk] && !planned.has(kk)) cells.push([q, r]);
    }
    if (!cells.length) continue;
    const [q, r] = cells[rint(st, cells.length)];
    state.spawns.push({ k: key(q, r), q, r, w: genTile(st, touch), tag: g.tag, dream: true });
    planned.add(key(q, r));
    G.lastDream = state.turn;
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
    let surge = 0, warp = 0; // 2 on a closed loop of that current
    if (fx.surge.size || fx.warp.size) for (const x of g.w) {
      const id = tid(x);
      if (fx.surge.has(id)) surge = Math.max(surge, fx.surge2.has(id) ? 2 : 1);
      if (fx.warp.has(id)) warp = Math.max(warp, fx.warp2.has(id) ? 2 : 1);
    }
    // a town that has ever reached critical mass stays awake while it is still a town
    const awake = isAwake(state, g, G, surge);
    if (!awake || !g.fed) continue;
    if (g.food < g.size + 1) continue; // food to spare for one more wedge
    const city = g.size >= CFG.CITY, over = Math.max(0, g.size - CFG.CRIT);
    let p = Math.min(CFG.SPRAWL_MAX, CFG.SPRAWL_BASE + (city ? CFG.CITY_SLOPE : CFG.SPRAWL_SLOPE) * over);
    if (g.trade) p += CFG.TRADE_BONUS;
    if (G && G.homed) p += CFG.HOME_BONUS;
    if (surge) p += CFG.SURGE_BONUS * surge;
    const tries = (1 + Math.floor(over / (city ? CFG.CITY_TRY_EVERY : CFG.TRY_EVERY))) * (warp ? CFG.WARP_TRIES ** warp : 1); // Warp: builds twice per step, four times on a closed loop
    let spared = false;
    for (let k = 0; k < tries; k++) {
      if (rnd(st) >= p) continue;
      // a city spares its fields: it builds on them only when nothing else touches it
      const cand = [], wts = [], fields = [];
      for (const x of g.w) for (const y of adjW(C, x)) {
        const c = wt(C, y);
        if (c === 'F' && city) { fields.push(y); continue; }
        const w = c === 'M' ? 4 : c === 'J' ? 3 : c === 'F' ? 1 : 0;
        if (w) { cand.push(y); wts.push(w); }
      }
      if (cand.length && fields.length) spared = true;
      else if (!cand.length) { if (!fields.length) break; for (const y of fields) { cand.push(y); wts.push(1); } }
      addP(cand[pickIdx(st, wts)], 'H', 'sprawl');
    }
    if (G && !G.building) {
      G.building = true;
      pushEvent(state, ev, 'sprawl', `${G.name || 'A town'} is building itself now. Watch the glowing edges.`);
    }
    if (spared && G && !G.spares) {
      G.spares = true;
      pushEvent(state, ev, 'spare', `${G.name || 'A city'} spares its fields now. It builds on them only when nothing else is left.`);
    }
  }

  // metropolises lay their own tiles onto empty edges
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

/* doors: a clump of whole Plex tiles joined edge to edge. A clump of n is the nth door (n up to 9), open while
   n Plex currents run from it, counted by the zone-9 tiles at their other end (a fully wild tile reads 9 too).
   A door is known by its smallest tile id; when clumps join, the joined door keeps the best of their records. */
const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
function doorClumps(state) {
  const via = {};
  for (const c of state.currents || []) {
    if (c.name !== 'Plex') continue;
    const x = c.top === c.a ? c.b : c.a; // the zone-0 end is the Plex tile
    (via[x] || (via[x] = new Set())).add(c.top);
  }
  const seen = new Set(), out = [];
  for (const k0 in state.map) {
    const x0 = state.map[k0];
    if (x0.kind !== 'x' || seen.has(x0.id)) continue;
    const tiles = [], ends = new Set(), q = [x0];
    let first = x0; seen.add(x0.id);
    while (q.length) {
      const c = q.pop(); tiles.push(c);
      if (c.id < first.id) first = c;
      if (via[c.id]) for (const e of via[c.id]) ends.add(e);
      for (const d of DIRS) { const nb = state.map[key(c.q + d[0], c.r + d[1])]; if (nb && nb.kind === 'x' && !seen.has(nb.id)) { seen.add(nb.id); q.push(nb); } }
    }
    const n = Math.min(9, tiles.length);
    out.push({ key: first.id, at: key(first.q, first.r), ids: tiles.map(t => t.id), tiles, n, currents: ends.size, open: ends.size >= n });
  }
  return out;
}
function doors(state, ev) {
  if (!CFG.DOORS || state.level < 1) return;
  const old = state.doors || {}, next = {}, st = state.rng, planned = new Set(state.spawns.map(s => s.k));
  let out = null; // door dreams out, by the door they came from
  for (const d of doorClumps(state)) {
    let best = 0, lastDream = null;
    for (const id of d.ids) if (old[id]) {
      best = Math.max(best, old[id].best);
      if (old[id].lastDream != null && (lastDream == null || old[id].lastDream > lastDream)) lastDream = old[id].lastDream;
    }
    const rec = next[d.key] = { n: d.n, open: d.open, best, lastDream };
    if (d.open && d.n > best) {
      rec.best = d.n;
      state.stats.doors = (state.stats.doors || 0) + 1;
      const at = state.stats.doorAt || (state.stats.doorAt = {});
      if (at[d.n] == null) at[d.n] = state.turn;
      // its demon comes through unless it is already here; the first two doors are common, so they are noted only then
      const dm = mesh(d.n, 0);
      if (!state.lemurs.some(l => l.d === dm)) spawnLemur(state, dm, d.at, ev, 'door', d.n);
      else if (d.n >= 3) pushEvent(state, ev, 'door', `The ${ORDINAL[d.n]} door is open.`);
    }
    // an open door of 3 or more dreams tiles of its own zone at its mouth (or the nearest open ground), laid next step like metropolis tiles
    if (!d.open || d.n < 3 || CFG.DOOR_BASE <= 0) continue;
    if (rec.lastDream == null) { rec.lastDream = state.turn; continue; }
    if (state.turn - rec.lastDream < CFG.DOOR_BASE - d.n) continue;
    if (!out) {
      out = {};
      for (const k in state.map) { const t = state.map[k]; if (t.kind === 'r' && t.doorOf != null) out[t.doorOf] = (out[t.doorOf] || 0) + 1; }
      for (const s of state.spawns) if (s.door) out[s.doorOf] = (out[s.doorOf] || 0) + 1;
    }
    if (d.ids.reduce((a, id) => a + (out[id] || 0), 0) >= CFG.DOOR_DREAM_MAX) continue;
    const cells = [], seen = new Set(); // empty cells touching the clump or one of its fully wild tiles
    const add = (q, r) => { const k = key(q, r); if (!state.map[k] && !planned.has(k) && !seen.has(k)) { seen.add(k); cells.push([q, r]); } };
    for (const t of d.tiles) for (const [dq, dr] of DIRS) {
      const nb = state.map[key(t.q + dq, t.r + dr)];
      if (!nb) add(t.q + dq, t.r + dr);
      else if (nb.kind === 'n' && nb.w.every(c => c === 'X')) for (const [eq, er] of DIRS) add(nb.q + eq, nb.r + er);
    }
    if (!cells.length && CFG.DOOR_NEAREST) { // no room at its mouth: the nearest empty cells, searching outward through the land
      const seenT = new Set(d.ids); let front = d.tiles;
      while (!cells.length && front.length) {
        const nextF = [];
        for (const t of front) for (const [dq, dr] of DIRS) {
          const nb = state.map[key(t.q + dq, t.r + dr)];
          if (!nb) add(t.q + dq, t.r + dr); else if (!seenT.has(nb.id)) { seenT.add(nb.id); nextF.push(nb); }
        }
        front = nextF;
      }
    }
    if (!cells.length) continue;
    const [q, r] = cells[rint(st, cells.length)];
    let w = null;
    for (let i = 0; i < CFG.DOOR_TRIES; i++) { w = genTile(st, CFG.WEIGHTS); if (tileZone({ kind: 'n', w }) === d.n) break; }
    state.spawns.push({ k: key(q, r), q, r, w, door: d.n, doorOf: d.key });
    planned.add(key(q, r)); out[d.key] = (out[d.key] || 0) + 1;
    rec.lastDream = state.turn;
  }
  state.doors = next;
}

// believers of a ghost: real neighbours whose facing wedge agrees with it. A door's dream counts no wild land.
function believers(state, t) {
  let ok = 0;
  for (let i = 0; i < 6; i++) {
    const nb = state.map[key(t.q + DIRS[i][0], t.r + DIRS[i][1])];
    if (!nb || nb.kind === 'r') continue;
    const f = nb.w[(i + 3) % 6];
    if (t.door && f === 'X') continue;
    if (matches(t.w[i], f)) ok++;
  }
  const lemurs = lemursBeside(state, t); // however many stand beside it, they count as one believer
  if (lemurs.length) ok++;
  return { ok, need: t.door ? CFG.DOOR_NEED : CFG.RUMOR_NEED, lemurs };
}
function lemursBeside(state, t) {
  if (!CFG.LEMURS_WALK || !CFG.LEMUR_BELIEVE || !believes(t) || !state.lemurs.length) return [];
  return state.lemurs.filter(l => { const at = state.map[l.at || l.k]; return at && at.kind !== 'r' && hexDist(at.q, at.r, t.q, t.r) === 1; });
}

/* lemurs walk (specs/lemurs.md): each placement a lemur steps one hex over real land toward the nearest rumor or door
   dream within LEMUR_REACH, stopping beside it, and otherwise wanders within LEMUR_HOME of where it arrived on half the
   placements. Its choices come from a hash of its own seed and the placement, so walking draws nothing from state.rng. */
function lemurHash(l, turn) {
  let h = (l.s ^ Math.imul(turn + 1, 0x9E3779B1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const believes = t => t.kind === 'r' && (!!t.door || !t.dream); // the ghosts lemurs care about: rumors and door dreams
function walkLemurs(state) {
  if (!CFG.LEMURS_WALK || !state.lemurs.length) return;
  const ghosts = [];
  for (const k in state.map) if (believes(state.map[k])) ghosts.push(state.map[k]);
  const real = (q, r) => { const t = state.map[key(q, r)]; return t && t.kind !== 'r' ? t : null; };
  for (const l of state.lemurs) {
    if (!l.at) l.at = l.k; // a world saved before lemurs walked
    const cur = state.map[l.at]; if (!cur) continue; // its tile was cleared: it waits for land
    let goal = null, gd = CFG.LEMUR_REACH + 1;
    for (const g of ghosts) { const d = hexDist(cur.q, cur.r, g.q, g.r); if (d < gd || (d === gd && goal && g.id < goal.id)) { goal = g; gd = d; } }
    const h = lemurHash(l, state.turn), steps = [];
    if (goal) {
      if (gd <= 1) continue; // beside it
      for (const [dq, dr] of DIRS) { const n = real(cur.q + dq, cur.r + dr); if (n && hexDist(n.q, n.r, goal.q, goal.r) < gd) steps.push(n); }
    } else {
      if (h % 2) continue;
      const [hq, hr] = l.k.split(',').map(Number);
      for (const [dq, dr] of DIRS) { const n = real(cur.q + dq, cur.r + dr); if (n && hexDist(n.q, n.r, hq, hr) <= CFG.LEMUR_HOME) steps.push(n); }
    }
    if (!steps.length) continue;
    const n = steps[(h >>> 1) % steps.length];
    l.at = key(n.q, n.r);
  }
}
function rumors(state, ev) {
  let openDoors = null; // tiles of open doors: a door's dream doesn't fade while its door is open
  for (const k of Object.keys(state.map)) {
    const t = state.map[k];
    if (t.kind !== 'r') continue;
    const { ok, need, lemurs } = believers(state, t);
    const by = lemurs.length && ok - 1 < need ? DEMONS[lemurs[0].d][2] : null; // a lemur tipped it
    if (by && ok >= need) state.stats.lemurBelieved = (state.stats.lemurBelieved || 0) + 1;
    if (ok >= need && t.door) {
      t.kind = 'n'; t.real = state.turn;
      state.stars += CFG.DOOR_STARS;
      state.stats.doorDreamsReal = (state.stats.doorDreamsReal || 0) + 1;
      pushEvent(state, ev, 'rumor', `A dream from the ${ORDINAL[t.door]} door came true${by ? ', with ' + by + ' believing in it' : ''} (+${CFG.DOOR_STARS}★).`, { k });
      const dm = mesh(t.door, 0); // the door's demon comes to see it, unless it is already here
      if (!state.lemurs.some(l => l.d === dm)) spawnLemur(state, dm, k, ev, 'rumor');
    } else if (t.door) {
      if (!openDoors) { openDoors = new Set(); for (const d of doorClumps(state)) if (d.open) for (const id of d.ids) openDoors.add(id); }
      if (!openDoors.has(t.doorOf) && state.turn - t.born > CFG.RUMOR_LIFE) { delete state.map[k]; state.stats.doorDreamsFaded = (state.stats.doorDreamsFaded || 0) + 1; }
    } else if (ok >= need) {
      t.kind = 'n'; t.real = state.turn;
      state.stars += 10;
      if (t.dream) state.stats.dreamsReal = (state.stats.dreamsReal || 0) + 1; else state.stats.rumorsReal++;
      pushEvent(state, ev, 'rumor', t.dream ? 'A dream came true because enough of the land believed it (+10★).' : by ? `A rumor became real: the land and ${by} believed it (+10★).` : 'A rumor became real because enough of the land believed it (+10★).', { k });
      const zs = [];
      for (const d of DIRS) { const nb = state.map[key(t.q + d[0], t.r + d[1])]; if (nb && nb.z !== t.z) zs.push(nb.z); }
      const z2 = zs.length ? zs[rint(state.rng, zs.length)] : (t.z + 4) % 10;
      spawnLemur(state, mesh(t.z, z2), k, ev, 'rumor');
    } else if (state.turn - t.born > CFG.RUMOR_LIFE) {
      delete state.map[k];
      // dreams fade quietly; there are many of them
      if (t.dream) { state.stats.dreamsFaded = (state.stats.dreamsFaded || 0) + 1; continue; }
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
  while (state.level < L) { state.level++; (state.stats.levelAt || (state.stats.levelAt = {}))[state.level] = state.turn; pushEvent(state, ev, 'level', LEVEL_TXT[state.level], { level: state.level }); }
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
    if (p) { Object.assign(c, p); c.gone = 0; c.loopHold = false; live.delete(k); out.push(c); continue; }
    const A = state.map[c.ka], B = state.map[c.kb];
    if (!A || !B || A.id !== c.a || B.id !== c.b) continue;
    if (!c.gone && c.name === 'Hold' && loopFx(c)) c.loopHold = true; // a closed Hold pair lingers twice as long
    if (++c.gone <= CFG.CURRENT_LINGER * (c.loopHold ? 2 : 1)) out.push(c);
  }
  for (const p of live.values()) out.push(Object.assign(p, { since: state.turn, gone: 0 }));
  state.currents = out;
}
function activeCurrents(state) { return state.currents || []; }
/* a closed pair whose current a loop doubles */
function loopFx(c) { return CFG.LOOPS && !c.gone && c.loopFor >= CFG.LOOP_SETTLE && CFG.LOOP_FX.includes(c.name); }
/* closed loops (specs/loops.md). Each current's live pairs make a graph on tiles; a pair is on a loop when its link is
   not a bridge (Tarjan). c.loopFor counts the placements in a row it has been on one, and a pair is closed from
   LOOP_SETTLE. Lingering pairs make no loops. A loop is a connected set of one current's closed pairs. */
function onLoop(pairs) {
  const adj = new Map(), add = (u, v, i) => (adj.get(u) || adj.set(u, []).get(u)).push([v, i]);
  pairs.forEach((c, i) => { add(c.a, c.b, i); add(c.b, c.a, i); });
  const disc = new Map(), low = new Map(), on = pairs.map(() => true); let time = 0;
  for (const s of adj.keys()) {
    if (disc.has(s)) continue;
    const stack = [[s, -1, 0]]; disc.set(s, time); low.set(s, time++);
    while (stack.length) {
      const top = stack[stack.length - 1], u = top[0], nb = adj.get(u);
      if (top[2] < nb.length) {
        const [v, i] = nb[top[2]++]; if (i === top[1]) continue;
        if (disc.has(v)) low.set(u, Math.min(low.get(u), disc.get(v)));
        else { disc.set(v, time); low.set(v, time++); stack.push([v, i, 0]); }
      } else {
        stack.pop();
        if (stack.length) { const w = stack[stack.length - 1][0]; low.set(w, Math.min(low.get(w), low.get(u))); if (low.get(u) > disc.get(w)) on[top[1]] = false; }
      }
    }
  }
  return on;
}
function closedLoops(state) {
  const out = [], par = new Map(), find = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  const closed = activeCurrents(state).filter(c => !c.gone && c.loopFor >= CFG.LOOP_SETTLE);
  for (const c of closed) for (const id of [c.name + c.a, c.name + c.b]) if (!par.has(id)) par.set(id, id);
  for (const c of closed) par.set(find(c.name + c.a), find(c.name + c.b));
  const sets = new Map();
  for (const c of closed) {
    const r = find(c.name + c.a), L = sets.get(r) || sets.set(r, { name: c.name, pairs: [], tiles: new Set() }).get(r);
    L.pairs.push(c); L.tiles.add(c.a).add(c.b);
  }
  for (const L of sets.values()) out.push({ name: L.name, pairs: L.pairs, tiles: [...L.tiles].sort((a, b) => a - b) });
  return out;
}
function updateLoops(state, ev) {
  if (!CFG.LOOPS || state.level < 1) return;
  const by = {};
  for (const c of activeCurrents(state)) { if (c.gone) c.loopFor = 0; else (by[c.name] || (by[c.name] = [])).push(c); }
  for (const n in by) { const on = onLoop(by[n]); by[n].forEach((c, i) => { c.loopFor = on[i] ? (c.loopFor || 0) + 1 : 0; }); }
  // a chronicle line when a loop closes, unless its tiles were on a closed loop of that current within LOOP_QUIET
  const seen = state.loopSeen || (state.loopSeen = {}), byId = {};
  for (const k in state.map) byId[state.map[k].id] = state.map[k];
  for (const L of closedLoops(state)) {
    const fresh = L.tiles.every(id => !(seen[L.name + id] >= state.turn - CFG.LOOP_QUIET));
    for (const id of L.tiles) seen[L.name + id] = state.turn;
    if (!fresh) continue;
    state.stats.loops = (state.stats.loops || 0) + 1;
    let near = null, nd = 4;
    for (const id of L.tiles) {
      const t = byId[id]; if (!t) continue;
      for (const k in state.map) {
        const u = state.map[k]; if (u.kind === 'r') continue;
        const d = hexDist(t.q, t.r, u.q, u.r); if (d >= nd) continue;
        for (let i = 0; i < 6; i++) { const G = state.groups[u.tg[i]]; if (u.w[i] === 'H' && G && G.name) { near = G.name; nd = d; break; } }
      }
    }
    pushEvent(state, ev, 'loop', `A ${L.name} loop closed${near ? ' near ' + near : ''}.`, { calm: true, tiles: L.tiles });
  }
  for (const k in seen) if (seen[k] < state.turn - CFG.LOOP_QUIET) delete seen[k];
}
/* what the currents do this step, by tile id: Hold freezes its surroundings, Warp doubles decay and building,
   Surge speeds towns up; Sink and Plex act once per current */
function currentFx(state) {
  const fx = { hold: new Set(), warp: new Set(), surge: new Set(), sunk: new Set(), sink: [], plex: [], warp2: new Set(), surge2: new Set(), looped: new Set() };
  if (!CFG.CURRENT_FX) return fx;
  // Hold is a calm eye: it holds the land around its pair but not the pair, so it can still end. With HOLD_EYE_LOOPS it
  // holds no tile at either end of any Hold current, so a loop of Hold currents can't hold itself either (specs/loops.md)
  const eye = new Set();
  if (CFG.HOLD_EYE_LOOPS) for (const c of activeCurrents(state)) if (c.name === 'Hold') eye.add(c.a).add(c.b);
  for (const c of activeCurrents(state)) {
    const area = currentArea(state, c);
    if (c.name === 'Hold') { for (const t of area) if (t.id !== c.a && t.id !== c.b && !eye.has(t.id)) fx.hold.add(t.id); }
    // a closed loop doubles its current (specs/loops.md): Warp and Surge areas count twice, once however many loops
    // cover a tile, and each closed Sink or Plex pair acts twice. Hold lingers twice as long (updateCurrents)
    const twice = loopFx(c);
    if (CFG.LOOPS && !c.gone && c.loopFor >= CFG.LOOP_SETTLE) for (const t of area) fx.looped.add(t.id); // closed areas, for the data-centre boost
    if (c.name === 'Warp' || c.name === 'Surge') { const n = c.name.toLowerCase(); for (const t of area) { fx[n].add(t.id); if (twice) fx[n + '2'].add(t.id); } }
    else if (c.name === 'Sink') { fx.sink.push(area); if (twice) fx.sink.push(area); for (const t of area) fx.sunk.add(t.id); }
    else if (c.name === 'Plex' && state.turn > c.since && (state.turn - c.since) % CFG.PLEX_EVERY === 0) { fx.plex.push(area); if (twice) fx.plex.push(area); }
  }
  return fx;
}

/* clusters for the renderer: per wedge cluster size, tier and group tag, a town's food and whether it is awake,
   a data centre's cooling, plus town labels. It only reads the state, so the page can call it as often as it likes. */
function view(state) {
  const C = clusters(state), fx = currentFx(state);
  feed(C);
  // food along roads, as the rules count it; roadFood() needs each town's group record, read from its wedges
  for (const g of C.byType.H.list) { g.tag = 0; for (const x of g.w) { const tg = C.tiles[(x / 6) | 0].tg[x % 6]; if (tg) { g.tag = tg; break; } } }
  const flows = roadFood(state, C), nameOf = g => (state.groups[g.tag] && state.groups[g.tag].name) || null;
  const info = {}, whole = {};
  for (const T of LAND) {
    for (const g of C.byType[T].list) {
      const tier = tierOf(T, g.size);
      let tag = 0;
      for (const x of g.w) { const tg = C.tiles[(x / 6) | 0].tg[x % 6]; if (tg) { tag = tg; break; } }
      const cell = { size: g.size, tier, tag };
      if (T === 'D') { // cooling, for the page: sea contacts against the need
        const sea = new Set(); for (const x of g.w) for (const y of adjW(C, x)) if (wt(C, y) === 'S') sea.add(y);
        cell.cool = sea.size; cell.need = Math.ceil(g.size / CFG.COOL_K);
      } else if (T === 'H') { // food as the hunger rule counts it (feed()), and whether the town is awake and building
        let surge = 0;
        if (fx.surge.size) for (const x of g.w) { const id = C.tiles[(x / 6) | 0].id; if (fx.surge.has(id)) surge = Math.max(surge, fx.surge2.has(id) ? 2 : 1); }
        cell.food = g.food; cell.sea = g.sea.size; cell.shared = g.sharesField;
        cell.roadIn = g.roadIn; cell.roadOut = g.roadOut; // food a road brings it or takes to a hungry town, and from whom
        cell.roadFrom = flows.filter(f => f.to === g).map(f => nameOf(f.from)); cell.roadTo = flows.filter(f => f.from === g).map(f => nameOf(f.to));
        cell.awake = isAwake(state, g, state.groups[tag], surge);
        cell.building = cell.awake && g.food >= g.size + 1;
        cell.matureIn = matureIn(state, state.groups[tag], surge);
      }
      if (tag) whole[T + tag] = Math.max(whole[T + tag] || 0, g.size);
      for (const x of g.w) { const t = C.tiles[(x / 6) | 0]; (info[t.id] || (info[t.id] = []))[x % 6] = cell; }
      g.tag = tag; g.tier = tier; g.cell = cell;
    }
  }
  // the pieces of a split town or data centre share its record; each knows the size of the largest piece
  for (const T of LAND) for (const g of C.byType[T].list) g.cell.whole = g.tag ? whole[T + g.tag] : g.size;
  const labels = [];
  for (const g of C.byType.H.list) {
    const G = state.groups[g.tag];
    if (!G || !G.name || g.size < CFG.TIERS.H[1]) continue;
    let sx = 0, sy = 0;
    for (const x of g.w) { const t = C.tiles[(x / 6) | 0]; sx += t.q; sy += t.r; }
    labels.push({ name: G.name, aq: G.aq, zone: G.zone, homed: G.homed, size: g.size, tier: tierOf('H', g.size), food: g.food, q: sx / g.size, r: sy / g.size });
  }
  // data centres that took a town's name; a split data centre keeps its name on its largest piece
  const byName = new Map();
  for (const g of C.byType.D.list) {
    const G = state.groups[g.tag];
    if (!G || !G.name || (byName.has(G.name) && byName.get(G.name).size >= g.size)) continue;
    let sx = 0, sy = 0;
    for (const x of g.w) { const t = C.tiles[(x / 6) | 0]; sx += t.q; sy += t.r; }
    byName.set(G.name, { name: G.name, aq: G.aq, zone: G.zone, size: g.size, cool: g.cell.cool, need: g.cell.need, q: sx / g.size, r: sy / g.size });
  }
  const dlabels = [...byName.values()];
  const seas = C.byType.S.list.map(g => {
    let sx = 0, sy = 0; for (const x of g.w) { const t = C.tiles[(x / 6) | 0]; sx += t.q; sy += t.r; }
    return { size: g.size, q: sx / g.size, r: sy / g.size };
  });
  // roads with their two nearest tiles, how long they have stood, and the food on them this step
  const roads = [];
  for (const k in state.roads || {}) {
    const r = state.roads[k], f = flows.find(f => (f.from.tag === r.a && f.to.tag === r.b) || (f.from.tag === r.b && f.to.tag === r.a));
    roads.push({ a: r.a, b: r.b, an: r.an, bn: r.bn, ends: r.ends, age: state.turn - r.since, overgrown: r.seen !== state.turn, flow: f ? { n: f.n, toB: f.to.tag === r.b } : null });
  }
  // doors with the Plex currents running from them, and how far each has opened before
  const doorList = CFG.DOORS && state.level >= 1 ? doorClumps(state) : [];
  for (const d of doorList) d.best = Math.max(0, ...d.ids.map(id => state.doors && state.doors[id] ? state.doors[id].best : 0));
  return { info, labels, dlabels, seas, roads, doors: doorList };
}

function shares(state) {
  const c = { H: 0, F: 0, J: 0, S: 0, D: 0, M: 0, X: 0 }; let n = 0;
  for (const k in state.map) { const t = state.map[k]; if (t.kind === 'r') continue; for (const w of t.w) { c[w]++; n++; } }
  const out = {}; for (const k in c) out[k] = n ? c[k] / n : 0;
  out.n = n;
  return out;
}

const Sim = { DIRS, BASE, LAND, XW, CFG, deckOf, DEMONS, CURRENTS, key, dr, aqOf, region, mesh, demonClass, rnd, rint, rot, matches, genTile,
  newGame, evalPlacement, frontier, ferryCells, hasNeighbour, hexDist, slotTiles, place, choose, clearTile, step, clusters, view, shares, tileZone, tierOf, settleSpots, isWildGround, doorClumps, ORDINAL, believers,
  syzygyPairs, currentArea, activeCurrents, updateCurrents, closedLoops };
if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
else root.Sim = Sim;
})(typeof window !== 'undefined' ? window : this);
