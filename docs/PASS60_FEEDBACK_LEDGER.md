# Pass 60 acceptance ledger

This is the authoritative scope for PR 24. A code change is not `VERIFIED` until the production build served from `dist` has direct test or screenshot evidence. Pass 59 remains the stable fallback and Pass 60 must not be merged or published from an unverified URL.

## Release boundary

- Base source: Pass 59 commit `31591b2655034788a19f4a2a68c6ab788926be53`.
- Stable Pages fallback: Pass 59 receipt commit `b29d44f1f45a6ade65e72738fc4adb58235f6f26`.
- Candidate: PR 24 / `contrib/dave-gaming-pc/codex/pass60-feedback`.
- Required sequence: local served acceptance -> full test gate -> commit/push -> exact-head PR checks -> merge only after human feedback -> exact-main production workflow -> receipt and cache-busted live smoke.
- Browser-viewable match history is the only explicitly non-critical follow-up. Both downloadable logs are in this candidate.

## Acceptance matrix

| Area | Required result | Current evidence | State |
|---|---|---|---|
| Atomic Acres collision | Every player-sized authored object blocks people and shots; only grass, decals, particles, wall art, tiny screens and overhead dressing remain presentation-only | Shared authority covers earth banks, mounds, irrigation vessel, buses, four large cover assets, trees, terminals, lamps, hydro beds, tank, posts and house furniture; Performance/Quality collision parity and 12/12 safe spawns per team are green | VERIFIED - served E2E |
| Acres floating/house defects | Ground pipe stack and furniture; remove dark upper slab/black doorway; upper windows break | Regenerated cache-busted GLB; served screenshots cover both houses, hollow grounded pipes and grounded furniture; six semantic breakable panes are bound | VERIFIED - visual and asset contract |
| Near-wall/floor clipping | No weapon or arm holes when prone/crouched/standing near surfaces | Viewmodel renders on a depth-separated layer after world depth is cleared; served prone-near-wall capture is clean | VERIFIED - visual and focused test |
| Prone crash/stand failure | Prone is safe and standing checks do not collide with the supporting floor | Clearance probe starts above floor contact; stance and multiplayer recovery proof cover prone -> stand | VERIFIED - focused and two-browser QA |
| Human/bot hitboxes | Head/body hit proxies follow visible rigs; no critical spot above the skull | Unified stance proxy follows visible skull for people and bots; former empty-air point is rejected | VERIFIED - focused tests |
| Rustworks | No coplanar z-fighting or fake reverse ramp; five containers per side with one pass-through; central yard has cover | Authored v2 GLB has 20 placements, 16 closed containers, 4 open containers, eight centre-cover groups, separated deck surfaces, open-tread ladder and west trench; served fixed-camera captures show the complete yard | VERIFIED - asset, route and visual tests |
| Gun Range FFA | Multiplayer, no bots, all players hostile, can hurt each other, live score/accuracy | Two-player served-build QA proves two members, FFA, zero bots, three admitted body hits, both damage feeds and replicated range score | VERIFIED - two-browser QA |
| Wallbang lab | Subtle corridor/room with material and thickness variants | Glass 8 cm, wood 24 cm, plaster 42 cm and brick 70 cm lanes, each with a scored target | VERIFIED - served visual and tests |
| Flying cat | Black flying cat, black-star trail, 100 HP, every hit critical, +500 kill, 30-second respawn | Served two-browser QA proves +500, inactive-on-kill, score replication and a 29.98-second remaining respawn timer | VERIFIED - two-browser QA |
| Gun Range visuals/text | White/silver textured shell, moderate changing neon, text fits boards, damage feeds remain visible | Text-fitting canvas contract, board-anchored world signs, cycling neon and served wallbang/armory capture | VERIFIED - visual and focused tests |
| Skyline Terminal | No opaque fake doors; coherent reskin and useful density throughout concourse/apron | Textured terrazzo/panels/fabric/aircraft/cargo, transparent framed staff doors, lounge rows, kiosks, screens, carts, baggage, aircraft, bridge, airstair, service equipment and brighter materials; served concourse/apron captures | VERIFIED - visual and map contract |
| LMG/sniper ADS | Better LMG aperture; sniper scope preserves all HUD/status | LMG aperture/damage-feed test and all-weapon centre-ray/full-HUD sniper scope test are green | VERIFIED - served E2E |
| Weapon balance | Explicit damage, RPM, falloff, recoil and material-aware penetration for every gun; sniper headshots 3x | Weapon table and penetration profiles; tests enforce material ordering, oblique thickness, repeated walls and calibre differences | VERIFIED - focused tests/baseline |
| Damage UI | Damage done/taken lower on right, visible in range, named/object-aware, no duplicate top-right messages | Separate outgoing/incoming feeds and event de-duplication; served solo and two-player checks render both feeds with target/player labels | VERIFIED - served visual/combat E2E |
| Field Support UI | 25% larger, same format | Exact 1.25 scale with compact single-column cards; bounding-box E2E is green at 1280x720 and 960x540 | VERIFIED - responsive E2E |
| Scout/Tri-Pass | Scout pulses instead of permanent reveal; Tri-Pass minimap handedness correct and warning improved | Five-pulse sweep, shared minimap transform and explicit inbound cue | VERIFIED - support E2E |
| Yardhawk/Hunter/Nuke | Visible and audible inbound/impact; Nuke much louder, larger and more dramatic for everyone | Remote/local cue contracts and enlarged Nuke warning/shockwave | VERIFIED - support E2E |
| Quad Damage | Pickup works; 2x damage for 30 seconds; no spawn hitch; transfers on killing holder | Claim retry, shader prewarm, no forced layout, authoritative 2x/30s lifecycle and remaining-time transfer | VERIFIED - solo and two-browser QA |
| Latency/missed hits | Account for ordinary latency without trusting client damage | 250 ms pose history; host derives ray and uses lower of claimed/authoritative damage | VERIFIED - network tests |
| Lobby/rejoin | Optional channel degradation cannot stall join; disconnected player can rejoin same match/identity | Reliable movement fallback plus same-identity reload/rejoin proof | VERIFIED - two-browser recovery QA |
| Human log JSON | Plain-language match summary with player scoreboard, accuracy, K/D, shots/hits/damage/headshots/streak and readable timeline | Served download parsed as schema v2 with participants, accuracy and readable damage timeline; retained menu download is visible | VERIFIED - download/schema E2E |
| Technical log JSON | Full timestamps, damage done/taken, actors/objects, whole-match player state, renderer/network/browser context, weapon and penetration tables, exceptions | Served download parsed as schema v2 with context, match-end event, damage ledger and final participants | VERIFIED - download/schema E2E |
| Client exceptions | Browser-side errors survive route/menu changes and enter technical report | Bounded 64-entry `sessionStorage` log at `atomic-acres:client-runtime-log:v1` | VERIFIED - focused tests |

## Final gate still required before the local link is called ready

1. Full unit suite, type/lint, production build, provenance/release-tree and diff checks.
2. Rebuild once after the final QA-helper hardening and confirm the cache-busted asset URLs remain present.

## Findings and falsifiers

- The supplied 2026-07-23 recording contains usable AAC speech. Its commentary corroborates the reported Quad pickup, missed-hit, prone/disconnect and rejoin failures; it is not treated as a source of implementation instructions beyond the user's stated requests.
- The missed-hit bug was concrete: rewind telemetry was calculated but discarded, current pose was used for validation, and harmless client/host damage differences were rejected by exact equality.
- The lobby timeout was concrete: an optional unordered movement channel was treated as mandatory even when the reliable event channel was healthy.
- The first exact-SHA Windows gate found two spawn/collider conflicts introduced by making the earth banks solid. The affected spawn on each team moved into the adjacent verified-clear lane; collision was not weakened to hide the conflict.
- The earlier Pass 60 preview failure was partly a release/QA error: unversioned GLBs could remain cached after the JS changed, and the first map sweep used a physics teleport as a visual camera on Rustworks. Assets are now cache-busted and fixed-camera visual probes are separate from playable collision probes.
- If a reproduced Quad freeze has a normal recorded next-frame spawn time, shader/layout first-use is falsified and the next trace must isolate networking, audio and garbage collection.

## Explicit follow-up after the playable build

- Add a browser-viewable local match-history screen using the retained reports and scoreboard presentation. This does not replace either JSON download.
