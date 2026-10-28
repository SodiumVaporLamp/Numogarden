"""Phone check: load docs/index.html headless at 390x844 with touch, place 10 tiles by tapping,
tap a tile, then open the info sheet, undo, and reload. Then load a day world and a night world made in the page
(seed 1000), photograph the biggest town's art in each, and tap the night town and a data centre. Pass = 10 placements land and change the
score, the tile tap opens the inspector, undo and reload work, no sideways overflow, a non-blank
canvas, the night world's town and data centre light up with their food and cooling, the explainer
describes roads, settling wild land and doors, and zero console errors.

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
    """A day world made in the page with the real rules (seed 1000, 112 greedy placements, before nightfall), centred on
    its biggest town for a screenshot of the town art. Its heart should draw as a megacity (art tier 5)."""
    made = await page.evaluate('''() => {
      const S = window.Sim, st = S.newGame(1000);
      for (let t = 0; t < 112; t++) {
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
    await page.tap('#closeS'); await page.wait_for_timeout(100)
    res['ok'] = (made['dcSince'] is not None and res['explainer_has_night'] and res['explainer_has_roads']
                 and res['explainer_has_settling'] and res['explainer_has_doors']
                 and all(isinstance(res[T], dict) and res[T]['sheet_names_it'] and res[T]['lit_after_close'] and res[T]['hint_names_it'] and res[T]['tap_clears'] for T in 'HD'))
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
        ok = (placed == 10 and after['turn'] - before['turn'] == 10 and after['stars'] > before['stars']
              and undone == after['turn'] - 1 and reloaded == undone and overflow <= 0 and distinct > 50 and inspector
              and day['ok'] and night['ok'] and not errors)
        print('PHONE CHECK:', 'PASS' if ok else 'FAIL')
        print(json.dumps({'before': before, 'after': after, 'placed': placed, 'inspector_opens': inspector, 'turn_after_undo': undone, 'turn_after_reload': reloaded,
                          'h_overflow_px': overflow, 'distinct_canvas_colours': distinct, 'day_town': day, 'night_world': night, 'errors': errors}, indent=1))
        await b.close()
        return ok
sys.exit(0 if asyncio.run(main()) else 1)
