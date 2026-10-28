"""Build the page from src/ (game.html with sim.js and art.js inlined) and data/.

  artifact/numogarden.html  page body for a claude.ai artifact (the publisher adds the doctype, head and viewport)
  docs/index.html           the same page as a complete standalone document, for GitHub Pages and the phone check

Usage: python3 build.py
"""
import json, pathlib
root = pathlib.Path(__file__).parent
html = (root / 'src/game.html').read_text(encoding='utf8')
sim = (root / 'src/sim.js').read_text(encoding='utf8')
art = (root / 'src/art.js').read_text(encoding='utf8')
lore = json.loads((root / 'data/lore.json').read_text(encoding='utf8'))
assert '/*@@SIM@@*/' in html and '/*@@ART@@*/' in html and '/*@@LORE@@*/[]' in html, 'placeholders missing from src/game.html'
assert '</script' not in sim and '</script' not in art, 'sim.js and art.js must not contain a closing script tag'
assert len(lore) == 45, 'lore.json should hold 45 demon descriptions'
body = html.replace('/*@@SIM@@*/', sim).replace('/*@@ART@@*/', art).replace('/*@@LORE@@*/[]', json.dumps(lore, ensure_ascii=False))
(root / 'artifact').mkdir(exist_ok=True); (root / 'docs').mkdir(exist_ok=True)
(root / 'artifact/numogarden.html').write_text(body, encoding='utf8')
# Same minimal skeleton the claude.ai publisher wraps around an artifact, so the page behaves the same in both places.
skel = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}'
        '[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>')
(root / 'docs/index.html').write_text(skel + body + '</body></html>', encoding='utf8')
print(f'built artifact/numogarden.html ({len(body.encode()):,} bytes) and docs/index.html')
