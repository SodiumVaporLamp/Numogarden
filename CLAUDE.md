# Numogarden

A zen hex-tile game for the browser, played mostly on an iPhone. You place land; the land builds and unbuilds itself. Underneath the cozy surface sits a Numogram/Ccru layer (zones, syzygies, AQ, the Pandemonium Matrix) that shows itself as the world grows. v1 was built in one claude.ai session in October 2026; this file is the handoff.

## Rules for working here

- **Credit and pseudonymity.** The author publishes as **SVL**. Never put their real name in the page, commits, file contents or anything public. The page's credit line is `Built by SVL with Claude, <Month Year>.` Update the month when a new version ships.
- **Edit `src/`, never `artifact/` or `docs/`.** Those two are build output (`python3 build.py`).
- **The rules engine stays pure.** `src/sim.js` has no DOM, no clock and no `Math.random`. All randomness goes through `state.rng`, so a seed replays exactly and the harness means something. The renderer may use time for animation only.
- **Every rules change goes through the harness** (see Testing). The pass line is pre-registered. If a change fails it, report the numbers. Don't quietly retune until it passes. When you do retune, confirm on a fresh seed set you have not looked at, and note which one.
- **Lore comes from Numogram Lab, never from memory.** Demon names and zone pairs in `sim.js` (`DEMONS`) are identical to the Lab's `DEMON_TABLE`. The 45 one-line descriptions in `data/lore.json` are the Lab's own paraphrases (its `DEMON_LORE[].t`), checked in order against the mesh numbers. AQ is the Lab's: A=10 … Z=35, digits at face value, zone = digital root. Don't add quotations from Land or the Ccru. Event and help text stays original.
- **Tone.** Cute on the surface, weird underneath, and the weirdness is earned by growth. Copy is plain and short: no em-dash asides, no "not X but Y", no emoji. Name things the way a player would.
- **The author decides scope.** Suggest additions in a line; don't build them unasked.

## Design principles

- **Zen.** Endless deck, no fail state, no timers.
- **No monetization.** No ads or monetization hooks, ever, and none of the scarcity tricks freemium games use.
- **Emergence over scripting.** A few rules that pull against each other, one verb per terrain. Cut any rule that doesn't interact with another.
- **Weirdness earns its place.** Weird elements do something in the rules, and the weirdness escalates with growth.
- **Order.** Backlog items are all welcome candidates, but currents come first.

## Files

```
src/sim.js        rules engine: state, placement, scoring, clusters, the living rules, events (Node + browser)
src/game.html     the page: rendering, input, tray, sheets, saving. Placeholders /*@@SIM@@*/ and /*@@LORE@@*/
data/lore.json    45 demon descriptions from Numogram Lab, indexed by mesh number
build.py          inlines sim + lore -> artifact/numogarden.html (claude.ai) and docs/index.html (standalone)
tools/bots.js     scripted players: greedy (most matching edges), zone-aware greedy, and random
tools/harness.js  N seeds x T placements with all three bots; prints stats and the PASS line; exits 1 on FAIL
tools/trace.js    follow one seed and print the big towns every 25 placements (supply, need, tier)
tools/check.py    headless phone check (Playwright, 390x844, touch); exits 1 on FAIL
results/          baseline harness output for three seed sets, and phone-check screenshots
```

Requirements: Node 18+ and Python 3 with `pip install playwright && playwright install chromium` (only for the phone check).

## Workflow

```
node tools/harness.js                         # 50 seeds x 300 placements, seeds 1000 + i*7919
SEEDBASE=500000 node tools/harness.js         # held-out set
SEEDBASE=900000 node tools/harness.js         # second held-out set
SEEDBASE=1300000 node tools/harness.js        # added with currents (seen while fixing Hold)
SEEDBASE=1700000 node tools/harness.js        # added with currents (confirmation set)
node tools/harness.js 20 1000                 # long-game drift check (diagnostic, no pass line)
node tools/harness.js 50 300 '{"CRIT":22}'    # try a CFG override without editing the file
node tools/trace.js 325679                    # look inside one run
python3 build.py && python3 tools/check.py    # build the page and run the phone check
```

## The game as built (v1)

**Board.** Flat-top hexes in axial coordinates. `DIRS[i]` is the neighbour across edge i (edge midpoints at 30+60i degrees). Each tile is six wedges; wedge i faces edge i and touches wedge `(i+3)%6` of that neighbour, and wedges i and i+1 of the same tile touch each other. Terrains: **H** Hamlet (little compute towns with glowing windows), **F** Field (the corpus), **J** Jungle (the Outside), **S** Sea (Lemurian), plus **M** Meadow (land in between) and **X** Plex (wild). M matches F and J; X matches everything.

**Tiles.** Endless deck, no fail state. Three offers plus up to four gift tiles in hand. Generated tiles have 1–3 contiguous terrain arcs, weighted H .26, F .26, J .28, S .20. A new world starts with a fixed first tile and five greedy placements, the "seed island".

**Zones.** A tile's zone is the AQ total of its six terrain letters reduced to one digit (e.g. `HHFFSJ` = 111 → 3, Warp). Plex tiles are zone 0. Zones recompute whenever a tile's wedges change, so the land shifting moves the zones. Regions use the Lab's colours: Time-Circuit 1,2,4,5,7,8 gold; Warp 3,6 violet; Plex 9,0 crimson.

**Scoring.** One star per matching edge. A **clean fit** is every touched edge agreeing with at least 2 neighbours. Clean fits add 1 to the gift meter and **snug** fits (3+ neighbours) add 2 and a bonus star. A streak of clean fits adds up to +4. A **perfect fit** (4+ neighbours, all agreeing) adds 2 stars per edge and puts a Plex tile in hand. A full meter (15) gives a **gift choice**: a Plex tile, or a **Rumor**. A rumor is a ghost tile that becomes real (+10 stars, a visitor) once 3 real neighbours match it, and fades after 15 placements otherwise. Rumors count as neighbours for matching but not for clusters.

**Syzygies.** At weirdness 1+, placing a tile whose zone sums to 9 with a neighbour's gives +3 stars and summons that syzygy's demon as a lemur, if it isn't already present. Uttunul 9::0, Murrumur 8::1, Oddubb 7::2, Djynxx 6::3, Katak 5::4. A perfect fit also summons the demon between the two zones. A rumor coming true and the jungle reaching 30 wedges each summon one too. Lemurs are cosmetic in v1. They wander near where they arrived, at most 10, and tapping one shows its card with the Lab's description and its AQ home check.

**Currents.** From weirdness 1, two adjacent real tiles whose zones sum to 9 carry the current named by the difference of their zones, as in the Lab. It runs from the higher zone to the lower. A current keeps flowing for `CURRENT_LINGER` (3) steps after its syzygy breaks, so land that shifts zones back and forth doesn't make it flicker. Clearing either tile ends it. Each current acts once per step on its two tiles and every real tile touching either (`currentFx()` in sim.js):

| pair | current | carrier | effect |
|---|---|---|---|
| 9::0 | Plex | Uttunul | Every `PLEX_EVERY` (5) steps one wedge in the area turns wild, while X is under `PLEX_CAP` (8%) of all wedges. |
| 8::1 | Surge | Murrumur | Hamlet clusters touching the area get +`SURGE_BONUS` (0.25) build chance and wake after half the maturity. |
| 7::2 | Hold | Oddubb | The tiles around the pair, but not the pair itself, get no decay and no scheduled changes. It can keep a starving town alive. |
| 6::3 | Warp | Djynxx | Time-lapse: decay and self-building in the area tick twice per step. |
| 5::4 | Sink | Katak | The most worn H or F wedge in the area gains a point of decay. It clears land and opens it to the jungle. |

Nothing can be scheduled on a held tile, so Hold also blocks Sink and Plex there. `CFG.CURRENT_FX = false` keeps the tracking but turns the effects off, which replays v1 exactly; the harness uses it as its baseline. Warp is the common current and the others are rarer finds (tuning history 8).

**Time.** The world advances one step per placement, never in real time, so walking away changes nothing. Each step (`step()` in sim.js):
1. Commit last step's pending changes (each re-validated), then lay any planned metropolis tiles.
2. Recompute clusters per terrain with union-find. X wedges join clusters of every type but don't count toward size.
3. Tag clusters with persistent group ids, which survive merges and shrinkage, and fire tier events (names, builders, ferries, harvests).
4. Update the currents (weirdness 1+).
5. Apply the living rules and the currents' effects, which schedule next step's changes. Those wedges glow on the board.
6. Settle rumors and level up the weirdness.

**The living rules (CFG in sim.js).**
- Supply: a hamlet cluster's supply is the number of distinct F or S wedges touching it. It needs `ceil(size / SUPPLY_K)` with SUPPLY_K = 3. This is linear on purpose (see the tuning history).
- Hunger: clusters of `STARVE_MIN` (4)+ without enough supply decay one wedge at a time, preferring the most exposed. After `DECAY_T` (3) hungry steps a wedge becomes meadow. Fed clusters reset their decay.
- Fallow fields: a field cluster touching no hamlet goes fallow beside a jungle of `FALLOW_J` (6)+, using the same decay to meadow.
- Reclamation: meadow next to jungle turns jungle with p 0.35 per step. A jungle of `JCRIT` (12)+ takes neglected (decaying) H/F wedges with p 0.3.
- Waking up: a hamlet group is a **town** at 12 wedges. It can **wake** after `MATURE` (30) steps as a town, if it is at critical mass (`CRIT` = 24, or 12+ for a town that already hit city tier once) or very well fed (supply ≥ `FLUSH` (2) × need). It also has to be fed, with slack for one more wedge.
- Self-building: an awake town builds into a neighbouring wedge with p = 0.35 + 0.02 per wedge above CRIT (max 0.85). Trade (two towns on one sea) adds +0.15, a homed name +0.10, and a large town gets more tries. Target preference: meadow 4, jungle 3, field 1, never sea or Plex. Eating its own fields can starve it, and that oscillation is intended.
- Metropolis (40+): every 10 steps, if fed, it plans a whole new tile on an empty edge, built to match its neighbours. It glows as a dashed crimson hex for one step.
- Tiers: H 1/6/12/24/40 (hamlet, village, town, city, metropolis). S 10/20/35 give ferries 1/1/2. J 12/30. F 10/25 give harvest stars 5/10. A village names itself from a syllable generator. If the name's AQ zone equals the founding tile's zone it is **homed** (shown from weirdness 2).
- Builders, earned at town (1), city (1) and metropolis (2), clear one tile. Ferries let you place up to 3 hexes from land.

**Weirdness** (`LEVELS` = stars 0/45/130/280/520):
1. Tiles show zones; syzygies and lemurs start.
2. Towns show AQ readouts; fields turn to dashed tokens; violet roofs and antennas.
3. Houses grow eyes that follow your finger; the ground dusks; eyes in deep jungle.
4. Night, lit windows, and animated currents drawn between syzygy pairs, running from the higher zone to the lower, coloured by the region of their difference.

**Page.** One-screen canvas game. HUD (wordmark, stars, gift meter, weirdness pips), tray (offers plus gifts), tools (Undo, Turn, Place, Build, Ferry), sheets (gift choice, tile inspector, lemur card, info with chronicle and New world). Controls:
- Tap a spot to preview at the best rotation, tap the preview to turn it, then Place.
- Drag to pan and pinch to zoom; wheel zoom and keys R, Enter and Z on desktop.

Saved to localStorage under `numogarden-v1` (wrapped in try/catch). Undo is 30 deep in memory. One deliberate light look, no dark theme; it dusks with weirdness instead. Fonts: Major Mono Display (wordmark, zone numerals, demon names, as on the SVL pages), Baloo 2 (UI), IBM Plex Mono (readouts). Honours prefers-reduced-motion.

## Testing

**Pre-registered pass line** (greedy bot, 50 seeds × 300 placements). All must hold:
- No single terrain above 60% of wedges at the end in more than 5 of 50 runs.
- Every run has at least one self-build and at least one jungle reclamation after placement 50.
- The median placement of the first self-build is between 60 and 180. The cozy phase comes first.
- Zero errors.
- No current's share of current tile-steps rises more than 10 points above its share on the same seeds with current effects off (`CFG.CURRENT_FX = false`). Added with the currents work, before any effect was built.
- No run has Plex (X) at 10% or more of wedges at placement 300.

The harness prints the same criteria for the **zone-aware bot** (greedy plus `ZONEBONUS`, default 15, per syzygy it creates) as a diagnostic. It does not gate.

**Current shares with no effects** (greedy, 300): Warp 52–53%, Hold 23–26%, Sink 10%, Plex 6–8%, Surge 7%. The zone bot evens them out (Warp 38%). See tuning history 8 for why Warp dominates. With effects on, the shares move by 4.5 points at most. Sink falls to about 5%, because wearing land down changes zones and breaks its own pairs.

**Baseline** (`results/`), identical config, with currents:

| seeds | pass line | max terrain share | runs with no self-build / no reclaim after 50 | median first self-build | biggest current rise | X max at t300 | errors |
|---|---|---|---|---|---|---|---|
| 1000 (tuning set) | PASS | 47.0% | 0 / 0 | 71.5 | Hold +1.2 | 8.6% | 0 |
| 500000 (held out) | PASS | 47.1% | 0 / 0 | 79 | Hold +4.5 | 8.7% | 0 |
| 900000 (held out) | PASS | 46.8% | 0 / 0 | 62.5 | Warp +3.2 | 8.5% | 0 |
| 1300000 (seen during the Hold fix) | FAIL | 46.8% | 1 / 0 | 67 | Surge +2.4 | 8.7% | 0 |
| 1700000 (untouched until the final check) | FAIL | 45.9% | 1 / 0 | 86 | Hold +1.9 | 8.3% | 0 |

Both failures are one stalled run in 50 (tuning history 10). The v1 rules fail 1300000 the same way and pass 1700000. v1's own numbers are in git history.

Other things the harness shows:
- Greedy end shares at 300 with currents: about H 15–17%, F 17%, J 38%, S 20%, M 2%, X 7%. Currents add churn: about 260 decline and 270 reclaim per run, against 170 and 240 in v1.
- **Long games** (`results/harness-drift-600.txt`, 20 seeds × 600): jungle keeps gaining slowly, from 37% at 300 to 39%, 41% and 43% at 400, 500 and 600. Hamlets fall from 18% to 14%, and the highest single-terrain share in any run is 46%. That is no runaway by 600, but it isn't clearly settled either. Run a 1000+ check once currents add Sink.
- **The random bot** gets a town to wake in fewer than half the runs (20 to 24 of 50 with currents, 23 to 29 in v1), and late. Careful play matters, which is intended.

**Phone check** (`tools/check.py`) on docs/index.html at 390×844 with touch:
- 10 tap-driven placements land and raise the score.
- Undo works, and the world comes back from storage on reload.
- No sideways overflow, the canvas is not blank, and there are zero console errors.

It passed on v1 with Google Fonts stubbed; the sandbox couldn't reach them.

**Lore check:** `DEMONS` equals the Lab's `DEMON_TABLE`, and `lore.json` order matches the mesh numbers. Both were verified by script when v1 was built.

## Tuning history: what failed and why the rules look like this

1. **Towns woke far too early.** With critical mass at 10 the median first self-build came at turn 18, so there was no cozy phase. CRIT went up.
2. **Rewards never fired.** The first reward tiers were 4/5/6 matching edges. The greedy bot almost never places into a spot with 4+ neighbours (about 1% of placements), so it got no Plex tiles or rumors at all. Rewards were rebuilt around *clean fits* (every touched edge agrees), with perfect fits kept as the rare top tier.
3. **Wilds flooded the map.** With the meter at 6, Plex tiles reached 7.7% of all wedges. The meter went to 15, which gives about 3%.
4. **A huge player-built town starved and never woke** (seed 325679). It peaked at 92 wedges with supply for 75 and shrank slowly, so it never had the slack to sprawl.
5. **Sub-linear supply created a runaway.** Making big towns need less supply per wedge let a seaside city reach **75% of the map in every run**: sea contacts never get eaten, so it was always fed. Supply went back to linear. This is the main damping in the game; keep it.
6. **Critical mass 22 passed at exactly 60** on the tuning seeds. That's no margin.
7. **Overfit to the tuning seeds.** A version that passed on the tuning set **failed on held-out seeds**: median 47, and one run with no self-build after turn 50. The fix was structural: the maturity rule (30 steps as a town), the well-fed wake rule, and critical mass back at 24. That combination passes on all three sets.
8. **Warp dominates by arithmetic.** The first draft of the currents criterion was "no current type above 50% of current tile-steps". It failed before any effect existed: Warp held 52–53% on all three seed sets. Modulo 9, H = 8, F = 6 and J = S = 1, so a tile's zone depends only on its H and F counts. All-jungle and all-sea tiles are zone 6 and all-hamlet tiles zone 3, so Warp (6::3) forms wherever towns meet the Outside. The AQ is the Lab's and can't be tuned, so the author re-registered the criterion relative to the no-effects baseline, before building the mechanic.
9. **Hold kept itself alive.** In the first build of currents, Hold froze its whole area, including its own pair. The pair's zones could never change, so a Hold current lasted until a builder cleared one of its tiles. Hold rose 18–20 points over the no-effects baseline on all four sets then in use (1000, 500000, 900000, 1300000), reclamation fell by half, and one tuning-set run never self-built. The author chose to make Hold a calm eye: it holds the tiles around its pair but not the pair itself, so the pair can still shift and break. The rises dropped to 1–4.5 points. The zone-aware bot still pushes Hold up 18–23 points, so a player who chases zones will see a lot of Hold.
10. **A rare stall on fresh seeds.** The two sets added with currents each have one greedy run in 50 with no self-build after placement 50: 1300000 (seen while fixing Hold) and 1700000 (untouched until the final check). The v1 rules also fail 1300000 (seed 1323757, with currents off) and pass 1700000. With currents the stalled runs are seeds 1315838 and 1874218. `node tools/trace.js 1874218` shows the pattern: the map fills with fed towns stuck at 19–21 wedges for 200 placements. They sit below critical mass, aren't fed well enough to wake early (supply 2× need), and nothing in the rules grows a settled town. The one town that passed 24 was starving and shrank. The author accepted currents with this on record, and the stall gets its own fix.

## Next (agreed with the author)

- **Currents on the page.** Draw currents from weirdness 1, faint, and bright at night. Tint the area very lightly in the current's region colour. When the preview would open a current, the hint names it (e.g. "opens a Hold current (7::2)"). The inspector lists currents touching a tile.
- **Cities that reinforce themselves**, the Landian thread. From city tier (24 wedges):
  - Hungry city wedges fall after 6 steps instead of 3.
  - A big jungle takes a decaying city wedge with p 0.1 instead of 0.3. Fields stay at 0.3.
  - Self-building climbs with size twice as fast: +0.04 per wedge above CRIT instead of 0.02, and an extra try per 10 wedges above CRIT instead of 20. Supply stays linear (tuning history 5).
  - The protection is off inside a Sink area, against a deep jungle (30+), and for a city with under half the supply it needs.
  - Build it as its own commit after the page, and check it on a fresh seed set.
- **The stall** (tuning history 10). How to fix it is the author's call. Grokking, from the backlog, is one candidate.

For currents the author took the spec's defaults: the pair and its neighbours as the area, a 3-step linger, weirdness 1, and the strengths as proposed.

## Backlog (from the brainstorm, not yet scoped)

- **Lemurs with jobs.** The five syzygy demons carry their currents around the map. The other 40 act by class: chronodemons nudge time, amphidemons swap tiles, xenodemons turn wedges wild or make a tile vanish. Some lore lines suggest verbs:
  - Oddubb, the broken mirror, flips a tile.
  - Tikkitix, the whirler, spins tiles.
  - Ababbatok, the regenerator, heals decay.
- **Name your own towns.** Type a village's name; its AQ sets its zone, and a homed name earns the growth bonus. This is the Lab's name-hunting as a mechanic.
- **Rumors with prophecies.** A rumor carries a prediction ("a city will stand on this sea"). If it comes true within N placements it becomes canon in the chronicle, with a big reward. There is no failure state.
- **The city that plays back.** A metropolis past some size places its own tiles to grow itself, as an agent sharing the map. Fed mostly by other hamlets instead of fields, it suffers model collapse and turns monotone; the Outside restores variety.
- **Smaller ones:**
  - Eyes look toward the next wedge about to change, as a hint.
  - Night rules at weirdness 4: jungle faster, lit cities hold it back.
  - Grokking: a town stuck at one size for a long time jumps a tier.

## Known limitations

- **A world can stall.** About one greedy run in 50 ends up with only fed towns below critical mass, and nothing builds itself (tuning history 10).
- **Perfect fits are rare.** Spots with 4+ neighbours are uncommon, so most Plex tiles and rumors come from the gift meter.
- **Jungle slowly gains ground** over long games: 43% at placement 600 for the greedy bot and still creeping. Watch it once currents add Sink.
- **Lemur cards are hard to open.** Lemurs are small to tap (0.3-hex hit radius).
- **Undo isn't saved.** The stack lives in memory only, so a reload clears it.
- **The live-reload hook is a guess.** `window.claude.hot` snapshot/ready keeps a game going across artifact republishes. Its exact API was guessed and every call is guarded; it does nothing outside claude.ai.
- **Untested at scale.** Performance was fine in the check, but very large worlds (500+ tiles) haven't been profiled on a phone. The renderer culls off-screen tiles and skips decorations when zoomed far out.

## Publishing

- **GitHub Pages** (like Numogram Lab): commit `docs/` and turn on Pages from the main branch, `/docs` folder.
- **The claude.ai artifact** for v1 is https://claude.ai/artifact/HDjvCNwfbtUES2M1xU2SNY (private to the author). To update it, bring `artifact/numogarden.html` to a claude.ai chat and ask Claude to republish it to that URL. Claude reads the artifact first, then publishes with `url` set, so the link stays the same.
- **Saves are per site.** The Pages copy and the artifact keep separate worlds.
