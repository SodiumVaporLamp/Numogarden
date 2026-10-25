# Numogarden

A zen hex-tile world that builds itself. Match edges, grow towns that wake at critical mass and build into the land around them, and watch the Outside take back what goes untended. As the world grows it gets weirder: tiles start counting their zones, towns add up their own names in AQ, and visitors from the Pandemonium Matrix wander in.

Built by SVL with Claude, October 2026. Demon names, zone pairs and descriptions come from Numogram Lab.

## Quick start

```
python3 build.py              # builds docs/index.html (standalone) and artifact/numogarden.html
open docs/index.html          # play locally
node tools/harness.js         # balance check: 50 seeds x 300 placements, prints PASS or FAIL
python3 tools/check.py        # phone-size browser check (needs playwright + chromium)
```

`CLAUDE.md` has the design, the rules with their numbers, the pass criteria, the tuning history, the next feature (currents) and the backlog. Start there.
