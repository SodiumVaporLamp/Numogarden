/* Follow one seed with the greedy bot and print the big hamlet clusters every 25 placements:
   size, food (the hamlet wedges its fields and sea can feed, as the rules count it), and the highest tier it has reached.
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
    const C = S.clusters(state), v = S.view(state);
    const rows = C.byType.H.list.filter(g => g.size >= 8).map(g => {
      const t = C.tiles[(g.w[0] / 6) | 0], cell = v.info[t.id][g.w[0] % 6], G = state.groups[t.tg[g.w[0] % 6]];
      return `${G && G.name ? G.name : 'unnamed'} size ${g.size} food ${cell.food.toFixed(1)} tier ${G ? G.tier : '?'}`;
    });
    const sh = S.shares(state);
    console.log(`t${t + 1}  H ${(100 * sh.H).toFixed(0)}% J ${(100 * sh.J).toFixed(0)}%  | ` + (rows.join(' | ') || 'no town of 8+'));
  }
}
console.log(state.stats);
