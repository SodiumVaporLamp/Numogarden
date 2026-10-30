"""Phone check: load docs/index.html headless at 390x844 with touch, place 10 tiles by tapping,
tap a tile, then open the info sheet, undo, and reload. Then load a day world and a night world made in the page
(seed 1000), photograph the biggest town's art in each, and tap the night town and a data centre. Then photograph
the data-centre art: a big data centre at night, cool and running hot, in worlds the harness's greedy bot makes in the
page. Pass = 10 placements land and change the score, the tile tap opens the inspector, undo and reload work, no
sideways overflow, a non-blank canvas, the night world's town and data centre light up with their food and cooling,
the explainer describes roads, settling wild land and doors, the big data centre's heart draws as a matrioshka with
no tile below campus, a big one runs hot, a closed loop draws and its tile's inspector says so, and zero console
errors.

Google Fonts requests are stubbed because sandboxes often cannot reach them; that only swaps
the typefaces for fallbacks. Drop the two page.route lines to test with real fonts.
Usage: python3 tools/check.py   (needs: pip install playwright && playwright install chromium)
"""
import asyncio, json, sys
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'docs/index.html').as_uri()
TOWN_SHOT = '''() => { // centre the camera on the biggest named town; report the art tiers its tiles got
  const st = __numo.state, v = window.Sim.view(st), big = v.labels.slice().sort((a, b) => b.size - a.size)[0];
  if (!big) return null;
  const h = __numo.hexCenter(big.q, big.r), cam = __numo.cam; cam.x = h[0]; cam.y = h[1] - 0.5; cam.s = 46; __numo.ui.dirty = true;
  const tiers = [...__numo.townArt.values()].map(a => a.ti);
  return { name: big.name, size: big.size, buildings: __numo.townBuildings, top_art_tier: Math.max(0, ...tiers) };
}'''
async def day_town(page):
    """A day world made in the page with the real rules (seed 1000, greedy play until its biggest town reaches 100 wedges,
    placement 127 today, which must come before nightfall), centred on its biggest town for a screenshot of the town art.
    Its heart should draw as a megacity (art tier 5)."""
    made = await page.evaluate('''() => {
      const S = window.Sim, st = S.newGame(1000);
      for (let t = 0; t < 300 && st.level < 4 && Math.max(0, ...S.view(st).labels.map(l => l.size)) < 100; t++) {
        while (st.choices > 0) S.choose(st, t % 2 ? 'x' : 'r');
        let best = null;
        for (let i = 0; i < st.offers.length; i++) for (const [q, r] of S.frontier(st)) for (let k = 0; k < 6; k++) {
          const e = S.evalPlacement(st, S.rot(st.offers[i], k), q, r), sc = e.m * 10 + e.n;
          if (!best || sc > best.sc) best = { sc, i, q, r, k };
        }
        S.place(st, { from: 'offer', i: best.i }, best.q, best.r, best.k);
      }
      localStorage.setItem('numogarden-v1', JSON.stringify({ state: st, cam: { x: 0, y: 0, s: 46 } }));
      return { turn: st.turn, level: st.level };
    }''')
    await page.reload(); await page.wait_for_timeout(900)
    town = await page.evaluate(TOWN_SHOT); await page.wait_for_timeout(300)
    await page.screenshot(path=str(ROOT / 'results/phone-check-town-day.png'))
    res = dict(made, town=town)
    res['ok'] = bool(town and town['buildings'] > 0 and town['top_art_tier'] >= 5 and made['level'] < 4)
    return res
async def night_world(page):
    """A night world made in the page with the real rules (seed 1000, greedy play until data centres have arrived),
    to check the tapped-town highlight: tapping the biggest town names its food, closing the sheet leaves the town lit
    with its food in the hint, a tap on empty ground clears it, and a tapped data centre names its cooling."""
    made = await page.evaluate('''() => {
      const S = window.Sim, st = S.newGame(1000);
      for (let t = 0; t < 400 && !(st.dcSince != null && st.turn >= 220); t++) {
        while (st.choices > 0) S.choose(st, t % 2 ? 'x' : 'r');
        let best = null;
        for (let i = 0; i < st.offers.length; i++) for (const [q, r] of S.frontier(st)) for (let k = 0; k < 6; k++) {
          const e = S.evalPlacement(st, S.rot(st.offers[i], k), q, r), sc = e.m * 10 + e.n;
          if (!best || sc > best.sc) best = { sc, i, q, r, k };
        }
        S.place(st, { from: 'offer', i: best.i }, best.q, best.r, best.k);
      }
      localStorage.setItem('numogarden-v1', JSON.stringify({ state: st, cam: { x: 0, y: 0, s: 46 } }));
      const v = S.view(st);
      return { turn: st.turn, level: st.level, dcSince: st.dcSince, roads: v.roads.filter(r => !r.overgrown).length, roadsFeeding: v.roads.filter(r => r.flow).length };
    }''')
    await page.reload(); await page.wait_for_timeout(900)
    town = await page.evaluate(TOWN_SHOT); await page.wait_for_timeout(300)
    await page.screenshot(path=str(ROOT / 'results/phone-check-town-night.png'))
    # the wedge to tap: the biggest named town's, or a data centre's; the camera moves there and the tap lands on the wedge
    aim = '''(T) => {
      const st = __numo.state, v = window.Sim.view(st), a = Math.PI / 3;
      let best = null;
      for (const k in st.map) { const t = st.map[k], inf = v.info[t.id] || [];
        for (let i = 0; i < 6; i++) { const c = inf[i]; if (t.w[i] !== T || !c || (T === 'H' && !(st.groups[c.tag] || {}).name)) continue;
          if (!best || c.size > best.size) best = { t, i, size: c.size }; } }
      if (!best) return null;
      const h = __numo.hexCenter(best.t.q, best.t.r), cam = __numo.cam; cam.x = h[0]; cam.y = h[1]; __numo.ui.dirty = true;
      const s = __numo.toScreen(h[0] + (Math.cos(a * best.i) + Math.cos(a * (best.i + 1))) / 3, h[1] + (Math.sin(a * best.i) + Math.sin(a * (best.i + 1))) / 3);
      const r = document.getElementById('board').getBoundingClientRect();
      return { x: r.left + s[0], y: r.top + s[1], size: best.size };
    }'''
    res = dict(made, town=town)
    for T, word in (('H', 'food'), ('D', 'cool')):
        pt = await page.evaluate(aim, T)
        if not pt: res[T] = 'none found'; continue
        await page.wait_for_timeout(150)
        await page.touchscreen.tap(pt['x'], pt['y']); await page.wait_for_timeout(500)
        text = await page.evaluate('document.getElementById("sheet").innerText')
        named = 'can feed' in text if T == 'H' else 'can cool' in text
        if T == 'H': res['town_sheet_mentions_road'] = 'road' in text
        if await page.evaluate('!!document.getElementById("closeS")'): await page.tap('#closeS'); await page.wait_for_timeout(250)
        lit = await page.evaluate('__numo.ui.focus && __numo.ui.focus.T')
        hint = await page.evaluate('document.getElementById("hint").textContent')
        if T == 'H': await page.screenshot(path=str(ROOT / 'results/phone-check-night.png'))
        # a tap on empty ground, two hexes clear of any land, clears the highlight (the camera pans there first)
        gap = await page.evaluate('''() => {
          const st = __numo.state, cam = __numo.cam, r = document.getElementById('board').getBoundingClientRect();
          const [q0, r0] = [Math.round(cam.x / 1.5), Math.round(cam.y / Math.sqrt(3) - cam.x / 3)];
          for (let d = 2; d < 40; d++) for (let q = q0 - d; q <= q0 + d; q++) for (let rr = r0 - d; rr <= r0 + d; rr++) {
            if (window.Sim.hexDist(q0, r0, q, rr) !== d) continue;
            let near = false; for (const k in st.map) { const t = st.map[k]; if (window.Sim.hexDist(t.q, t.r, q, rr) <= 1) { near = true; break; } }
            if (near) continue;
            const h = __numo.hexCenter(q, rr); cam.x = h[0]; cam.y = h[1]; __numo.ui.dirty = true;
            const s = __numo.toScreen(h[0], h[1]);
            return { x: r.left + s[0], y: r.top + s[1] };
          }
          return null; }''')
        cleared = None
        if gap:
            await page.wait_for_timeout(100)
            await page.touchscreen.tap(gap['x'], gap['y']); await page.wait_for_timeout(200)
            cleared = await page.evaluate('!__numo.ui.focus && document.getElementById("scrim").hidden')
        res[T] = {'size': pt['size'], 'sheet_names_it': named, 'lit_after_close': lit == T, 'hint_names_it': word in hint, 'tap_clears': cleared}
    await page.tap('#infoBtn'); await page.wait_for_timeout(250)
    res['explainer_has_night'] = await page.evaluate('[...document.querySelectorAll("#sheet summary")].some(s => s.textContent === "Night")')
    res['explainer_has_roads'] = await page.evaluate('document.getElementById("sheet").innerText.includes("build a road")')
    res['explainer_has_settling'] = await page.evaluate('document.getElementById("sheet").textContent.includes("Wild land settles")')
    res['explainer_has_doors'] = await page.evaluate('(t => t.includes("is a door") && t.includes("dreams while it is open"))(document.getElementById("sheet").textContent)')
    res['explainer_has_loops'] = await page.evaluate('document.getElementById("sheet").textContent.includes("closed loop")')
    await page.tap('#closeS'); await page.wait_for_timeout(100)
    res['ok'] = (made['dcSince'] is not None and res['explainer_has_night'] and res['explainer_has_roads']
                 and res['explainer_has_settling'] and res['explainer_has_doors'] and res['explainer_has_loops']
                 and all(isinstance(res[T], dict) and res[T]['sheet_names_it'] and res[T]['lit_after_close'] and res[T]['hint_names_it'] and res[T]['tap_clears'] for T in 'HD'))
    return res

GREEDY = '''([seed, turns, hotMin]) => { // the harness's greedy bot (tools/bots.js), so a seed replays its harness game
  const S = window.Sim, st = S.newGame(seed);
  const move = () => {
    const slots = S.slotTiles(st), cells = S.frontier(st);
    const nbs = cells.map(([q, r]) => S.DIRS.map((d, i) => { const nb = st.map[S.key(q + d[0], r + d[1])]; return nb ? nb.w[(i + 3) % 6] : null; }));
    let best = -1, moves = [];
    for (const s of slots) for (let c = 0; c < cells.length; c++) {
      if (s.kind !== 'n' && st.map[S.key(cells[c][0], cells[c][1])]) continue; // wild ground takes ordinary tiles only
      for (let k = 0; k < (s.kind === 'x' ? 1 : 6); k++) {
        let m = 0, n = 0;
        for (let i = 0; i < 6; i++) { if (!nbs[c][i]) continue; n++; if (S.matches(s.w[(i - k + 6) % 6], nbs[c][i])) m++; }
        const sc = m * 10 + n;
        if (sc > best) { best = sc; moves = [[s, c, k]]; } else if (sc === best) moves.push([s, c, k]);
      }
    }
    const [s, c, k] = moves[S.rint(st.rng, moves.length)];
    return { slot: { from: s.from, i: s.i }, q: cells[c][0], r: cells[c][1], k };
  };
  // with hotMin, stop once a data centre of that size runs hot with a wedge about to fall
  const hot = () => { const v = S.view(st); for (const k in st.map) { const t = st.map[k], inf = v.info[t.id] || [];
    for (let i = 0; i < 6; i++) { const c = inf[i]; if (t.w[i] === 'D' && c && c.size >= hotMin && c.cool < c.need && t.d[i] > 0) return true; } } return false; };
  for (let t = 0; t < turns && !(hotMin && st.dcSince != null && hot()); t++) {
    while (st.choices > 0) S.choose(st, S.rint(st.rng, 2) ? 'x' : 'r');
    const mv = move(); S.place(st, mv.slot, mv.q, mv.r, mv.k);
  }
  localStorage.setItem('numogarden-v1', JSON.stringify({ state: st, cam: { x: 0, y: 0, s: 46 } }));
  return { seed, turn: st.turn, level: st.level };
}'''
DC_SHOT = '''(hot) => { // the camera on the biggest data centre (running hot, for the hot shot), at its top art tile nearest its middle
  const st = __numo.state, v = window.Sim.view(st), cam = __numo.cam, cells = new Map();
  for (const k in st.map) { const t = st.map[k], inf = v.info[t.id] || []; for (let i = 0; i < 6; i++) if (t.w[i] === 'D' && inf[i]) (cells.get(inf[i]) || cells.set(inf[i], new Set()).get(inf[i])).add(t); }
  let best = null; for (const [c, ts] of cells) if ((!hot || c.cool < c.need) && (!best || c.size > best[0].size)) best = [c, ts];
  if (!best) return null;
  const [c, ts] = best, tiles = [...ts], arts = tiles.map(t => __numo.dcArt.get(t.id)), sizes = {};
  for (const a of arts) sizes[a.T] = (sizes[a.T] || 0) + 1;
  let mx = 0, my = 0; for (const t of tiles) { const h = __numo.hexCenter(t.q, t.r); mx += h[0] / tiles.length; my += h[1] / tiles.length; }
  const top = Math.max(...arts.map(a => a.T));
  let aim = null, bd = 1e9; tiles.forEach((t, j) => { const h = __numo.hexCenter(t.q, t.r), d = Math.hypot(h[0] - mx, h[1] - my); if (arts[j].T === top && d < bd) { bd = d; aim = { h, a: arts[j] }; } });
  cam.x = aim.h[0]; cam.y = aim.h[1] - 0.3; cam.s = 46; __numo.ui.dirty = true;
  const names = ['rack', 'server hall', 'data hall', 'campus', 'hyperscale', 'exascale', 'matrioshka'];
  return { name: (st.groups[c.tag] || {}).name || null, size: c.size, cool: c.cool, need: c.need, tiles: tiles.length, top: names[top],
    min: names[Math.min(...arts.map(a => a.T))], split: Object.keys(sizes).sort((a, b) => b - a).map(T => sizes[T] + ' ' + names[T]).join(', '),
    top_tile_hot: aim.a.hot, falling: tiles.reduce((n, t) => n + t.w.filter((w, i) => w === 'D' && t.d[i] > 0).length, 0), pieces: __numo.dcPieces };
}'''
LOOP_AIM = """() => { // the biggest closed loop, centred, and the screen point of one of its tiles
  const st = __numo.state, all = window.Sim.closedLoops(st), L = all.sort((a, b) => b.tiles.length - a.tiles.length)[0];
  if (!L) return null; const byId = {}; for (const k in st.map) byId[st.map[k].id] = st.map[k];
  const ts = L.tiles.map(id => byId[id]), cs = ts.map(t => __numo.hexCenter(t.q, t.r)), cam = __numo.cam;
  cam.x = cs.reduce((a, c) => a + c[0], 0) / cs.length; cam.y = cs.reduce((a, c) => a + c[1], 0) / cs.length; cam.s = 46; __numo.ui.dirty = true;
  const p = __numo.toScreen(cs[0][0], cs[0][1]), r = document.getElementById('board').getBoundingClientRect();
  return { name: L.name, tiles: L.tiles.length, loops: all.length, x: r.left + p[0], y: r.top + p[1] }; }"""
async def loop_world(page):
    """Closed loops: the harness greedy bot's game on seed 1000 after 400 placements, centred on its biggest closed
    loop (a Hold diamond today), photographed, and a tap on one of its tiles, whose inspector should say it is on a
    closed loop."""
    made = await page.evaluate(GREEDY, [1000, 400, 0])
    await page.reload(); await page.wait_for_timeout(900)
    res = dict(turn=made['turn'], loop=await page.evaluate(LOOP_AIM)); await page.wait_for_timeout(300)
    await page.screenshot(path=str(ROOT / 'results/phone-check-loop.png'))
    if res['loop']:
        await page.touchscreen.tap(res['loop']['x'], res['loop']['y']); await page.wait_for_timeout(700)
        res['sheet_says_loop'] = await page.evaluate('document.getElementById("sheet").textContent.includes("On a closed")')
        await page.reload(); await page.wait_for_timeout(500)
    res['ok'] = bool(res['loop'] and res.get('sheet_says_loop'))
    return res
async def dc_world(page):
    """Data-centre art. Cool: the lab sheet's coast, the harness greedy bot's game on seed 183137 after 900 placements,
    centred on its biggest data centre's heart, which should draw as a matrioshka with no tile below campus; the frame
    time there is reported. Hot: seed 40595 played until a data centre of 49+ wedges runs hot with a wedge about to fall,
    photographed while its lights are on (they blink on one shared beat)."""
    made = await page.evaluate(GREEDY, [183137, 900, 0])
    await page.reload(); await page.wait_for_timeout(900)
    cool = await page.evaluate(DC_SHOT, False); await page.wait_for_timeout(300)
    await page.screenshot(path=str(ROOT / 'results/phone-check-dc-night.png'))
    cool['frame_ms'] = await page.evaluate('(() => { const t = []; for (let k = 0; k < 15; k++) t.push(__numo.frameMs()); t.sort((a, b) => a - b); return +t[7].toFixed(1); })()')
    made_hot = await page.evaluate(GREEDY, [40595, 900, 49])
    await page.reload(); await page.wait_for_timeout(900)
    hot = await page.evaluate(DC_SHOT, True); await page.wait_for_timeout(300)
    # wait for the start of the beat's lit half (sin(5t) > 0), so the shot shows the lights on
    await page.evaluate('() => new Promise(done => { const go = () => { const ph = (performance.now() / 200) % (2 * Math.PI); if (ph > 0.2 && ph < 0.6) done(); else requestAnimationFrame(go); }; go(); })')
    await page.screenshot(path=str(ROOT / 'results/phone-check-dc-hot.png'))
    res = {'cool': dict(made, **(cool or {})), 'hot': dict(made_hot, **(hot or {}))}
    res['ok'] = bool(cool and cool['size'] >= 73 and cool['top'] == 'matrioshka' and cool['min'] == 'campus' and not cool['top_tile_hot']
                     and hot and hot['size'] >= 49 and hot['top_tile_hot'] and hot['falling'] > 0)
    return res

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(('console.' + m.type, m.text)) if m.type in ('error',) else None)
        page.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
        await page.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
        await page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
        await page.goto(URL)
        await page.wait_for_timeout(1200)
        before = await page.evaluate('({stars: __numo.state.stars, turn: __numo.state.turn, tiles: Object.keys(__numo.state.map).length})')
        placed = 0
        for n in range(10):
            # the best spot that is on screen (new worlds use a random seed, so the land can grow off-screen)
            pt = await page.evaluate('''() => {
              const u = __numo.ui, r = document.getElementById('board').getBoundingClientRect();
              const at = v => { const c = __numo.hexCenter(v.q, v.r), s = __numo.toScreen(c[0], c[1]); return { x: r.left + s[0], y: r.top + s[1], q: v.q, r: v.r }; };
              const all = u.valid.slice().sort((a, b) => (b.m * 10 + b.n) - (a.m * 10 + a.n)).map(at);
              return all.find(p => p.x > 20 && p.x < r.width - 20 && p.y > 140 && p.y < 620) || all[0];
            }''')
            await page.touchscreen.tap(pt['x'], pt['y'])
            await page.wait_for_timeout(120)
            ghost = await page.evaluate('__numo.ui.ghost')
            if not ghost:
                print('tap did not set a ghost at', pt); continue
            await page.tap('#placeBtn')
            await page.wait_for_timeout(150)
            # close a gift sheet if one opened
            if await page.evaluate('!document.getElementById("scrim").hidden'):
                await page.tap('#pickPlex') if n % 2 == 0 else await page.tap('#pickRumor')
                await page.wait_for_timeout(100)
                if await page.evaluate('!document.getElementById("scrim").hidden'):
                    await page.tap('#later')
            placed += 1
        after = await page.evaluate('({stars: __numo.state.stars, turn: __numo.state.turn, tiles: Object.keys(__numo.state.map).length})')
        overflow = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
        await page.screenshot(path=str(ROOT / 'results/phone-check.png'))
        # blank check: count distinct colours in the canvas
        distinct = await page.evaluate('''() => { const c = document.getElementById('board'), g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) set.add((d[i] << 16) | (d[i+1] << 8) | d[i+2]); return set.size; }''')
        # tapping a tile opens the inspector (in v1 the tap's own click landed on the new scrim and closed it)
        tp = await page.evaluate('''() => {
          const st = __numo.state, r = document.getElementById('board').getBoundingClientRect();
          for (const k in st.map) { const t = st.map[k], h = __numo.hexCenter(t.q, t.r), s = __numo.toScreen(h[0], h[1]);
            if (s[0] > 40 && s[0] < r.width - 40 && s[1] > 140 && s[1] < 620) return { x: r.left + s[0], y: r.top + s[1] }; }
          return null; }''')
        inspector = False
        if tp:
            await page.touchscreen.tap(tp['x'], tp['y']); await page.wait_for_timeout(500)
            inspector = await page.evaluate('!document.getElementById("scrim").hidden && !!document.getElementById("closeS")')
            if inspector: await page.tap('#closeS'); await page.wait_for_timeout(150)
        # exercise sheets and undo
        await page.tap('#infoBtn'); await page.wait_for_timeout(200)
        await page.screenshot(path=str(ROOT / 'results/phone-check-info.png'))
        await page.tap('#closeS'); await page.wait_for_timeout(100)
        await page.tap('#undoBtn'); await page.wait_for_timeout(100)
        undone = await page.evaluate('__numo.state.turn')
        # reload: the world should come back from storage
        await page.reload(); await page.wait_for_timeout(800)
        reloaded = await page.evaluate('__numo.state.turn')
        day = await day_town(page)
        night = await night_world(page)
        dc = await dc_world(page)
        loops = await loop_world(page)
        ok = (placed == 10 and after['turn'] - before['turn'] == 10 and after['stars'] > before['stars']
              and undone == after['turn'] - 1 and reloaded == undone and overflow <= 0 and distinct > 50 and inspector
              and day['ok'] and night['ok'] and dc['ok'] and loops['ok'] and not errors)
        print('PHONE CHECK:', 'PASS' if ok else 'FAIL')
        print(json.dumps({'before': before, 'after': after, 'placed': placed, 'inspector_opens': inspector, 'turn_after_undo': undone, 'turn_after_reload': reloaded,
                          'h_overflow_px': overflow, 'distinct_canvas_colours': distinct, 'day_town': day, 'night_world': night, 'data_centres': dc, 'loops': loops, 'errors': errors}, indent=1))
        await b.close()
        return ok
sys.exit(0 if asyncio.run(main()) else 1)
