/* Headless runs of the Numogarden rules: N seeds x T placements with three scripted players
   (greedy, zone-aware greedy, random).
   Usage: node tools/harness.js [runs=50] [turns=300] ['{"CFG_KEY": value}']
   Seeds are SEEDBASE + i*7919 (SEEDBASE env var, default 1000). The PASS line is the pre-registered check
   in CLAUDE.md; the process exits 1 when it fails so it can gate a commit. */
const S = require('../src/sim.js');
const { greedyMove, zoneMove, randomMove } = require('./bots.js');
const MOVES = { greedy: greedyMove, zone: zoneMove, random: randomMove };
const CNAMES = ['Plex', 'Surge', 'Hold', 'Warp', 'Sink'];
const RUNS = +process.argv[2] || 50, TURNS = +process.argv[3] || 300;
if (process.argv[4]) Object.assign(S.CFG, JSON.parse(process.argv[4]));

let HIST = null;
function run(seed, bot) {
  const state = S.newGame(seed);
  const snaps = {};
  const cur = {}; for (const c of CNAMES) cur[c] = 0; // tile-steps under each current
  let errors = 0, firstErr = null;
  for (let t = 0; t < TURNS; t++) {
    try {
      while (state.choices > 0) S.choose(state, S.rint(state.rng, 2) ? 'x' : 'r');
      const mv = MOVES[bot](state);
      const res = S.place(state, mv.slot, mv.q, mv.r, mv.k);
      for (const c of S.activeCurrents(state)) cur[c.name] += S.currentArea(state, c).length;
      if (res.ok) { HIST.m[res.m] = (HIST.m[res.m] || 0) + 1; HIST.n[res.n] = (HIST.n[res.n] || 0) + 1; if (res.n >= 3 && res.m === res.n) HIST.clean++; HIST.total++; }
      if (!res.ok) throw new Error('placement refused: ' + res.why);
      for (const k in state.map) {
        const tl = state.map[k];
        if (tl.w.some(x => !x) || Number.isNaN(tl.z)) throw new Error('bad tile ' + k);
      }
      if (Number.isNaN(state.stars)) throw new Error('NaN stars');
    } catch (e) { errors++; if (!firstErr) firstErr = e.stack; break; }
    if ((t + 1) % 100 === 0) snaps[t + 1] = S.shares(state);
  }
  const sh = S.shares(state);
  const v = S.view(state);
  const maxH = Math.max(0, ...v.labels.map(l => l.size));
  const ev = {};
  for (const e of state.events) ev[e.kind] = (ev[e.kind] || 0) + 1;
  const x300 = (snaps[300] || sh).X;
  return { seed, bot, errors, firstErr, sh, snaps, cur, x300, st: state.stats, stars: state.stars, level: state.level, towns: v.labels.length, maxH, tiles: Object.keys(state.map).length, ev };
}

function median(a) { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
function pct(x) { return (100 * x).toFixed(1) + '%'; }

const t0 = Date.now();
for (const bot of ['greedy', 'zone', 'random']) {
  const R = [];
  HIST = { m: {}, n: {}, clean: 0, total: 0 };
  const seeds = []; for (let i = 0; i < RUNS; i++) seeds.push((+process.env.SEEDBASE || 1000) + i * 7919);
  for (const s of seeds) R.push(run(s, bot));
  // the same seeds with current effects off: each current's share is judged against where it falls anyway
  let base = null;
  if (bot !== 'random') {
    const h = HIST, fx = S.CFG.CURRENT_FX;
    S.CFG.CURRENT_FX = false; HIST = { m: {}, n: {}, clean: 0, total: 0 };
    base = seeds.map(s => run(s, bot));
    S.CFG.CURRENT_FX = fx; HIST = h;
  }
  const hp = o => Object.keys(o).sort().map(k => k + ':' + (100 * o[k] / HIST.total).toFixed(1) + '%').join(' ');
  console.log(`\n[${bot}] matches per placement  ${hp(HIST.m)}\n[${bot}] neighbours per placement ${hp(HIST.n)}\n[${bot}] clean fits (n>=3, all match) ${(100 * HIST.clean / HIST.total).toFixed(1)}%`);
  const top = r => Math.max(r.sh.H, r.sh.F, r.sh.J, r.sh.S, r.sh.D || 0, r.sh.M);
  const dom = R.filter(r => top(r) > 0.60).length;
  const noSelf = R.filter(r => r.st.selfBuildAfter50 < 1).length;
  const noRecl = R.filter(r => r.st.reclaimAfter50 < 1).length;
  const firsts = R.map(r => r.st.firstSelfBuild == null ? Infinity : r.st.firstSelfBuild);
  const med = median(firsts);
  const errs = R.reduce((a, r) => a + r.errors, 0);
  const avg = k => R.reduce((a, r) => a + r.sh[k], 0) / R.length;
  const avgS = k => R.reduce((a, r) => a + r.st[k], 0) / R.length;
  console.log(`\n=== ${bot} bot: ${RUNS} runs x ${TURNS} placements ===`);
  console.log(`end shares (mean): H ${pct(avg('H'))}  F ${pct(avg('F'))}  J ${pct(avg('J'))}  S ${pct(avg('S'))}  D ${pct(avg('D'))}  M ${pct(avg('M'))}  X ${pct(avg('X'))}`);
  console.log(`max single-terrain share across runs: ${pct(Math.max(...R.map(top)))}`);
  console.log(`runs with a terrain > 60%: ${dom}/${RUNS}`);
  console.log(`runs with no self-build after t50: ${noSelf}   no reclamation after t50: ${noRecl}`);
  console.log(`first self-build: median ${med}  (min ${Math.min(...firsts)}, max ${Math.max(...firsts)}), never: ${firsts.filter(x => x === Infinity).length}`);
  console.log(`mean per run: sprawl ${avgS('sprawl').toFixed(1)}  spawn ${avgS('spawn').toFixed(1)}  reclaim ${avgS('reclaim').toFixed(1)}  decline ${avgS('decline').toFixed(1)}  perfect ${avgS('perfect').toFixed(1)}  snug ${avgS('snug').toFixed(1)}  syzygies ${avgS('syzygies').toFixed(1)}  lemurs ${avgS('lemurs').toFixed(1)}  rumorsReal ${avgS('rumorsReal').toFixed(1)}  faded ${avgS('rumorsFaded').toFixed(1)}  wild ${(R.reduce((a, r) => a + (r.st.wild || 0), 0) / R.length).toFixed(1)}  groks ${(R.reduce((a, r) => a + (r.st.groks || 0), 0) / R.length).toFixed(1)}  roads ${(R.reduce((a, r) => a + (r.st.roads || 0), 0) / R.length).toFixed(1)}  roadFed ${(R.reduce((a, r) => a + (r.st.roadFed || 0), 0) / R.length).toFixed(1)}`);
  const avg0 = k => (R.reduce((a, r) => a + (r.st[k] || 0), 0) / R.length).toFixed(1);
  const lv = n => median(R.map(r => r.st.levelAt && r.st.levelAt[n] != null ? r.st.levelAt[n] : Infinity));
  const doorRow = R => [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => { const ts = R.map(r => r.st.doorAt && r.st.doorAt[n]).filter(x => x != null); return ts.length ? `${n}:${ts.length}@${median(ts)}` : ''; }).filter(Boolean).join(' ');
  if (R.some(r => r.st.doors)) console.log(`doors, mean per run: openings ${avg0('doors')};  first opened (runs @ median placement) ${doorRow(R)}`);
  if (R.some(r => r.st.settled)) console.log(`wild land, mean per run: settled ${avg0('settled')} wedges  Plex tiles given ${avg0('plexGiven')}  turned into stars ${avg0('plexStars')};  weirdness arrives (median placement) ${[1, 2, 3, 4].map(n => n + ':' + lv(n)).join(' ')}`);
  console.log(`mean stars ${(R.reduce((a, r) => a + r.stars, 0) / R.length).toFixed(0)}  level dist ${JSON.stringify(R.reduce((a, r) => (a[r.level] = (a[r.level] || 0) + 1, a), {}))}  towns ${(R.reduce((a, r) => a + r.towns, 0) / R.length).toFixed(1)}  largest town (mean) ${(R.reduce((a, r) => a + r.maxH, 0) / R.length).toFixed(1)}  tiles ${(R.reduce((a, r) => a + r.tiles, 0) / R.length).toFixed(0)}`);
  for (let T = 100; T <= TURNS; T += 100) {
    const ss = R.filter(r => r.snaps[T]);
    if (!ss.length) continue;
    const m = k => ss.reduce((a, r) => a + r.snaps[T][k], 0) / ss.length;
    console.log(`  t${T}: H ${pct(m('H'))} F ${pct(m('F'))} J ${pct(m('J'))} S ${pct(m('S'))} D ${pct(m('D'))} M ${pct(m('M'))} X ${pct(m('X'))}`);
  }
  // currents: tile-steps per type pooled over runs, and Plex (X) share at placement 300
  const curShares = RR => {
    const all = {}; for (const c of CNAMES) all[c] = RR.reduce((a, r) => a + r.cur[c], 0);
    const tot = CNAMES.reduce((a, c) => a + all[c], 0);
    const sh = {}; for (const c of CNAMES) sh[c] = tot ? all[c] / tot : 0;
    return { all, sh };
  };
  const { all: curAll, sh: curSh } = curShares(R);
  console.log(`current tile-steps per run: ${CNAMES.map(c => `${c} ${(curAll[c] / R.length).toFixed(0)} (${pct(curSh[c])})`).join('  ')}`);
  let curRise = 0, curRiser = '-';
  if (base) {
    const bSh = curShares(base).sh;
    for (const c of CNAMES) if (curSh[c] - bSh[c] > curRise) { curRise = curSh[c] - bSh[c]; curRiser = c; }
    console.log(`  with effects off:         ${CNAMES.map(c => `${c} ${pct(bSh[c])}`).join('  ')}  biggest rise ${curRiser} +${(100 * curRise).toFixed(1)} pts`);
  }
  const xMax = Math.max(...R.map(r => r.x300)), xOver = R.filter(r => r.x300 >= 0.10).length;
  console.log(`X share at t300: mean ${pct(R.reduce((a, r) => a + r.x300, 0) / R.length)}  max ${pct(xMax)}  runs >= 10%: ${xOver}`);
  const evAll = {}; for (const r of R) for (const k in r.ev) evAll[k] = (evAll[k] || 0) + r.ev[k];
  console.log(`event kinds (last 80 per run, summed): ${JSON.stringify(evAll)}`);
  console.log(`errors: ${errs}${errs ? '\n' + R.find(r => r.firstErr).firstErr : ''}`);
  if (bot !== 'random') {
    const pass = dom <= 5 && noSelf === 0 && noRecl === 0 && med >= 40 && med <= 180 && errs === 0 && curRise <= 0.10 && xOver === 0;
    const line = `[dominance ${dom}<=5, self-build all ${noSelf === 0}, reclaim all ${noRecl === 0}, median first self-build ${med} in 40..180, errors ${errs}, current rise ${curRiser} +${(100 * curRise).toFixed(1)}<=10 pts, X>=10% at t300 in ${xOver} runs]`;
    // the greedy line gates; the zone-aware bot is a diagnostic for whether chasing currents breaks balance
    if (bot === 'greedy') {
      if (!pass) process.exitCode = 1;
      console.log(`PASS CRITERIA (greedy): ${pass ? 'PASS' : 'FAIL'}  ${line}`);
    } else console.log(`same criteria (zone-aware, diagnostic): ${pass ? 'pass' : 'fail'}  ${line}`);
  }
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
