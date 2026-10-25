/* Follow one seed with the greedy bot and print the big hamlet clusters every 25 placements:
   size, supply contacts, supply needed, and the highest tier the town has reached.
   Usage: node tools/trace.js <seed> [turns=300]
   This is how the "huge city starves and never wakes" failure was found (seed 325679). */
const S = require('../src/sim.js');
const { greedyMove } = require('./bots.js');
const seed = +process.argv[2] || 1000, TURNS = +process.argv[3] || 300;
const state = S.newGame(seed);
for (let t = 0; t < TURNS; t++) {
  while (state.choices > 0) S.choose(state, S.rint(state.rng, 2) ? 'x' : 'r');
  const mv = greedyMove(state); S.place(state, mv.slot, mv.q, mv.r, mv.k);
  if ((t + 1) % 25 === 0) {
    const C = S.clusters(state);
    const rows = C.byType.H.list.filter(g => g.size >= 8).map(g => {
      const sup = new Set();
      for (const x of g.w) {
        const a = (x / 6) | 0, i = x % 6, adj = [a * 6 + (i + 1) % 6, a * 6 + (i + 5) % 6], b = C.nb[x];
        if (b >= 0) adj.push(b * 6 + (i + 3) % 6);
        for (const y of adj) { const c = C.tiles[(y / 6) | 0].w[y % 6]; if (c === 'F' || c === 'S') sup.add(y); }
      }
      const tg = C.tiles[(g.w[0] / 6) | 0].tg[g.w[0] % 6], G = state.groups[tg];
      return `${G && G.name ? G.name : 'unnamed'} size ${g.size} supply ${sup.size} need ${Math.ceil(g.size / S.CFG.SUPPLY_K)} tier ${G ? G.tier : '?'}`;
    });
    const sh = S.shares(state);
    console.log(`t${t + 1}  H ${(100 * sh.H).toFixed(0)}% J ${(100 * sh.J).toFixed(0)}%  | ` + (rows.join(' | ') || 'no town of 8+'));
  }
}
console.log(state.stats);
