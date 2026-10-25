/* Scripted players for headless runs. greedyMove takes the placement with the most matching edges
   (ties broken by more neighbours, then at random); randomMove places anything anywhere. */
const S = require('../src/sim.js');

function cellNeighbours(state, cells) {
  return cells.map(([q, r]) => {
    const o = [];
    for (let i = 0; i < 6; i++) {
      const nb = state.map[S.key(q + S.DIRS[i][0], r + S.DIRS[i][1])];
      o.push(nb ? nb.w[(i + 3) % 6] : null);
    }
    return o;
  });
}

function greedyMove(state) {
  const slots = S.slotTiles(state), cells = S.frontier(state), nbs = cellNeighbours(state, cells);
  let best = -1, moves = [];
  for (const s of slots) {
    const rots = s.kind === 'x' ? 1 : 6;
    for (let c = 0; c < cells.length; c++) {
      const nw = nbs[c];
      for (let k = 0; k < rots; k++) {
        let m = 0, n = 0;
        for (let i = 0; i < 6; i++) {
          if (!nw[i]) continue;
          n++;
          if (S.matches(s.w[(i - k + 6) % 6], nw[i])) m++;
        }
        const sc = m * 10 + n;
        if (sc > best) { best = sc; moves = [[s, c, k]]; } else if (sc === best) moves.push([s, c, k]);
      }
    }
  }
  const [s, c, k] = moves[S.rint(state.rng, moves.length)];
  return { slot: { from: s.from, i: s.i }, q: cells[c][0], r: cells[c][1], k };
}
function randomMove(state) {
  const slots = S.slotTiles(state), cells = S.frontier(state);
  const s = slots[S.rint(state.rng, slots.length)], c = cells[S.rint(state.rng, cells.length)];
  return { slot: { from: s.from, i: s.i }, q: c[0], r: c[1], k: S.rint(state.rng, 6) };
}

module.exports = { cellNeighbours, greedyMove, randomMove };
