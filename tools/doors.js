/* The door ladder: greedy and the door bot, N seeds x T placements (seeds SEEDBASE + i*7919, default 1000).
   For each bot: in how many games each door had opened by the end and the median placement it first opened,
   then clumps, wild land, settling, perfect fits and stars. A diagnostic; there is no pass line.
   Usage: node tools/doors.js [runs=20] [turns=900] ['{"CFG_KEY": value}'] */
const S = require('../src/sim.js');
const { greedyMove, doorMove } = require('./bots.js');
const RUNS = +process.argv[2] || 20, TURNS = +process.argv[3] || 900;
if (process.argv[4]) Object.assign(S.CFG, JSON.parse(process.argv[4]));

function median(a) { if (!a.length) return '-'; const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
const t0 = Date.now();
for (const [bot, move] of [['greedy', greedyMove], ['door', doorMove]]) {
  const R = [];
  for (let i = 0; i < RUNS; i++) {
    const state = S.newGame((+process.env.SEEDBASE || 1000) + i * 7919);
    let err = null;
    for (let t = 0; t < TURNS && !err; t++) {
      try {
        while (state.choices > 0) S.choose(state, S.rint(state.rng, 2) ? 'x' : 'r');
        const mv = move(state), res = S.place(state, mv.slot, mv.q, mv.r, mv.k);
        if (!res.ok) err = 'placement refused: ' + res.why;
      } catch (e) { err = e.stack; }
    }
    const v = S.view(state);
    R.push({ st: state.stats, err, clumps: v.doors.length, biggest: Math.max(0, ...v.doors.map(d => d.ids.length)),
      open: v.doors.filter(d => d.open).length, x: S.shares(state).X, stars: state.stars });
  }
  const stat = k => median(R.map(r => r.st[k] || 0));
  console.log(`\n=== ${bot}: ${RUNS} runs x ${TURNS} placements ===`);
  const row = [];
  for (let n = 1; n <= 9; n++) {
    const ts = R.map(r => r.st.doorAt && r.st.doorAt[n]).filter(x => x != null);
    if (ts.length) row.push(`${n}: ${ts.length} @${median(ts)}`);
  }
  console.log(`doors that opened (games, median placement first open): ${row.join('  ') || 'none'}`);
  console.log(`at the end (median): clumps ${median(R.map(r => r.clumps))}, biggest clump ${median(R.map(r => r.biggest))}, doors open ${median(R.map(r => r.open))}, wild land ${(100 * median(R.map(r => r.x))).toFixed(1)}%`);
  console.log(`per run (median): door openings ${stat('doors')}, wild wedges settled ${stat('settled')}, perfect fits ${stat('perfect')}, Plex tiles given ${stat('plexGiven')}, turned into stars ${stat('plexStars')}, stars ${median(R.map(r => r.stars))}`);
  const errs = R.filter(r => r.err);
  console.log(`errors: ${errs.length}${errs.length ? '\n' + errs[0].err : ''}`);
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
