# Pass 21 — Precision, Death Drops, Tactical Supports, Breakable Glass, and House Flow

Date: 2026-07-15
Status: implemented; final release verification in progress
Branch: `overhaul/gameplay-systems-pass-21`
Baseline: approved Pass 20 commit `7a679e6`

## User contract

Preserve the approved Pass 20 movement, combat feedback, two-storey through-house routes, rear exits, readable HUD, and 3/5/7 Field Support thresholds. Add the following without turning the pass into a broad combat redesign:

1. Sniper class: one full-health headshot kills; one body shot does not; two body shots kill.
2. A defeated player/bot leaves a weapon drop. Press `F` near it to pick up the weapon, or replenish ammunition if already carrying that weapon.
3. Make facing direction obvious on the map and display the minimap at twice its prior CSS size.
4. Yardhawk becomes a hand-thrown device that transitions into a homing explosive drone.
5. Tri-Pass opens a tactical map, accepts exactly three target clicks, and impacts all three locations one second after the third target is confirmed.
6. Every house window can be broken by bullets or the knife.
7. Enlarge both houses slightly and widen the continuous ramps/landings so players are less likely to catch on route edges.
8. Permanent aiming invariant from the screenshot review: the HUD reticle and every physical ADS sight must agree with the authoritative camera-centre bullet ray for every current and future gun.

The phrase “enlarge app to 2x size” is interpreted as “enlarge map to 2x size” because it immediately followed the map request. This assumption was surfaced to Dave before implementation.

## Authority and network boundaries

- Health and shot damage continue through the existing validated hit/death message flow.
- Sniper damage is defined centrally in the weapon table and uses the existing hit-zone multiplier. No client-only headshot shortcut.
- Remote primary changes are legal only on respawn or after a validated pickup event. A pickup message must bind sender identity, weapon identity, bounded position, nonce, and proximity to a deterministic recent death drop.
- Death drops are derived from accepted death events, use stable IDs based on death nonce, expire, are bounded in count, and can be consumed only once per client. They do not manufacture arbitrary weapons or unbounded ammunition.
- `F` is edge-triggered: holding it cannot repeatedly consume/refill.
- Window break messages use stable architecture-derived IDs, sender-bound nonces, arena bounds, and proximity/shot validation. A broken window is idempotent.
- Support blast and missile hit messages continue through the existing explosive hit validation path. Clients cannot send arbitrary direct kills.
- Field Support thresholds remain Scout Sweep 3, Yardhawk 5, Tri-Pass 7; deaths still reset streak progress and unused rewards.

## Sniper class

- ID: `sniper`; field kit: `marksman`; display name: `Longline 86`.
- Five-round magazine, 25 reserve, semi-automatic/bolt-paced cadence.
- Base and minimum body damage: 55. Existing head multiplier 2.0 gives 110; two body hits give 110.
- Range keeps the body contract across the playable arena.
- Principal shots remain camera-centred in hip-fire and ADS; the sniper is balanced by cadence, reload/handling, scope transition, and recoil rather than an invisible random offset from the reticle.
- Scoped ADS presentation is centered and does not obscure the reticle.
- Existing carbine, SMG, scattergun, and pistol behavior remains regression-covered.

## Reticle and physical-sight invariant

- A permanent 3 px centre dot remains visible in hip-fire and ADS.
- Carbine, SMG, sniper, and pistol single projectiles use the camera-centre ray exactly; movement and sustained-fire recoil alter the camera, not an invisible random offset from the reticle.
- Scattergun pellet zero uses the exact centre ray while its remaining eight pellets retain the authored cone.
- After bob, sway, movement, recoil, stance and weapon-family transforms are sampled, the active physical ADS reference is re-centred against the camera ray.
- Browser verification iterates all five weapons at settled ADS and again while moving/firing; adding a future weapon without a centred reference must fail the gate.

## Death drops and `F` interaction

- Spawn at a defeated actor’s last accepted position with their primary weapon and a bounded ammunition payload.
- Visible world model, glow/ring, weapon label, and remaining lifetime.
- Interaction distance: 2.35 metres.
- Different primary: replace the current primary, load the bounded dropped magazine/reserve, and update first-/third-person presentation.
- Same primary: add reserve ammunition, clamped to the weapon maximum; consume only when ammunition actually increases.
- Prompt clearly distinguishes `F PICK UP …` from `F REPLENISH …`.
- Expiry: 25 seconds; maximum active drops: 12.
- Drops clear on match reset/end and do not survive across sessions.

## Yardhawk

- Activation creates a visible compact drone in the player’s hand/camera-forward throw origin.
- Throw phase lasts at least 0.4 seconds with forward/upward velocity and visible spin.
- It then arms, reacquires the nearest valid enemy if needed, homes, and detonates once within its blast trigger radius or on timeout/solid impact after arming.
- Explosion remains bounded by arena geometry and uses the existing explosive damage network path.
- Debug telemetry exposes phase, position, target, armed time, and explosion count.

## Tri-Pass tactical missiles

- Pressing `5` with Tri-Pass ready consumes the reward and opens a dedicated tactical-map overlay.
- Pointer lock is released without opening the pause/deployment menu.
- The overlay is north-up and uses the same arena-to-map transform as the minimap.
- Exactly three in-bounds clicks are accepted and visibly numbered 1–3.
- `Escape` cancels before the third target and refunds that one consumed use.
- After the third click the overlay closes and three visible sky missiles descend.
- All three impacts occur 1000 ms after the third click (within frame tolerance), damage enemies in a bounded radius, respect cover validation, and leave clear impact markers/feedback.
- No fourth target can be registered, and duplicate click handlers cannot schedule duplicate volleys.

## Minimap

- CSS display grows from 150×150 to 300×300; backing canvas grows from 180×180 to 360×360.
- The map remains north-up and inside the viewport at the supported 1280×720 gameplay size.
- Player marker becomes a high-contrast outlined arrow with a long nose, tail, and translucent forward cone.
- Cardinal `N` and heading text are present.
- House outlines derive from shared house architecture bounds rather than stale hard-coded dimensions.
- Pure transform/heading helpers receive deterministic unit coverage.
- Heading/facing derive from Three.js camera forward `(-sin(yaw), -cos(yaw))`; the screenshot review caught and corrected a previously mirrored east/west map convention.

## Breakable house windows

- Only the six architecture-declared house glass panes are breakable; coach/truck decorative windows are unchanged.
- Each pane has a stable ID: house/team plus architecture solid name.
- Intact panes participate in shot/melee raycasts but not movement collision.
- The first valid bullet or knife strike breaks a pane, hides/removes its shot blocker, and spawns restrained shards/impact feedback.
- A broken pane no longer blocks bullets or melee and cannot break twice.
- State resets at the start of a fresh match.
- Local breaks replicate idempotently to multiplayer peers.

## House and ramp dimensions

- Increase footprint from 16.2×14.4 metres to approximately 18.2×16.4 metres while preserving exactly two rooms per level, two opposite ground-floor exterior doors, and three windows.
- Increase ramp clear width from 1.84 metres to at least 2.6 metres.
- Increase landing width/depth and doorway/interior openings where needed.
- Keep one visible and physical continuous inclined ramp per house: no stairs, stacked proxy steps, or invisible traversal substitutes.
- Preserve safe arena/fence clearance and all explicit navigation routes.
- Automated traversal must complete the front/rear door route, both rooms on both floors, ramp ascent/descent, and avoid snag/recovery thresholds.
- Exterior door frames and storey-seam trim sit wholly in front of the wall faces with a positive depth gap; they are not embedded/coplanar, preventing the screenshot-reported striped Z-fighting.

## Asset hygiene

- The rejected Pass 19 OpenGameArt first-person FBX candidate remains preserved as source evidence but must move outside `public/` so it no longer ships in `dist`.
- Runtime Quaternius weapon/operator assets remain because they are actively loaded.
- The production build must prove the rejected candidate directory is absent.

## Verification gates

1. Red-first unit tests for sniper lethality, pickup/replenishment bounds and one-shot consumption, tactical target count/timing, minimap transforms/heading, breakable-window state, and larger house/ramp contracts.
2. Existing unit suite plus lint/typecheck/build.
3. Chromium E2E for class selection, one-head/two-body damage, `F` pickup/replenish, Yardhawk throw→home→explode, three-click tactical missile sequence, window gun/knife destruction, minimap size/facing, house route traversal, and existing Field Support/HUD regressions.
4. Multiplayer regression with accepted/rejected malformed messages and remote presentation.
5. Visual QA at 1280×720 and public HTTPS; no HUD overlap, tactical overlay clipping, console errors, or obvious house seams.
6. Release to the isolated preview first. Do not overwrite the newly promoted canonical Pass 20 release until Dave approves Pass 21.

## Final local verification — 2026-07-15

Commands exercised against the same working tree and final `dist/`:

```bash
npm run lint
npm test
npm run build
npm run verify:release-tree
PLAYWRIGHT_BASE_URL='http://127.0.0.1:4175/?final=pass21' npx playwright test --project=chromium --workers=1
QA_BASE_URL='http://127.0.0.1:4175/?qaRun=final2' QA_RENDER_MODE=compat node scripts/qa/verify-multiplayer.mjs
QA_BASE_URL='http://127.0.0.1:4175/' npm run qa:release
npm audit --omit=dev --audit-level=high
git diff --check
```

Observed evidence:

- TypeScript/lint passed.
- Vitest: **158/158 passed** across 32 files.
- Chromium: **25/25 passed** serially, including all five weapon/reticle states, real `F` interaction, Yardhawk, Tri-Pass, glass, larger-house flow, 1280×720 HUD, 960×540 responsive HUD, and both renderer budgets.
- Two-peer PeerJS QA passed after one bounded signalling-service retry: no console/page errors; opposing teams; prone-state replication; remote window-break replication; one-shot sniper death; authoritative death-drop pickup; and remote primary-weapon replication all succeeded.
- Local release capture had zero console/page errors. Manual pixel review found the permanent centre point inside the carbine optic, clean oblique front/side house seams, and no striped/coplanar facade artifacts. A first 960×540 multiplayer capture exposed location/equipment overlap; the height-aware 240 px CSS presentation fixed it while preserving a 360 px backing map and the requested 300 px presentation at 1280×720.
- Production build passed with `index-DRJOKkTa.css`, `index-ByevM9Pk.js`, and `rapier-B45baom8.js`.
- Release-tree verifier: 27 files, zero rejected-candidate files, zero oversized forbidden assets.
- `npm audit --omit=dev`: zero known vulnerabilities.
- `git diff --check`: clean.

## Isolated public review release

Dave approved publishing the tested candidate for live review. The exact locally verified artifact was published without changing the canonical Pass 20 root.

- Source implementation commit: `221c0ed2f3279aaf9d54665e1793fa603777519e`
- Pages review commit: `fd0e16b1806d04b010d29b99be0d6e83267038b5`
- Exact `dist/` tree SHA-256: `61d3469b60a360dcb0a1d9b32646977223527bc2ab28b888dae863cdea4041cc`
- Review URL: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass21/?source=221c0ed&pages=fd0e16b
- GitHub Pages status: `built`
- Public asset hashes matched the tested local `index-ByevM9Pk.js` and `index-DRJOKkTa.css` byte-for-byte.
- Public release QA reported an active solo match and zero console/page errors.
- Public runtime telemetry confirmed the 3 px permanent reticle point, sniper ADS sight offset `[0, 0]`, 360 px minimap backing, two 18.2×16.4 houses, 2.6-wide ramps, six breakable windows, and ready original weapon/operator assets.
- Public pixel review found no HUD overlap, missing assets, or obvious striped/coplanar house surfaces.

The canonical Pass 20 root remains untouched and still references `index-DyABOUpe.js` and `index-DPQZawgN.css`. Pass 21 promotion to the root requires a separate decision.
