/* Scripted players for headless runs. greedyMove takes the placement with the most matching edges
   (ties broken by more neighbours, then at random); zoneMove also chases syzygies;
   randomMove places anything anywhere. */
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

/* zone-aware greedy: as greedy, plus ZONEBONUS (env, default 15, i.e. more than one matching edge)
   for every real neighbour whose zone sums to nine with the tile's. A zone ignores rotation. */
const ZONEBONUS = +(process.env.ZONEBONUS || 15);
function cellZones(state, cells) {
  return cells.map(([q, r]) => {
    const o = [];
    for (const d of S.DIRS) { const nb = state.map[S.key(q + d[0], r + d[1])]; if (nb && nb.kind !== 'r') o.push(nb.z); }
    return o;
  });
}
function zoneMove(state) { return greedyMove(state, ZONEBONUS); }

function greedyMove(state, zoneBonus) {
  const slots = S.slotTiles(state), cells = S.frontier(state), nbs = cellNeighbours(state, cells);
  const zs = zoneBonus ? cellZones(state, cells) : null;
  let best = -1, moves = [];
  for (const s of slots) {
    const rots = s.kind === 'x' ? 1 : 6;
    const tz = zs ? S.tileZone({ kind: s.kind, w: s.w }) : 0;
    for (let c = 0; c < cells.length; c++) {
      const nw = nbs[c];
      const zb = zs ? zoneBonus * zs[c].filter(z => z + tz === 9).length : 0;
      for (let k = 0; k < rots; k++) {
        let m = 0, n = 0;
        for (let i = 0; i < 6; i++) {
          if (!nw[i]) continue;
          n++;
          if (S.matches(s.w[(i - k + 6) % 6], nw[i])) m++;
        }
        const sc = m * 10 + n + zb;
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

module.exports = { cellNeighbours, greedyMove, zoneMove, randomMove };
