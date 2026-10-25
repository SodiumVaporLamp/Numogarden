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
tools/night.js    50 seeds x 600 placements, greedy only; night and data-centre stats and the NIGHT PASS line; exits 1 on FAIL
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
SEEDBASE=2100000 node tools/harness.js        # added with the city rule (seen while fixing it)
SEEDBASE=2500000 node tools/harness.js        # added with the city rule (confirmation set)
SEEDBASE=2900000 node tools/harness.js        # added with grokking (confirmation set for its first version)
SEEDBASE=3300000 node tools/harness.js        # added with grokking (confirmation set for 18+ towns)
SEEDBASE=3700000 node tools/harness.js        # added with maturity 40 (confirmation set)
SEEDBASE=4100000 node tools/harness.js        # added with data centres (confirmation set; night check too)
node tools/harness.js 20 1000                 # long-game drift check (diagnostic, no pass line)
node tools/night.js                           # night check for data centres (50 x 600, greedy)
node tools/harness.js 50 300 '{"CRIT":22}'    # try a CFG override without editing the file
node tools/trace.js 325679                    # look inside one run
python3 build.py && python3 tools/check.py    # build the page and run the phone check
```

## The game as built (v1)

**Board.** Flat-top hexes in axial coordinates. `DIRS[i]` is the neighbour across edge i (edge midpoints at 30+60i degrees). Each tile is six wedges; wedge i faces edge i and touches wedge `(i+3)%6` of that neighbour, and wedges i and i+1 of the same tile touch each other. Terrains: **H** Hamlet (little compute towns with glowing windows), **F** Field (the corpus), **J** Jungle (the Outside), **S** Sea (Lemurian), **D** Data centre (night only), plus **M** Meadow (land in between) and **X** Plex (wild). M matches F and J; D matches only D and X; X matches everything.

**Tiles.** Endless deck, no fail state. Three offers plus up to four gift tiles in hand. Generated tiles have 1–3 contiguous terrain arcs, weighted H .26, F .26, J .28, S .20. At night, once a town has built itself since nightfall, D takes F's weight (see Data centres). A new world starts with a fixed first tile and five greedy placements, the "seed island".

**Zones.** A tile's zone is the AQ total of its six terrain letters reduced to one digit (e.g. `HHFFSJ` = 111 → 3, Warp). Plex tiles are zone 0. Zones recompute whenever a tile's wedges change, so the land shifting moves the zones. Regions use the Lab's colours: Time-Circuit 1,2,4,5,7,8 gold; Warp 3,6 violet; Plex 9,0 crimson.

**Scoring.** One star per matching edge. A **clean fit** is every touched edge agreeing with at least 2 neighbours. Clean fits add 1 to the gift meter and **snug** fits (3+ neighbours) add 2 and a bonus star. A streak of clean fits adds up to +4. A **perfect fit** (4+ neighbours, all agreeing) adds 2 stars per edge and puts a Plex tile in hand. Once wild land is at `PLEX_CAP` (8%) of the map, any Plex tile from a fit or a gift turns into +5★ instead, like a full hand. A full meter (15) gives a **gift choice**: a Plex tile, or a **Rumor**. A rumor is a ghost tile that becomes real (+10 stars, a visitor) once 3 real neighbours match it, and fades after 15 placements otherwise. Rumors count as neighbours for matching but not for clusters.

**Syzygies.** At weirdness 1+, placing a tile whose zone sums to 9 with a neighbour's gives +3 stars and summons that syzygy's demon as a lemur, if it isn't already present. Uttunul 9::0, Murrumur 8::1, Oddubb 7::2, Djynxx 6::3, Katak 5::4. A perfect fit also summons the demon between the two zones. A rumor coming true and the jungle reaching 30 wedges each summon one too. Lemurs are cosmetic in v1. They wander near where they arrived, at most 10, and tapping one shows its card with the Lab's description and its AQ home check.

**Currents.** From weirdness 1, two adjacent real tiles whose zones sum to 9 carry the current named by the difference of their zones, as in the Lab. It runs from the higher zone to the lower. A current keeps flowing for `CURRENT_LINGER` (3) steps after its syzygy breaks, so land that shifts zones back and forth doesn't make it flicker. Clearing either tile ends it. Each current acts once per step on its two tiles and every real tile touching either (`currentFx()` in sim.js):

| pair | current | carrier | effect |
|---|---|---|---|
| 9::0 | Plex | Uttunul | Every `PLEX_EVERY` (5) steps one wedge in the area turns wild, while X is under `PLEX_CAP` (8%) of all wedges. |
| 8::1 | Surge | Murrumur | Hamlet clusters touching the area get +`SURGE_BONUS` (0.25) build chance and wake after `SURGE_MATURE` (half) the maturity. |
| 7::2 | Hold | Oddubb | The tiles around the pair, but not the pair itself, get no decay and no scheduled changes. It can keep a starving town alive. |
| 6::3 | Warp | Djynxx | Time-lapse: decay and self-building in the area tick twice per step (`WARP_TRIES` for building). |
| 5::4 | Sink | Katak | The most worn H or F wedge in the area gains a point of decay. It clears land and opens it to the jungle. |

Nothing can be scheduled on a held tile, so Hold also blocks Sink and Plex there. `CFG.CURRENT_FX = false` keeps the tracking but turns the effects off, which replays v1 exactly; the harness uses it as its baseline. Warp is the common current and the others are rarer finds (tuning history 8).

**Data centres (night).** SVL's lead idea, built 2026-10-25. At night (weirdness 4), once a town has built itself since nightfall (`nightDeck`, tuning history 15), the corpus is spent: Field leaves the deck and data-centre tiles (terrain **D**) take its 0.26 weight. The chronicle says "The fields are spent. Data centres start to arrive." D clusters like the other terrains and matches only D and X. A whole D tile is AQ 78, zone 6, so beside a whole hamlet tile (zone 3) it opens Djynxx's Warp current: the machines speed up the towns next to them. One need and two verbs:
- Cooling, by sea only: a D cluster needs one sea contact per `COOL_K` (6) D wedges, on the supply pattern. Short of that, its most exposed D wedge runs hot and falls to meadow after `DECAY_T` steps, and jungle follows. Hold and Warp act on it as on hunger.
- Absorbing: a starving hamlet wedge beside D becomes D instead of meadow. An unnamed data centre that absorbs part of a named town takes its name ("Numbleford is becoming a data centre."), and a town absorbed whole is reported as part of a data centre instead of taken by the Outside.
- Dreaming: every `DREAM_EVERY` (6) steps a cooled cluster queues a rumor on one of its open edges, laid next step like metropolis tiles. Its arcs are as in `genTile`, with terrains weighted by the H/F/J/S wedges the cluster touches, so it can dream fields back. The rumor rules then apply: 3 real matching neighbours make it real (+10★, a visitor), and it fades after 15. Only the first dream and dreams that come true get a chronicle line.

No rule eats fields: towns live on fields or sea as before, so inland towns run short at night. Dreams made perfect fits common, which is why `PLEX_CAP` covers Plex tiles too (tuning history 16). A scratch prototype on the v1 rules (587916c) shaped these rules; every number here was re-measured on the current rules.

**Time.** The world advances one step per placement, never in real time, so walking away changes nothing. Each step (`step()` in sim.js):
1. Commit last step's pending changes (each re-validated), then lay any planned metropolis tiles.
2. Recompute clusters per terrain with union-find. X wedges join clusters of every type but don't count toward size.
3. Tag clusters with persistent group ids, which survive merges and shrinkage, and fire tier events (names, builders, ferries, harvests).
4. Update the currents (weirdness 1+).
5. Apply the living rules and the currents' effects, which schedule next step's changes. Those wedges glow on the board.
6. Settle rumors and level up the weirdness.
7. At night, switch the deck to data centres once a town has built itself since nightfall.

**The living rules (CFG in sim.js).**
- Supply: a hamlet cluster's supply is the number of distinct F or S wedges touching it. It needs `ceil(size / SUPPLY_K)` with SUPPLY_K = 3. This is linear on purpose (see the tuning history).
- Hunger: clusters of `STARVE_MIN` (4)+ without enough supply decay one wedge at a time, preferring the most exposed. After `DECAY_T` (3) hungry steps a wedge becomes meadow. Fed clusters reset their decay.
- Fallow fields: a field cluster touching no hamlet goes fallow beside a jungle of `FALLOW_J` (6)+, using the same decay to meadow.
- Reclamation: meadow next to jungle turns jungle with p 0.35 per step. A jungle of `JCRIT` (12)+ takes neglected (decaying) H/F wedges with p 0.3 (0.1 for a city).
- Waking up: a hamlet group is a **town** at 12 wedges. It can **wake** after `MATURE` (40) steps as a town, if it is at critical mass (`CRIT` = 24, or 12+ for a town that already hit city tier once) or very well fed (supply ≥ `FLUSH` (2) × need). It also has to be fed, with slack for one more wedge.
- Grokking: a fed town of `GROK_MIN` (18)+ wedges, three quarters of the way to critical mass, whose size stays within one wedge for `GROK_T` (60) steps jumps to city tier, with the city's usual builder. Once it has been a town for `MATURE` steps it wakes under the rule for towns that once hit city tier. It counts as a city for the jungle only from 24 wedges. A hungry step restarts the count. It is rare: under once per 300 placements of careful play, and about 4 times per 1000.
- Self-building: an awake town builds into a neighbouring wedge with p = 0.35 + 0.02 per wedge above CRIT (max 0.85). Trade (two towns on one sea) adds +0.15, a homed name +0.10, and a large town gets one more try per `TRY_EVERY` (20) wedges above CRIT. Target preference: meadow 4, jungle 3, field 1, never sea or Plex. Eating its own fields can starve it, and that oscillation is intended.
- Cities (`CITY`, 24+ wedges) reinforce themselves, the Landian thread. A big jungle takes a decaying city wedge with p `CITY_BITE` (0.1) instead of 0.3, while fields stay at 0.3. The jungle bites at full speed inside a Sink area, from a deep jungle (30+), and while the city has under half the supply it needs. Self-building climbs with size twice as fast: +`CITY_SLOPE` (0.04) per wedge above CRIT, and one more try per `CITY_TRY_EVERY` (10) wedges. Hunger works as for any town, and supply stays linear (tuning history 5 and 11).
- Metropolis (40+): every 10 steps, if fed, it plans a whole new tile on an empty edge, built to match its neighbours. It glows as a dashed crimson hex for one step.
- Tiers: H 1/6/12/24/40 (hamlet, village, town, city, metropolis). S 10/20/35 give ferries 1/1/2. J 12/30. F 10/25 give harvest stars 5/10. A village names itself from a syllable generator. If the name's AQ zone equals the founding tile's zone it is **homed** (shown from weirdness 2).
- Builders, earned at town (1), city (1) and metropolis (2), clear one tile. Ferries let you place up to 3 hexes from land.

**Weirdness** (`LEVELS` = stars 0/45/130/280/520):
1. Tiles show zones; syzygies, lemurs and currents start. Currents are drawn faint, with a light tint over the land they act on.
2. Towns show AQ readouts; fields turn to dashed tokens; violet roofs and antennas.
3. Houses grow eyes that follow your finger; the ground dusks; eyes in deep jungle.
4. Night, lit windows, and the currents glow bright. A current is drawn as animated dashes between its pair, running from the higher zone to the lower, coloured by the region of its difference, and it fades while it lingers. Once a town builds itself at night, data centres arrive.

**Page.** One-screen canvas game. HUD (wordmark, stars, gift meter, weirdness pips), tray (offers plus gifts), tools (Undo, Turn, Place, Build, Ferry), sheets (gift choice, tile inspector, lemur card, info with settings, chronicle and New world). Controls:
- Tap a spot to preview at the best rotation, tap the preview to turn it, then Place.
- Drag to pan and pinch to zoom; wheel zoom and keys R, Enter and Z on desktop.

The placement hint names any current a placement would open ("opens a Hold current (7::2)"). The tile inspector lists the currents acting on a tile, with the carrier and whether it is a pair tile or fading. A sheet opened by a board tap ignores scrim clicks for 400 ms, because the tap's own click lands on the new scrim; in v1 that closed the inspector and lemur cards as soon as they opened. A world saved before currents picks them up on load.

Data centres are dark slate slabs with a row of cyan lights that ripple; they puff steam where they touch sea, show a blinking red light while their cluster runs hot, and glow at night like the windows. Dreams are rumor ghosts with faint drifting scanlines, and a dream about to be laid glows as a dashed violet hex. A data centre that took a town's name gets a dark label ("data centre"); a split town or data centre keeps its label on its largest piece only. The inspector gives a data centre's size, sea contacts against its need and where its name came from, and calls a dream a dream. The hint adds "Data centres need sea next to them." for tiles with D, and the gift sheet says when wild land is at the cap, so the Plex choice gives stars instead.

Settings sit in the info sheet. **Show clean fits** is off by default: when on, clean-fit spots are drawn in teal and the hint adds "Teal spots fit cleanly." When off, every open spot looks alike except for a lighter fill where at least one edge matches. Settings are saved per device under `numogarden-prefs`, apart from the world, so New world keeps them.

Saved to localStorage under `numogarden-v1` (wrapped in try/catch). Undo is 30 deep in memory. One deliberate light look, no dark theme; it dusks with weirdness instead. Fonts: Major Mono Display (wordmark, zone numerals, demon names, as on the SVL pages), Baloo 2 (UI), IBM Plex Mono (readouts). Honours prefers-reduced-motion.

## Testing

**Pre-registered pass line** (greedy bot, 50 seeds × 300 placements). All must hold:
- No single terrain above 60% of wedges at the end in more than 5 of 50 runs.
- Every run has at least one self-build and at least one jungle reclamation after placement 50.
- The median placement of the first self-build is between 60 and 180. The cozy phase comes first.
- Zero errors.
- No current's share of current tile-steps rises more than 10 points above its share on the same seeds with current effects off (`CFG.CURRENT_FX = false`). Added with the currents work, before any effect was built.
- No run has Plex (X) at 10% or more of wedges at placement 300.

**Night pass line** (pre-registered for data centres before any of it was built; `tools/night.js`, greedy bot, 50 seeds × 600 placements, so about 480 placements of night). All must hold:
- No terrain, D included, above 60% of wedges at the end in more than 5 of 50 runs.
- The median D share at placement 600 is between 5% and 30%.
- A town of 12+ wedges, or a data centre carrying a town's name, is there at the end in at least 45 of 50 runs.
- The median run has at least 5 dreams come true. This line applies once dreaming is built; before that, all the others must hold.
- No run has Plex (X) at 10% or more at the end.
- Zero errors.

It ran on seed sets 1000, 500000 and 900000 while building, then on the fresh set 4100000 when data centres were done: PASS (D 10.7%, 178 dreams laid and 17 come true, Plex 8.0%, top share 53.5%, towns kept in 50 of 50). The 300-placement pass line must still hold on all ten sets. Before data centres (`results/night-before-data-centres.txt`): night at a median of 120.5, end shares H 14%, F 16%, J 40%, S 20%, M 2%, X 8%, top share 46%, towns kept in 50 of 50, and the line fails only on D at 0%. With step 1 (`results/night-seeds-*.txt`, D arriving with no needs) it passes on all three sets: end shares H 10%, F 3–4%, J 40%, S 20%, D 18%, X 8%, about 55 data-centre clusters with the largest near 100–110 wedges, and towns kept in 49–50 of 50. With step 2 (cooling) it still passes on all three: data centres are cooled on 88% of their cluster-steps and settle at 10% of the land, about 40 clusters with the largest near 60 wedges. Hot inland data centres fall to meadow and jungle takes them, so jungle rises to 48% and the top share in any run to 54–57%, close to the 60% line. With step 3 (absorbing) it passes on all three: about 90 hamlet wedges are absorbed per run, data centres grow to 11% with the largest near 85–95 wedges, jungle eases to 47%, and the top share is 53–55%. With step 4 (dreaming, plus the shared Plex cap from tuning history 16) it passes in full on all three: about 180–190 dreams are laid per run and a median of 17 come true, Plex holds at 8.0% with no run at 10%, data centres are 10–11% of the land, and towns are kept in 50 of 50.

The harness prints the same criteria for the **zone-aware bot** (greedy plus `ZONEBONUS`, default 15, per syzygy it creates) as a diagnostic. It does not gate.

**Current shares with no effects** (greedy, 300): Warp 52–53%, Hold 23–26%, Sink 10%, Plex 6–8%, Surge 7%. The zone bot evens them out (Warp 38%). See tuning history 8 for why Warp dominates. With effects on, the shares move by 4.5 points at most. Sink falls to about 5%, because wearing land down changes zones and breaks its own pairs.

**Baseline** (`results/`), identical config, with currents, the city rule, grokking, maturity 40 and data centres (steps 1 to 4: arriving, cooling, absorbing, dreaming):

| seeds | pass line | max terrain share | runs with no self-build / no reclaim after 50 | median first self-build | biggest current rise | X max at t300 | errors |
|---|---|---|---|---|---|---|---|
| 1000 (tuning set) | PASS | 49.4% | 0 / 0 | 74.5 | Hold +1.6 | 8.3% | 0 |
| 500000 (held out) | PASS | 52.2% | 0 / 0 | 81.5 | Hold +4.5 | 8.4% | 0 |
| 900000 (held out) | PASS | 49.4% | 0 / 0 | 69.5 | Hold +2.9 | 8.3% | 0 |
| 1300000 (seen during the Hold fix) | PASS | 49.2% | 0 / 0 | 81 | Surge +1.8 | 8.3% | 0 |
| 1700000 (confirmation set for currents) | PASS | 55.1% | 0 / 0 | 89.5 | Warp +2.7 | 8.5% | 0 |
| 2100000 (seen while fixing the city rule) | PASS | 48.8% | 0 / 0 | 82 | Hold +4.6 | 8.3% | 0 |
| 2500000 (confirmation set for the city rule) | PASS | 50.9% | 0 / 0 | 69.5 | Hold +3.9 | 8.3% | 0 |
| 2900000 (confirmation set for the first grokking) | PASS | 50.5% | 0 / 0 | 66.5 | Warp +3.6 | 8.2% | 0 |
| 3300000 (confirmation set for 18+ grokking) | PASS | 50.9% | 0 / 0 | 79 | Hold +2.0 | 8.3% | 0 |
| 3700000 (confirmation set for maturity 40) | PASS | 49.7% | 0 / 0 | 72.5 | Hold +1.9 | 8.6% | 0 |
| 4100000 (untouched until the data-centre check) | PASS | 52.0% | 0 / 0 | 103.5 | Warp +2.6 | 8.3% | 0 |

All ten sets pass. The tightest median is 66.5 (2900000); night comes later, so data centres don't move it. Since cooling the top share is 49–55%, up from 44–50% before data centres, because jungle takes hot data centres. Earlier numbers (v1, currents alone, the first grokking, maturity 30, before data centres) are in git history.

Other things the harness shows:
- Greedy end shares at 300: about H 12–13%, F 8%, J 42%, S 20%, D 7%, M 2%, X 7%. Grokking fires about 0.6 times per run. Currents add churn: about 270 decline and 270 reclaim per run, against 170 and 240 in v1.
- **Long games** (`results/harness-drift-1000.txt`, 20 seeds × 1000, greedy, run as two halves of 10): no runaway. Jungle goes from 38% at 300 to 40% at 500 and stays near there, ending at 41% at 1000. Hamlets end at 14%, fields at 16%, X sits at its 8% cap, and the highest single-terrain share in any run is 45%. Grokking fires about 4 to 5 times per 1000 placements. Under the v1 rules (`results/harness-drift-1000-v1.txt`, current effects off and no city rule) jungle keeps creeping, to 43% at 600 and 44% at 1000, with a top share of 48%.
- **The random bot** gets a town to wake in about half the runs (24 to 34 of 50; 23 to 29 in v1), and late, so careful play matters, which is intended. Its towns rarely grok, about 0.3 times per run, because careless play mostly makes small towns.

**Phone check** (`tools/check.py`) on docs/index.html at 390×844 with touch:
- 10 tap-driven placements land and raise the score. It taps the best spot that is on screen, since new worlds use a random seed.
- A tap on a tile opens the inspector.
- Undo works, and the world comes back from storage on reload.
- No sideways overflow, the canvas is not blank, and there are zero console errors.

Google Fonts are stubbed, so it runs offline.

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
11. **Slow hunger made cities sit idle.** The first city rule also made hungry city wedges take 6 steps to fall instead of 3. It failed on two sets: the median first self-build on 900000 fell to 59, under the floor, and on the fresh set 2100000 two runs had no self-build after placement 50 (currents alone pass that set). A trace of seed 2242542 showed a city overfed by placements to 58 wedges (supply 12, need 20). It starved slowly for 100 placements, building nothing because hungry towns don't build, and then sat at 42 wedges with no slack. With normal hunger both sets passed (900000 at 60.5, 2100000 at 76.5), so the author dropped the hunger part: cities resist the jungle and build faster, but go hungry like any town. The hunger part had come from Claude's proposal; the author's brief was about the jungle.
12. **Grokking ended the stall.** The author picked grokking from the backlog for tuning history 10, with a 60-step plateau, a one-tier jump, and fed villages and towns. Every known set then passes, including 1300000 and 1700000. It fires more often than expected: about 8 times per 300 greedy placements and 48 per 1000, and 23 per 300 for the random bot. The random bot's towns then woke in 41 to 46 runs of 50 instead of about half, so careless worlds came alive too, and the author asked for it to be rarer. Towns only (12+) cut groks by two-thirds, but careless worlds still woke in 45 of 50. A 100-step plateau brought the stall back on 1300000. The random bot's towns grok mostly at 12–14 wedges, and the stalled greedy towns sat at 19–23. So only towns of 18+ grok: about 0.6 groks per greedy game, the stall stays fixed, and the random bot's towns wake in 24 to 34 runs of 50, as before grokking. The confirmation set 3300000 passes.
13. **Currents shortened the cozy phase.** The confirmation set for grokking, 2900000, misses the floor with a median first self-build of 59.5. It is also 59.5 with currents alone and 77.5 under the v1 rules, so currents cause it, not grokking or the city rule. Surge halves the wait to wake and Warp doubles building tries. The author committed grokking with this on record; finding the cause is next.
14. **Maturity 40 gave the cozy phase back.** Switching effects off one at a time on the tight sets (median first self-build on 900000 / 2500000 / 2900000, live 60.5 / 62 / 59.5): Surge waiting the full maturity gave 67 / 62 / 61, Warp building once per step 61 / 64.5 / 64.5, both with no Surge build bonus 69 / 66 / 68.5, and all current effects off 68 / 75 / 69.5. Both effects count, and something else (Hold, Sink or Plex) adds a little on 2500000. The candidate fixes were weaker Surge and Warp (67 / 66 / 67.5), maturity 35 (64.5 / 69 / 63), maturity 40 (69.5 / 69.5 / 66.5), or Surge at three quarters with Warp building once (66 / 66 / 64.5). The author chose maturity 40, which keeps every current at full strength. All ten sets pass, including the untouched 3700000 (72.5), and the tuning set's median only moves from 72.5 to 74.5.
15. **Night stopped late bloomers.** With fields leaving the deck at nightfall, the 300-placement line failed on all five sets first checked: 3 or 4 runs in 50 had no self-build after placement 50. On set 1000 all four were worlds where night came first (placement 120–127) and the first town would have woken at 152–190; without new fields it never did. The author chose to make the machines wait for a woken town. "Some town has built itself" still failed 1300000 and 2100000 by one run each: worlds that woke early (placements 36 and 42), went quiet, and would have built again at night. So the trigger is a town building itself since nightfall. All ten sets pass, and the night check passes on 1000, 500000 and 900000.
16. **Dreams handed out Plex tiles.** With dreaming built, the night check failed only on Plex: 20 of 50 runs on set 1000 ended with wild land at 10% or more (mean 9.8%, against 7.8% before dreams). Dream ghosts count as neighbours, so they create pockets where a tile has 4+ neighbours: perfect fits rose from 1 per run to 25, and each put a Plex tile in hand (46 Plex tiles per run, against 18). The Plex current already stopped at `PLEX_CAP`, but fits and gifts had no cap. Dreams every 12 steps instead of 6 still left 6 runs at 10%. The author chose one shared cap: past `PLEX_CAP` (8%), a Plex tile from a perfect fit or a gift turns into +5★, like a full hand. Plex then holds at 8.0% and the night check passes on all three sets; the 300-placement line passes on all ten.

## Next (agreed with the author)

- Nothing is queued. The backlog below is open, and the author picks what comes next.

For data centres the author chose Field out and D in at night, cooling by sea only, the letter D, no eating fields, and absorbed towns lending their names; then the machines waiting for a town that builds itself at night (tuning history 15) and one shared Plex cap (16). Built in five harness-checked steps: D arriving, cooling, absorbing, dreaming, the page.

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

## Known limitations

- **Perfect fits are rare.** Spots with 4+ neighbours are uncommon, so most Plex tiles and rumors come from the gift meter.
- **Jungle is the biggest terrain in long games.** With data centres it is about 46% at placement 600, as hot inland data centres fall to it, and the top share in any run is 51–54%, nearer the 60% line than before. Plex sits at its 8% cap.
- **Lemurs are small to tap** (0.3-hex hit radius).
- **Undo isn't saved.** The stack lives in memory only, so a reload clears it.
- **The live-reload hook is a guess.** `window.claude.hot` snapshot/ready keeps a game going across artifact republishes. Its exact API was guessed and every call is guarded; it does nothing outside claude.ai.
- **Untested at scale.** Performance was fine in the check, but very large worlds (500+ tiles) haven't been profiled on a phone. The renderer culls off-screen tiles and skips decorations when zoomed far out.

## Publishing

- **GitHub Pages** (like Numogram Lab): commit `docs/` and turn on Pages from the main branch, `/docs` folder.
- **The claude.ai artifact** for v1 is https://claude.ai/artifact/HDjvCNwfbtUES2M1xU2SNY (private to the author). To update it, bring `artifact/numogarden.html` to a claude.ai chat and ask Claude to republish it to that URL. Claude reads the artifact first, then publishes with `url` set, so the link stays the same.
- **Saves are per site.** The Pages copy and the artifact keep separate worlds.
