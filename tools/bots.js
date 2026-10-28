/* Scripted players for headless runs. greedyMove takes the placement with the most matching edges
   (ties broken by more neighbours, then at random); zoneMove also chases syzygies;
   randomMove places anything anywhere. Wild ground (a fully wild tile) takes ordinary tiles only. */
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
      if (s.kind !== 'n' && state.map[S.key(cells[c][0], cells[c][1])]) continue; // wild ground takes ordinary tiles only
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
/* door bot, a diagnostic for doors: greedy, but a Plex tile goes beside a Plex tile whenever it can, a zone-9
   tile goes beside a clump to start a Plex current there, and it keeps off the wild land around a clump. */
function doorMove(state) {
  const slots = S.slotTiles(state), cells = S.frontier(state), nbs = cellNeighbours(state, cells);
  const ring = new Set(); // ordinary tiles touching a Plex tile
  for (const k in state.map) {
    const t = state.map[k]; if (t.kind !== 'x') continue;
    for (const d of S.DIRS) { const nk = S.key(t.q + d[0], t.r + d[1]), nb = state.map[nk]; if (nb && nb.kind === 'n') ring.add(nk); }
  }
  const at = cells.map(([q, r]) => {
    let byX = false, wild = 0;
    S.DIRS.forEach((d, i) => {
      const nk = S.key(q + d[0], r + d[1]), nb = state.map[nk]; if (!nb) return;
      if (nb.kind === 'x') byX = true; else if (ring.has(nk) && nb.w[(i + 3) % 6] === 'X') wild++;
    });
    const k = S.key(q, r);
    return { byX, wild, under: !!state.map[k], ringed: ring.has(k) };
  });
  let best = -Infinity, moves = [];
  for (const s of slots) {
    const rots = s.kind === 'x' ? 1 : 6, z9 = s.kind === 'n' && S.tileZone({ kind: 'n', w: s.w }) === 9;
    for (let c = 0; c < cells.length; c++) {
      const a = at[c];
      if (a.under && s.kind !== 'n') continue;
      const bonus = (s.kind === 'x' && a.byX ? 1000 : 0) + (z9 && a.byX ? 100 : 0) - (s.kind === 'n' ? 500 * a.wild : 0) - (a.under && a.ringed ? 1000 : 0);
      const nw = nbs[c];
      for (let k = 0; k < rots; k++) {
        let m = 0, n = 0;
        for (let i = 0; i < 6; i++) { if (!nw[i]) continue; n++; if (S.matches(s.w[(i - k + 6) % 6], nw[i])) m++; }
        const sc = m * 10 + n + bonus;
        if (sc > best) { best = sc; moves = [[s, c, k]]; } else if (sc === best) moves.push([s, c, k]);
      }
    }
  }
  const [s, c, k] = moves[S.rint(state.rng, moves.length)];
  return { slot: { from: s.from, i: s.i }, q: cells[c][0], r: cells[c][1], k };
}
function randomMove(state) {
  const slots = S.slotTiles(state), cells = S.frontier(state);
  const s = slots[S.rint(state.rng, slots.length)];
  const open = s.kind === 'n' ? cells : cells.filter(([q, r]) => !state.map[S.key(q, r)]), c = open[S.rint(state.rng, open.length)];
  return { slot: { from: s.from, i: s.i }, q: c[0], r: c[1], k: S.rint(state.rng, 6) };
}

module.exports = { cellNeighbours, greedyMove, zoneMove, randomMove, doorMove };
