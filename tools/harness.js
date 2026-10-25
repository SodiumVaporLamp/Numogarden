/* Headless runs of the Numogarden rules: N seeds x T placements with two scripted players.
   Usage: node tools/harness.js [runs=50] [turns=300] ['{"CFG_KEY": value}']
   Seeds are SEEDBASE + i*7919 (SEEDBASE env var, default 1000). The PASS line is the pre-registered check
   in CLAUDE.md; the process exits 1 when it fails so it can gate a commit. */
const S = require('../src/sim.js');
const { greedyMove, randomMove } = require('./bots.js');
const RUNS = +process.argv[2] || 50, TURNS = +process.argv[3] || 300;
if (process.argv[4]) Object.assign(S.CFG, JSON.parse(process.argv[4]));

let HIST = null;
function run(seed, bot) {
  const state = S.newGame(seed);
  const snaps = {};
  let errors = 0, firstErr = null;
  for (let t = 0; t < TURNS; t++) {
    try {
      while (state.choices > 0) S.choose(state, S.rint(state.rng, 2) ? 'x' : 'r');
      const mv = bot === 'greedy' ? greedyMove(state) : randomMove(state);
      const res = S.place(state, mv.slot, mv.q, mv.r, mv.k);
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
  return { seed, bot, errors, firstErr, sh, snaps, st: state.stats, stars: state.stars, level: state.level, towns: v.labels.length, maxH, tiles: Object.keys(state.map).length, ev };
}

function median(a) { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
function pct(x) { return (100 * x).toFixed(1) + '%'; }

const t0 = Date.now();
for (const bot of ['greedy', 'random']) {
  const R = [];
  HIST = { m: {}, n: {}, clean: 0, total: 0 };
  for (let i = 0; i < RUNS; i++) R.push(run((+process.env.SEEDBASE || 1000) + i * 7919, bot));
  const hp = o => Object.keys(o).sort().map(k => k + ':' + (100 * o[k] / HIST.total).toFixed(1) + '%').join(' ');
  console.log(`\n[${bot}] matches per placement  ${hp(HIST.m)}\n[${bot}] neighbours per placement ${hp(HIST.n)}\n[${bot}] clean fits (n>=3, all match) ${(100 * HIST.clean / HIST.total).toFixed(1)}%`);
  const dom = R.filter(r => Math.max(r.sh.H, r.sh.F, r.sh.J, r.sh.S, r.sh.M) > 0.60).length;
  const noSelf = R.filter(r => r.st.selfBuildAfter50 < 1).length;
  const noRecl = R.filter(r => r.st.reclaimAfter50 < 1).length;
  const firsts = R.map(r => r.st.firstSelfBuild == null ? Infinity : r.st.firstSelfBuild);
  const med = median(firsts);
  const errs = R.reduce((a, r) => a + r.errors, 0);
  const avg = k => R.reduce((a, r) => a + r.sh[k], 0) / R.length;
  const avgS = k => R.reduce((a, r) => a + r.st[k], 0) / R.length;
  console.log(`\n=== ${bot} bot: ${RUNS} runs x ${TURNS} placements ===`);
  console.log(`end shares (mean): H ${pct(avg('H'))}  F ${pct(avg('F'))}  J ${pct(avg('J'))}  S ${pct(avg('S'))}  M ${pct(avg('M'))}  X ${pct(avg('X'))}`);
  console.log(`max single-terrain share across runs: ${pct(Math.max(...R.map(r => Math.max(r.sh.H, r.sh.F, r.sh.J, r.sh.S, r.sh.M))))}`);
  console.log(`runs with a terrain > 60%: ${dom}/${RUNS}`);
  console.log(`runs with no self-build after t50: ${noSelf}   no reclamation after t50: ${noRecl}`);
  console.log(`first self-build: median ${med}  (min ${Math.min(...firsts)}, max ${Math.max(...firsts)}), never: ${firsts.filter(x => x === Infinity).length}`);
  console.log(`mean per run: sprawl ${avgS('sprawl').toFixed(1)}  spawn ${avgS('spawn').toFixed(1)}  reclaim ${avgS('reclaim').toFixed(1)}  decline ${avgS('decline').toFixed(1)}  perfect ${avgS('perfect').toFixed(1)}  snug ${avgS('snug').toFixed(1)}  syzygies ${avgS('syzygies').toFixed(1)}  lemurs ${avgS('lemurs').toFixed(1)}  rumorsReal ${avgS('rumorsReal').toFixed(1)}  faded ${avgS('rumorsFaded').toFixed(1)}`);
  console.log(`mean stars ${(R.reduce((a, r) => a + r.stars, 0) / R.length).toFixed(0)}  level dist ${JSON.stringify(R.reduce((a, r) => (a[r.level] = (a[r.level] || 0) + 1, a), {}))}  towns ${(R.reduce((a, r) => a + r.towns, 0) / R.length).toFixed(1)}  largest town (mean) ${(R.reduce((a, r) => a + r.maxH, 0) / R.length).toFixed(1)}  tiles ${(R.reduce((a, r) => a + r.tiles, 0) / R.length).toFixed(0)}`);
  for (const T of [100, 200, 300, 400, 500, 600]) {
    const ss = R.filter(r => r.snaps[T]);
    if (!ss.length) continue;
    const m = k => ss.reduce((a, r) => a + r.snaps[T][k], 0) / ss.length;
    console.log(`  t${T}: H ${pct(m('H'))} F ${pct(m('F'))} J ${pct(m('J'))} S ${pct(m('S'))} M ${pct(m('M'))}`);
  }
  const evAll = {}; for (const r of R) for (const k in r.ev) evAll[k] = (evAll[k] || 0) + r.ev[k];
  console.log(`event kinds (last 80 per run, summed): ${JSON.stringify(evAll)}`);
  console.log(`errors: ${errs}${errs ? '\n' + R.find(r => r.firstErr).firstErr : ''}`);
  if (bot === 'greedy') {
    const pass = dom <= 5 && noSelf === 0 && noRecl === 0 && med >= 60 && med <= 180 && errs === 0;
    if (!pass) process.exitCode = 1;
    console.log(`PASS CRITERIA (greedy): ${pass ? 'PASS' : 'FAIL'}  [dominance ${dom}<=5, self-build all ${noSelf === 0}, reclaim all ${noRecl === 0}, median first self-build ${med} in 60..180, errors ${errs}]`);
  }
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
