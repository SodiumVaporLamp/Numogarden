"""Phone check: load docs/index.html headless at 390x844 with touch, place 10 tiles by tapping,
tap a tile, then open the info sheet, undo, and reload. Pass = 10 placements land and change the
score, the tile tap opens the inspector, undo and reload work, no sideways overflow, a non-blank
canvas, and zero console errors.

Google Fonts requests are stubbed because sandboxes often cannot reach them; that only swaps
the typefaces for fallbacks. Drop the two page.route lines to test with real fonts.
Usage: python3 tools/check.py   (needs: pip install playwright && playwright install chromium)
"""
import asyncio, json, sys
from playwright.async_api import async_playwright
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'docs/index.html').as_uri()
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
        ok = (placed == 10 and after['turn'] - before['turn'] == 10 and after['stars'] > before['stars']
              and undone == after['turn'] - 1 and reloaded == undone and overflow <= 0 and distinct > 50 and inspector and not errors)
        print('PHONE CHECK:', 'PASS' if ok else 'FAIL')
        print(json.dumps({'before': before, 'after': after, 'placed': placed, 'inspector_opens': inspector, 'turn_after_undo': undone, 'turn_after_reload': reloaded,
                          'h_overflow_px': overflow, 'distinct_canvas_colours': distinct, 'errors': errors}, indent=1))
        await b.close()
        return ok
sys.exit(0 if asyncio.run(main()) else 1)
