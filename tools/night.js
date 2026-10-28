/* Night check for data centres: N seeds x T placements with the greedy bot, so most of each run is night
   (weirdness 4, from about placement 120). Prints the land at the end, data-centre stats, and the
   pre-registered NIGHT PASS line from CLAUDE.md; the process exits 1 when it fails.
   Usage: node tools/night.js [runs=50] [turns=600] ['{"CFG_KEY": value}']
   Seeds are SEEDBASE + i*7919 (SEEDBASE env var, default 1000). */
const S = require('../src/sim.js');
const { greedyMove } = require('./bots.js');
const RUNS = +process.argv[2] || 50, TURNS = +process.argv[3] || 600;
if (process.argv[4]) Object.assign(S.CFG, JSON.parse(process.argv[4]));
const LANDS = ['H', 'F', 'J', 'S', 'D', 'M'];

function run(seed) {
  const state = S.newGame(seed);
  let errors = 0, firstErr = null, night = null;
  const ghosts = { sum: 0, steps: 0, max: 0 }; // dream ghosts on the map once data centres have arrived
  const roads = { sum: 0, steps: 0, max: 0 };  // roads standing between towns
  for (let t = 0; t < TURNS; t++) {
    try {
      while (state.choices > 0) S.choose(state, S.rint(state.rng, 2) ? 'x' : 'r');
      const mv = greedyMove(state), res = S.place(state, mv.slot, mv.q, mv.r, mv.k);
      if (!res.ok) throw new Error('placement refused: ' + res.why);
      for (const k in state.map) if (state.map[k].w.some(x => !x) || Number.isNaN(state.map[k].z)) throw new Error('bad tile ' + k);
      if (night == null && state.level >= 4) night = state.turn;
      if (state.dcSince != null) {
        let n = 0; for (const k in state.map) if (state.map[k].kind === 'r' && state.map[k].dream) n++;
        ghosts.sum += n; ghosts.steps++; ghosts.max = Math.max(ghosts.max, n);
      }
      if (state.roads) {
        let n = 0; for (const k in state.roads) if (state.roads[k].seen === state.turn) n++;
        roads.sum += n; roads.steps++; roads.max = Math.max(roads.max, n);
      }
    } catch (e) { errors++; if (!firstErr) firstErr = e.stack; break; }
  }
  const sh = S.shares(state), v = S.view(state);
  // a town survives as itself (12+ hamlet wedges) or as a data centre that took a town's name
  const kept = v.labels.filter(l => l.size >= S.CFG.TIERS.H[2]).length + (v.dlabels || []).filter(l => l.name).length;
  const C = S.clusters(state), D = C.byType.D ? C.byType.D.list : [];
  return { seed, errors, firstErr, night, sh, kept, ghosts, roads, st: state.stats, dCount: D.length, dMax: Math.max(0, ...D.map(g => g.size)) };
}

function median(a) { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
function pct(x) { return (100 * x).toFixed(1) + '%'; }

const t0 = Date.now(), R = [];
for (let i = 0; i < RUNS; i++) R.push(run((+process.env.SEEDBASE || 1000) + i * 7919));
const nights = R.filter(r => r.night != null).map(r => r.night);
const avg = k => R.reduce((a, r) => a + (r.sh[k] || 0), 0) / R.length;
const stat = k => median(R.map(r => r.st[k] || 0));
console.log(`=== night check: greedy, ${RUNS} runs x ${TURNS} placements ===`);
console.log(`night reached in ${nights.length}/${RUNS} runs, median placement ${nights.length ? median(nights) : '-'}`);
console.log(`end shares (mean): ${LANDS.concat('X').map(k => `${k} ${pct(avg(k))}`).join('  ')}`);
const top = r => Math.max(...LANDS.map(k => r.sh[k] || 0));
console.log(`max single-terrain share across runs: ${pct(Math.max(...R.map(top)))}`);
console.log(`data centres at the end (median): clusters ${median(R.map(r => r.dCount))}  largest ${median(R.map(r => r.dMax))} wedges (max ${Math.max(...R.map(r => r.dMax))})`);
if (R.some(r => r.st.dcSteps)) console.log(`cooled on ${pct(R.reduce((a, r) => a + (r.st.dcCooled || 0), 0) / Math.max(1, R.reduce((a, r) => a + (r.st.dcSteps || 0), 0)))} of data-centre cluster-steps`);
if (R.some(r => r.st.absorbed)) console.log(`hamlet wedges absorbed per run (median): ${stat('absorbed')}`);
if (R.some(r => r.st.dreams)) console.log(`dreams per run (median): laid ${stat('dreams')}, came true ${stat('dreamsReal')}`);
if (R.some(r => r.ghosts.steps)) console.log(`dream ghosts on the map once data centres arrive: mean ${(R.reduce((a, r) => a + r.ghosts.sum, 0) / Math.max(1, R.reduce((a, r) => a + r.ghosts.steps, 0))).toFixed(1)}, max ${Math.max(...R.map(r => r.ghosts.max))}`);
if (R.some(r => r.st.roads)) console.log(`roads per run (median): built ${stat('roads')}, town-steps a road kept fed ${stat('roadFed')}; standing at once: mean ${(R.reduce((a, r) => a + r.roads.sum, 0) / Math.max(1, R.reduce((a, r) => a + r.roads.steps, 0))).toFixed(1)}, max ${Math.max(...R.map(r => r.roads.max))}`);
if (R.some(r => r.st.doors)) console.log(`doors: openings per run (median) ${stat('doors')}; first opened (runs @ median placement) ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => { const ts = R.map(r => r.st.doorAt && r.st.doorAt[n]).filter(x => x != null); return ts.length ? `${n}:${ts.length}@${median(ts)}` : ''; }).filter(Boolean).join(' ')}`);
if (R.some(r => r.st.settled)) console.log(`wild land per run (median): settled ${stat('settled')} wedges, Plex tiles given ${stat('plexGiven')}, turned into stars ${stat('plexStars')}, perfect fits ${stat('perfect')}`);
console.log(`towns kept (a 12+ town or a data centre with a town's name) in ${R.filter(r => r.kept >= 1).length}/${RUNS} runs`);
const errs = R.reduce((a, r) => a + r.errors, 0);
console.log(`errors: ${errs}${errs ? '\n' + R.find(r => r.firstErr).firstErr : ''}`);

const dom = R.filter(r => top(r) > 0.60).length;
const dMed = median(R.map(r => r.sh.D || 0));
const kept = R.filter(r => r.kept >= 1).length;
const dreaming = S.CFG.DREAM_EVERY > 0; // the dreams line applies once dreaming is built
const dreamsMed = stat('dreamsReal');
const xOver = R.filter(r => r.sh.X >= 0.10).length;
const pass = dom <= 5 && dMed >= 0.05 && dMed <= 0.30 && kept >= 45 && (!dreaming || dreamsMed >= 5) && xOver === 0 && errs === 0;
if (!pass) process.exitCode = 1;
console.log(`NIGHT PASS CRITERIA (greedy): ${pass ? 'PASS' : 'FAIL'}  [dominance ${dom}<=5, median D ${pct(dMed)} in 5..30%, towns kept ${kept}>=45, dreams come true ${dreaming ? dreamsMed + '>=5' : 'not built yet'}, X>=10% in ${xOver} runs, errors ${errs}]`);
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
