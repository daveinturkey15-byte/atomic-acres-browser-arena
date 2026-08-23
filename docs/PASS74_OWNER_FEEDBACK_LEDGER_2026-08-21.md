# Pass 74 owner-feedback correction ledger — 2026-08-21

Sources: Dave's hands-on Pass 73 HITL notes (`Desktop\pass74.txt`), the carry-over master handoff
(`Desktop\atomicnext.txt`), and a live owner directive on 2026-08-21: Firefox currently renders at
roughly 10 FPS against 150+ in Chrome and must be debugged and fixed, and **every** item in both
desktop files must be actioned and tracked in this ledger — none silently dropped.

Base: `origin/main` @ `506d6142ce09b8317279a8c705d2de25fa2ab84b` (Pass 73, PR #62 merged).
Branch: `contrib/dave-gaming-pc/claude/pass74-20260821`. Change impact: `runtime`.
Publication constraint: **do not publish past Pass 73.** This pass ends at a local HITL preview.

Rules: `IMPLEMENTED` is not `VERIFIED`; owner-taste rows stay `HITL` until Dave inspects the exact
candidate. No row is closed by a static contract alone. No timeout, threshold or assertion may be
weakened to obtain green. Statuses here are updated in place as the pass progresses.

Legend: `OPEN` (not started) · `INVESTIGATING` · `IMPLEMENTED` (code changed, mechanical checks
green) · `VERIFIED-LOCAL` (exercised in a live local runtime) · `HITL` (waiting on Dave) ·
`RETAINED-POSITIVE` (regression guard) · `DEFERRED` (explicitly not in this pass, with reason).

---

## P0 — combat authority correctness

### HF-315 — a picked-up weapon cannot shoot or reload; shooting/reload randomly stops working
- Source: pass74.txt ("pickup guns cant shoot cant reload"; "sometimes randomly cant shoot or reload
  my gun or after picked one up"; "reload not working for some people in host or guest lobbies").
- Working hypotheses to verify: (a) `acceptRemotePickup()` rejects silently on any guard mismatch
  while the guest has already swapped locally, leaving host `remoteCombatInventories` divergent, so
  every later shot fails `guestCombatInventoryCanFire()` and reload intents resolve against the
  wrong weapon; (b) `pendingLocalReloadAuthority` has no deadline — one lost `reload-result`
  permanently blocks `reload()` for that life; with an empty magazine `tryFire()` routes into
  `reload()` and the player can neither shoot nor reload.
- Must not: widen deadlines, grant client-authored ammo, bypass host shot admission.
- Status: IMPLEMENTED (51c440f0) — host answers every pickup with accept/reject over the reliable lane; guest reverts on rejection or a bounded deadline; shared drop placement; reload authority expires and is life-scoped. Needs two-machine hosted HITL to close.

### HF-316 — killstreak key-3/slot activation and selection failures
- Source: pass74.txt ("cannot select killstreak 3 care packagesometimes? why?").
- Two readings, both to be investigated: (a) menu slots 3/4 share a pool and must stay distinct —
  picking the sibling's reward is a silent disabled-option no-op; correction is an automatic swap;
  (b) in-match activation key 3 (slot 1, Care Package) sometimes refuses to activate.
- Status: IMPLEMENTED - LEDGER WAS STALE, verified 2026-08-22 by a Claude Opus 5 analyst plus two adversarial verifiers. The swap-on-conflict module (src/killstreak-loadout.ts replaceKillstreakSlotWithSwap) IS reached in production: KillstreakLoadoutController.select -> src/ui/killstreak-loadout-menu.ts:155, bound at legacy-main:5933 against the controller built at legacy-main:1621. The companion activation gate (src/killstreak-activation-gate.ts) is wired at legacy-main:20888 with denials routed to the HUD feed. The 'MODULES LANDED (aa114737)' note was true AT aa114737 - which touched legacy-main by only two farcrysis lines - but the wiring landed later in b7123bdd. RESIDUAL DEFECT, NOT CLOSED: the keydown handler bare-returns on gameplayInputEnabled() BEFORE dispatching to the gated activation, so the gate's 'dead', 'match-inactive' and 'input-disabled' feedback is unreachable from keyboard and touch. Pressing key-3 while down or during warmup still gives zero feedback, which is the other half of the owner's original report. Do NOT fix by weakening that guard - it is deliberate HF-324 scoping protecting every gameplay key; the correct shape is a narrow pre-check ahead of the blanket return, which deserves its own row and test.

### HF-317 — Carpet Bomber must be a strafing run, not a point drop
- Source: pass74.txt ("carpet bomb is still like carepackage not tri pass as requested? fix it").
- `carpet-bomber` is currently `PointSupportTargeting` beside `care-package`. Correction: a
  map-targeted bombing corridor (start and end point), visually and mechanically a pass, distinct
  from Care Package's single point and from Tri-Pass's three discrete targets.
- Status: IMPLEMENTED (cbca7f68) — Carpet Bomber is now a TWO-POINT tactical-map bombing run, not a point drop. The type union was narrowed so it cannot re-enter the Care Package path. No protocol change needed; map attribution unchanged.

### HF-318 — killstreak test-area bots lack proper collision
- Source: pass74.txt ("fix bots in killstreak area they don't have collision properly I thin?") and
  atomicnext.txt P0-3 (player clips through walls/floors in the killstreak test area — must never
  happen anywhere).
- Status: IMPLEMENTED (97faa806) — test-bay dummies now derive per-tick movement colliders merged like the door colliders; still hittable by hitscan; released on retirement. 13 tests.

### HF-319 — M14 damage reduced by exactly 40%
- Source: atomicnext.txt ("Lessen dmg of M14 by 40%" with damage/range/headshot tests). Verify
  whether Pass 72/73 already landed this; if not, land it.
- Status: ALREADY-FIXED (Pass 72 commit 10e6b2e7: M14 62/40 -> 37.2/24; Pass 73 456d8596 kept the decimal). No second reduction without a new owner instruction.

### HF-320 — fall damage halved
- Source: atomicnext.txt ("half fall damage" retaining authoritative impact-speed calculation).
  Verify whether Pass 72/73 already landed this; if not, land it.
- Status: ALREADY-FIXED (Pass 72 commit 10e6b2e7: FALL_DAMAGE_MULTIPLIER 0.5, impact-speed calc untouched).

### HF-321 — flare gun projectile hitbox wider and higher; flare damages bots in test area
- Source: atomicnext.txt ("flare gun needs a much better hitbox, wider and higher when as a
  projectile"; flare appears not to damage Killstreak-test-bay bots). No through-wall or oversized
  splash admissions.
- Status: IMPLEMENTED - LEDGER WAS STALE, verified 2026-08-22 by an analyst plus adversarial verification. Both halves of src/flare-projectile-system.ts are wired end to end. An explicit finding: applying a 'wiring' patch now would DOUBLE-WIRE prepareFlareTargetSnapshots and the halfHeightM arguments, which is the most likely way to reintroduce the defect.
- Splash close-out 2026-08-23 (lane K): the through-wall guard was only ever
  proven for the DIRECT hit. Every existing test stubbed `burnLineOfSight` to
  true, so a regression removing the burn-phase occlusion check would have gone
  green - the second half of "no through-wall hits" was unpinned. Two tests
  added to flare-projectile-system.test.ts: an occluded target takes zero burn
  damage and resumes taking it when exposed (mutation-checked - deleting the
  `burnLineOfSight` call in updateBurn fails it), and the burn splash stays
  bounded by `burnRadiusM` 3.4 for capsule targets exactly as for spheres, so
  the HF-321 capsule admission provably widened flight admission only, never
  the splash. Source unchanged: the behaviour was already correct.

## P0 — lobby, host and match lifecycle

### HF-322 — players cannot move in the host/guest lobby; cannot move on RustRig spawn
- Source: pass74.txt ("cant move alot in host and guest lobby etc"; "cant mov when spawn into
  rustrig in host guest lobby") and atomicnext.txt (Terminal TDM "just cant move";
  "Synchronizing Terminal before ready-up… between swapping maps").
- Status: IMPLEMENTED (9a8e5786) — all three permanent-freeze wedges fixed: identity flag no longer left armed on a waiting-phase join, repair handshake re-arms within its cap, exhausted repair surfaces a visible failure. Independent critic confirmed it PREVENTS/RECOVERS rather than bypassing admission. Tests are static source guards, so two-machine HITL still owed.

### HF-323 — the match must not start before all joined players are ready to play
- Source: pass74.txt ("game starts bnefore all people join? Sort?").
- Status: IMPLEMENTED (ba4cd584) — start is held while an admission is in flight, joiners are admitted during the countdown lead instead of bounced, and match-active rejection is scoped to phase active only.

### HF-324 — cannot type in the lobby (chat/inputs)
- Source: pass74.txt ("cant type in lobby").
- Status: IMPLEMENTED (9a8e5786 + ba4cd584) — chat panel click affordance, lobby-visible input row, Enter no longer swallowed by focused lobby buttons; Tab retained for the scoreboard once a match has started.

### HF-325 — host disconnect: hand over or recover authority without kicking; rejoin after refresh
- Source: atomicnext.txt ("if host dc, cant rejoin, can it hand host and not kick others? even if
  pause and reload?"; "rejoin last match even though refresh?"; de-sync after re-host needs re-sync).
- Status: IMPLEMENTED, ARMED (ea932116 + e0f707cb, 2026-08-22) - the full succession path now
  exists end to end: mandate broadcast after every lobby-state, adoptable mirror unicast to the
  elected successor on the checkpoint tick, guest receive handlers, and the promotion trigger in
  updateHostLossPresentation adopting through the EXISTING recovery path
  (initializeRecoveredHostLobby). network.ts gained promoteToHost - the client-to-host role flip
  that claims the room-code peer id as the G3 mutual-exclusion lock and aborts PERMANENTLY on
  unavailable-id (pinned: no retry ramp, no fresh-room fallback) - and the stand-down half: a
  superseded host (observed higher term, or its released id claimed while away) farewells guests
  with 'host-superseded' and goes offline. Followers re-point via the existing reconnect loop
  (same room-code id). The authorizeSelfPromotion clock defect is fixed: mandate epoch stamps are
  rebased into the receiver's clock exactly once on arrival (tests pin both skew directions).
  HOST_MIGRATION_PROMOTION_ENABLED flipped to true with the pin test updated in the same commit.
  Verified mechanically: tsc 0, vitest 3,268 (39 wire + 4 network-lifecycle promotion tests).
  Still owed for DONE: the live two-browser matrix - host dc mid-match, successor promotes,
  follower lands on the promoted host, old host returns and stands down.

### HF-326 — host-only "reset lobby / new room code" action
- Source: atomicnext.txt ("host button to refresh room/code for fresh lobby total reset and new
  code both").
- Status: ALREADY-FIXED (Pass 72: #lobby-reset fail-closed reset + new code). Pass 74 adds the residual polish: a lobby-closed farewell so old-room guests stop retrying for 90s.

### HF-327 — FFA is the lobby default; TDM remains selectable
- Source: atomicnext.txt ("make lobby FFA the default, team deathmatch the selectable option").
- Status: ALREADY-FIXED (Pass 72 commit 10e6b2e7: FFA default at every layer; TDM selectable).

### HF-328 — TDM teams are prescribed, not picked; colour-name identity fixed; swap allowed
- Source: pass74.txt ("prescribe teams for people in team death match rather than let pick, they can
  swap after if they want, just keep colour names don't let them pick colour or naems") and
  atomicnext.txt (squad name/colour changes must replicate before and during matches without
  corrupting team authority — superseded by the prescribe rule for naming).
- Status: IMPLEMENTED (970d4c52) — deterministic balanced prescription + canonical colour identity + legality-checked swap. Lobby markup/handler wiring pending (handoff written).

### HF-329 — map-owned Carpet Bomber events must not be attributed to a player
- Source: atomicnext.txt. Verify current attribution; fix if wrong.
- Status: ALREADY-FIXED (Pass 72: all carpet damage resolves environment/map:carpet-bomber). Guarded during HF-317.

### HF-330 — redundant asset reloading after map/lobby transitions
- Source: atomicnext.txt ("loading again the art even though earlier did it? cachce or something?").
  Verify cache reuse and disposal.
- Status: IMPLEMENTED (cbca7f68) — rack receipt re-keyed on stable arena identity so it survives LRU eviction; fail-closed contract intact. The arena cache bound was deliberately NOT raised, which would risk GPU exhaustion.
- Reuse/disposal verified 2026-08-23 (lane K), by reading the whole lifecycle
  rather than one layer. Cache reuse is real and layered: authored weapon GLB
  sources are cached module-level in weapon-model.ts with refcounts plus LRU,
  so a rebuilt Gun Range re-attaches from cache and never refetches; the Atomic
  Acres art/quality load promises are held for the whole session
  (`retireAtomicPresentation` runs only on `beforeunload`), so returning to
  Nuke Town never re-streams its art; `arenaCache` is a deliberate 2-entry LRU
  with deferred-GPU-fence retirement and full geometry/material/texture
  disposal. No redundant-load leak found in any of those.
- ONE REAL DEFECT FOUND, and it belongs to the legacy-main lane (handed off in
  wiringNotes): `bindAtomicPresentationRaycasts` runs only inside the three
  art-load paths in legacy-main.ts (4480, 4507, 4522). Both
  `ensureAtomicAuthoredPresentation` and `ensureAtomicQualityPresentation`
  early-return the retained `arenaArtRoot` before reaching it. With
  ARENA_CACHE_BOUND = 2 and six arenas, cycling maps evicts and REBUILDS the
  Atomic Acres authority; the fresh ArenaMap gets a fresh empty
  `raycastMeshes`, the retained art root is never rebound, and every
  `blocksShots` art prop stops stopping bullets until the page is reloaded.
  Caching is correct here - the missing rebind is the bug.

## P0 — browser parity and performance

### HF-331 — Firefox renders ~10 FPS against 150+ in Chrome; debug live and fix
- Source: owner directive 2026-08-21 (worse than the 60-FPS report in atomicnext.txt). Firefox and
  Chrome are the two primary browsers; both must use the explicit fail-closed WebGPU route with the
  same features. Diagnose live on this machine (installed Firefox, RTX 5080): determine
  WebGPU-vs-WebGL2 route actually taken, caps/VSync, adapter identity, long tasks, and frame-time
  distribution; fix without removing features. Edge/WebKit/Opera/mobile stay secondary.
- Status: PARTIAL - phase 1 landed (aa114737); phase 2 MEASURED IN PART on 2026-08-22 and the harness is now in the repo (scripts/qa/measure-hf331-firefox-gap.mjs). Established: (a) a headless measurement is WORTHLESS here - headless Chromium falls back to SwiftShader (software=true) and would have invented a gap; the script says so and defaults to headed. (b) On the real RTX 5080, chromium on ?renderer=webgl2 runs the quality Atomic Acres scene at 49.3 Hz against 150+ on WebGPU. So the WebGL2 COMPAT PATH ITSELF costs about 3x in Chrome, before Firefox is involved at all - and Firefox has no WebGPU on this machine, so 49 Hz is its structural ceiling. NOT established: the Firefox number. Playwright's Firefox would not get past launch/newPage on a machine saturated by concurrent swarms, and it left orphaned processes; the earlier combined run also hung because page.evaluate has no timeout and a starved rAF never resolves (fixed in the stage probe). The remaining question is precise: the owner sees ~10 FPS, the compat path explains 49, so about a further 5x is unaccounted for. Re-run both scripts headed on a QUIET machine to close it.
- QUIET-MACHINE ATTEMPT 2026-08-22 (late): the machine was genuinely idle (fleet dead, no swarms).
  (a) Chromium/webgl2 control RE-MEASURED at HEAD via the stage probe: 178 Hz menu, 73.9 Hz
  in-match on hardware ANGLE D3D11 / RTX 5080, software=false - the compat path improved from
  49.3 to ~74 Hz since the graphics work landed (per-arena IBL, ocean PBR).
  (b) Playwright's BUNDLED Firefox hangs inside firefox.launch() even on the idle machine, so
  swarm contention was NOT the cause; the stage probe never printed its first stage. Bundled
  Firefox is a dead instrument on this machine - do not spend another lane on it.
  (c) The installed-browser WebGPU parity harness (measure-browser-frame-parity.mjs, vite build +
  preview + installed Chrome + installed Firefox via geckodriver) ran end to end but both probes
  FAILED_LAUNCH: Chrome loaded the production preview yet __ATOMIC_ACRES_DEBUG__ never appeared
  within 60 s, and Firefox died on a geckodriver-path null. Receipt retained at
  artifacts/qa/browser-frame-parity-receipt.json. The harness itself needs repair (whether the
  debug hook exists on production builds behind multiplayerQa=1 is the first thing to check)
  before the Firefox number can be measured mechanically; the alternative close-out is the owner
  simply playing one minute in installed Firefox with the FPS readout up.

### HF-332 — first use of every explosive family must not hitch or freeze
- Source: atomicnext.txt P0-1 (Frag, Flash, Smoke, Semtex, explosive crossbow, flare impact,
  support explosions; Chrome + Firefox WebGPU; bounded prewarm only; no gameplay pre-authoring).
- Status: IMPLEMENTED (970d4c52) — destruction/debris prewarm added and the enriched explosion nodes are warmed; exact-recipe parity pin held unchanged. Per-family live hitch evidence on both browsers still owed.

## P1 — killstreaks and support

### HF-333 — killstreak selection menu regressed: hard to read and use; restyle to spec
- Folded into HF-362 (owner widened this to a full HUD/UI/menu reskin on 2026-08-21).
- Source: pass74.txt ("The killstrek selection UI menu has changed, no idea why, I didn't spec it,
  hard to see read and use now, revert it or just make a new pass that has decent colours and
  visuals etc?"). Direction chosen: a new pass in the retro-military dark console palette from
  `atomic-acres-ui-style-guide.md`, every text pair at 4.5:1 or better, legible at 1280x720.
- Status: IMPLEMENTED via HF-362 (51c440f0) — killstreak panel brought onto the dark console palette with real contrast; owner taste remains HITL.

### HF-334 — Care Package may yield the Flamethrower at exactly 10%
- Source: pass74.txt ("add 10% chance in care package to get a flamethrower"). The flamethrower is a
  timed map weapon with holder authority; the grant path must respect that authority. Recorded
  consequence: the existing killstreak pool keeps its internal shape inside the remaining 90%.
- Status: DONE (af1d6f8b, 2026-08-22) - owner decided the instancing question: "make a
  different one that does maybe 30% less damage and looks a different colour... make it red."
  `crimson-flamethrower` is now a separate WeaponId with its own finite fuel (100, no reserve),
  granted through an ordinary personal weapon path that never touches timed-map-weapon authority -
  so a care-package roll can no longer consume the world pickup. Damage is exactly 70% of the map
  flamethrower (56.7 vs 81); range/falloff unchanged. Red tracer, red ADS reticle, a `tintHex`
  livery field over the shared albedo, a hue-shifted hero still, and its own audio report so the
  two are distinguishable in one match. "Exactly 10%" is now EXACT, not approximated: the
  care-package pool supports fixed-percentage rewards (Nuke 1%, crimson 10%, weighted entries
  share 89%). A WEAPON_LIVERY_ALIASES registry records that it reuses the flamethrower's authored
  GLB, so prewarm, the corpus budget and the Blender production manifest all skip it - a repaint
  ships no second delivery. 12 new tests; gameplay-contract baseline +48 lines / 0 changed.

### HF-335 — Chopper Gunner HUD and missiles regressed; restore the better implementation
- Source: pass74.txt ("chopper gunner hud and missiles regressed, should be abetter branch
  somewhere?"; "the HUD of it regreed too, check old branches? had a better one"; "not sure if it
  can see through walls anymore like it shjud be able to") plus atomicnext.txt row 9 (legible
  LMB GUN | RMB MISSILES ×N strip, readable at all resolutions).
- Status: IMPLEMENTED (aa114737 HUD + this commit trajectory) - HUD strip and authoritative ammo landed earlier; the regressed VISUAL flight path is restored: alternating wing-socket launch, lookAt orientation, full 3D lerp. launchPosition rides the impact event as an optional fail-open field so older peers keep the vertical-drop fallback. Damage/cadence/capacity were proven never to have regressed (docs/PASS74_HF335_MISSILE_DIAGNOSIS.md).

### HF-336 — non-controlling players lag severely while a Chopper Gunner is flying
- Source: pass74.txt ("when chopper gunner is flying and I am against it or on the same team but not
  controlling it I am very laggy").
- Status: IMPLEMENTED (7851f1d6) - measured first this time. docs/PASS74_HF336_SPECTATOR_COST.md quantifies the asymmetry: the pilot hides the entire exterior airframe (zero exterior draw calls, zero shadow casters) while every other peer renders 87 draw calls, 59,948 beauty triangles and 11,344 shadow triangles into a 2048x2048 shadow map. SUPPORT_VEHICLE_LOD_DISTANCES retuned [0,95,190] -> [0,36,75] and the baked shadow silhouette decimated, with the geometry cache preserved. Presentation-only; no gameplay path touched. An earlier unmeasured attempt was reverted for allocating geometry per call and drawing the shadow as a flat disc.

### HF-337 — teammate Chopper Gunner audio must replicate
- Source: atomicnext.txt ("I am host, cant hear my team deathmatch partner chopper gunner?").
- Status: IMPLEMENTED (cbca7f68, 7851f1d6) - support fire is positional, and the per-shot unfed spatial chain is gone: every shot used to build TWO panner chains and feed only one, burning one of just 12 spatial voices for silence, which is how footsteps and explosions were starved during firefights. Budget check corrected to spatialChains + 1 (the railgun path still checks + 2 because it genuinely creates two). REMAINING, dispatched: the TDM listener test is a tautology so every shot is presented to every client; the 370ms voice hold exceeds the 280ms chopper cadence; there is no distance cull despite maxDistance 180; and sound-event-inventory claims enemies hear support fire 'at reduced volume' when no such gain reduction exists.

### HF-338 — health regenerates while controlling Chopper Gunner or Piloted Drone
- Source: atomicnext.txt row 8 (normal regen eligibility continues during possession unless actively
  damaged; host authority preserved; no client-authored healing).
- Status: IMPLEMENTED (97faa806) — regen now runs from the fixed-step loop independent of playerSimulationEnabled(), so it continues during Chopper Gunner and drone possession; the old inline block was removed so exactly one regen path exists.

### HF-339 — rare-weapon spawn announcements unmistakable to every player
- Source: atomicnext.txt ("need clearer announce of rare weapon spawns mid game to all in the
  match").
- Status: IMPLEMENTED - both recorded gaps are closed and re-verified 2026-08-23
  (lane K). Audio: a69988d8 wired presentation.audioCue via the existing
  audio.overdriveAvailable() sting (occurrence, not vocabulary, so the
  sound-event inventory digest is unchanged); audioCue is null outside
  warmup/active by authored intent. Banner race: f83cefc8 routes the spawn
  banner through the banner arbiter ('announcement' channel), so a spawn inside
  the ENGAGE window queues and is promoted instead of being overwritten and
  hidden. All four channels (feed, banner, audio sting, minimap ping) consumed
  at both legacy-main call sites; rare-weapon-announcement + banner-arbiter
  suites green.

## P1 — arms, weapons and presentation

### HF-340 — right arm bent strangely (left is correct; thickness/coverage retained)
- Source: pass74.txt ("arm thickness seems better and goes off screen nice, but the right arm is
  bent strange, the left looks ok").
- Status: IMPLEMENTED (970d4c52) — right elbow pole rebalanced lateral-dominant with family/high-ready blending; symmetry probe added; praised thickness and crop framing untouched.

### HF-341 — arms look bad with pistol and during knife stab
- Source: pass74.txt ("arms look abd with pistol and when stabbing with knife") plus atomicnext.txt
  row 10 (full shipped-catalog arms pass).
- Status: IMPLEMENTED (970d4c52) — handgun +40m support-arm stow teleport replaced with a posed two-hand grip blended across the reload boundary.

### HF-342 — arms and gun clip through floors and walls
- Source: pass74.txt ("arms and gun still clip through floor and walls etc").
- Status: IMPLEMENTED (cbca7f68) — two-pass WebGPU viewmodel overlay so arms and gun no longer intersect world geometry, with self-occlusion preserved and the WebGL2 route untouched.

### HF-343 — near-cover weapon push-up still allows crosshair fire; find the balance
- Source: pass74.txt ("sometimes when behind cover gun moves up but can still shoot like crosshair,
  doesn't lok right... its cool it goes up when near walls etc but need to find a balance").
- Status: IMPLEMENTED (cbca7f68) — obstruction/high-ready blend exposed with a graduated spread penalty; the fully-raised fire gate is specified in a handoff for the tryFire call site.

## P1 — maps and world correctness

### HF-344 — invisible blockers across maps, including the Atomic Acres upstairs front window
- Source: atomicnext.txt P0-2 ("Invisible blocker at the upstairs front house window";
  "issues with invisible assets blocking me in many maps").
- Status: IMPLEMENTED (bcad57e4) - genuinely wired this time. The cbca7f68 claim was false: glass-collider-bounds.ts had zero production importers and legacy-main still used Box3.setFromObject. Wiring it alone was a REGRESSION - Skyline Terminal ships houses: [] so authored resolution returned null and six intact facade windows became walk-through, proven by probe. Fixed with an authored-geometry fallback (the mesh's own geometry box, NOT setFromObject, whose descendant union is what caused HF-344 originally). Four behavioural tests pin it; the previous source-text test passed throughout the regression.
- Arena-wide close-out 2026-08-23 (lane K): src/invisible-blocker-audit.ts now
  sweeps EVERY movement collider in all six arenas against visible leaf-mesh
  volumes (per-mesh geometry boxes, never setFromObject; house-destruction
  instanced fragments counted via their authored volumes). It found two REAL
  invisible blockers in Atomic Acres - `authored-extra-lamp-collider-0` at
  (-29,4) and `authored-reclamation-tank-collider` at (-31,4), 5.6 m tall
  volumes specified in the Pass 27 world-identity spec but never built in any
  art layer. Fixed by shipping the promised visuals in environment-assets.ts
  (service masts at (+-29, -+4), west reclamation tank); collider data
  untouched. invisible-blocker-audit.test.ts pins zero interior findings on the
  five owned arenas. Farcrysis is RECORDED rather than gated for its owning
  lane, and the record is now an assertion instead of a console warning nobody
  reads: zero interior findings, exactly four `perimeter-containment` walls at
  x/z = -+32.2, y -4.5..4.
- CORRECTION 2026-08-23 (lane K): the line above previously claimed a live walk
  "receipt at artifacts/qa/". There was no receipt - the only file there was a
  77-byte `.json.tmp` holding a stray vite banner line, written before the probe
  produced anything. The walk has now actually been run, and the harness needed
  three real fixes first: it passed `release=latest`, which makes the app resolve
  a release channel and SELF-NAVIGATE, destroying the execution contexts the walk
  holds (it died mid-teleport calling `snapshot()` on an undefined debug API);
  it evaluated against the debug API without waiting for it to come back after a
  reload; and worst, its sampled visible-mesh boxes live on `window`, so after a
  reload every blocked move would have looked UNEXPLAINED and the walk would have
  manufactured findings. Lost samples are now counted as `reloadsSurvived` and
  discarded instead.
- LIVE WALK PASS 2026-08-23: all six arenas, 180 teleport cells, 704 real
  W-key movement tests, ZERO findings. Receipt:
  artifacts/qa/invisible-blockers-live-walk-2026-08-23.json. The hardening was
  load-bearing, not cosmetic: rustworks logged 48 lost samples, high-seas 76 and
  atomic-acres 120, all from concurrent lanes editing this shared worktree - each
  one a false finding the old harness would have reported or a crash it would
  have died on. Every arena still cleared its full grid.
- Instanced-geometry fix 2026-08-23 (lane K): `meshWorldAabbs` read an
  InstancedMesh's ROOT matrix, which is normally the identity. That invented a
  phantom visible volume at the origin - which could falsely EXPLAIN a collider
  and so HIDE a real blocker - while missing every place the geometry is
  actually drawn. It now expands per-instance world AABBs, which is also why
  arenas dressed with instanced props no longer need the `extraVisualVolumes`
  escape hatch. Pinned by a test where a collider under a drawn instance is
  explained and a collider at the instanced root is reported.

### HF-345 — prone clipping near walls across arenas
- Source: atomicnext.txt ("clipping when prone and near walls in many maps too").
- Status: IMPLEMENTED — prone clearance solver landed with 15 tests. Consumption in applyStancePose still owed.

### HF-346 — Terminal z-fighting; zero persistent coplanar flicker on any level
- Source: pass74.txt ("rust and terminal still issues") + atomicnext.txt ("z fighting on some assets
  in terminal map, should be none on any level").
- Status: IMPLEMENTED (bcad57e4) - the exemption is now direction-aware. Positive offsets are rejected outright and the visually-upper surface must hold the more negative effective bias. skyline-floor-joint-z -2 -> -3. Coupling verified by reverting that single offset, which reports exactly the 5 inverted pairs the audit named. All five arenas: zero pairs.
- CLOSED 2026-08-23 (lane K) - and the earlier "zero pairs" was true but did
  not mean what it looked like. `collectHorizontalOverlaySpecs` only ever saw
  thin (<= 0.05 m), axis-upright BoxGeometry decals. It reported zero on every
  arena while the owner was still looking at flicker in Terminal, because the
  real offenders were neither thin nor decals: full-size solid boxes whose SIDE
  faces land on one plane where they abut. That instrument could not express
  the defect it was asked about.
- New depth pass in src/coplanar-surface-audit.ts
  (`collectCoplanarSurfacePatches`, `findCoplanarSurfaceOverlaps`,
  `arenaCoplanarSurfaceAudit`): works from world TRIANGLES, so it sees boxes,
  prisms, cylinders, instanced copies and merged presentation batches alike,
  and asks the rasteriser's question - two surfaces from different objects, on
  one plane within the depth-precision threshold, facing the SAME way (so both
  survive backface culling), overlapping in that plane. It excludes only what
  cannot flicker: depthWrite/colorWrite-off materials (exactly how Skyline
  neutralises its quality-placeholder colliders), invisible and
  near-transparent materials, distinct polygonOffset or renderOrder tiers, and
  downward faces at or under the ground plane. The existing decal sweep is
  untouched and still runs.
- It found 34 real coplanar surfaces in Skyline Terminal, identical across all
  three presentation profiles. Three authored causes, all fixed in
  additional-maps.ts with no collision weakened: (1) the side walls ran to
  z = -34.3, the back wall's own outer plane - a 0.10 m x 7.0 m full-height
  flickering seam at BOTH rear corners; they now stop at the inner face
  (z = -33.9) and the back wall widened 62 -> 62.6 so it still seals the
  corner. (2) All four perimeter fences ran the full 72 m and crossed at every
  corner - eight coplanar 0.40 m x 3.0 m faces ringing the map; east/west now
  butt BETWEEN north/south at 71.2 m, and the corner cells stay filled by the
  north/south colliders. (3) The silver ceiling ended on the back wall's outer
  plane, a 0.07 m x 62 m hairline band across the whole rear elevation; it now
  terminates BURIED inside the wall (z = -34.1), so its rear face is enclosed
  rather than sharing a visible plane, with no gap at the junction.
- Skyline Terminal is GATED at zero in all three profiles. Every fix is
  mutation-checked: reverting the fence length alone reports exactly the fence
  pairs, reverting the ceiling alone reports exactly the ceiling band. A
  companion test proves collision was not traded for the fix - both rear
  corners and all four fence corners are still solid, the three shell walls'
  inner faces are unmoved, and the back wall demonstrably spans the side walls.
- The other four arenas are RECORDED, not gated (their sources belong to other
  lanes): rustworks-1v1 131, gun-range 108, high-seas 88, atomic-acres 8. All
  eight of Atomic Acres' are the fence-corner pattern this row just fixed in
  Terminal, so the same shortening transfers. Those ceilings fail loudly if an
  arena regresses.

### HF-347 — RustRig, Terminal and Gun Range multiplayer faults
- Source: pass74.txt ("rust and terminal still issues anmd gun test level when multoiplayer").
- Status: IMPLEMENTED (857d48cc + 392c5920, 2026-08-23) — the RustRig/Terminal "can't move"
  fault was reproduced mechanically by a new two-browser matrix
  (scripts/qa/verify-hf347-arena-movement-matrix.mjs: local PeerJS, host creates room, guest
  joins, host swaps maps WITH the guest in the room, both press W) and root-caused: the
  world-repair admission burned one attempt per stale killstreak snapshot, and the host emits
  several force-reliable snapshots at match start, so the guest's whole cap was gone before its
  first repair-ready round-tripped — spawned dead, no respawn, forever. Attempts are now spaced
  (client-world-repair-admission) and exhaustion waits for the final attempt's answer window.
  Matrix now covers 6 lanes with explicit modes (TDM on rustworks/terminal/high-seas, FFA on
  atomic-acres/farcrysis, gun-range special-case) and asserts MUTUAL VISIBILITY per lane; 6/6
  PASS, three consecutive runs. Two-machine HITL remains the human close-out bar.
- Prior partial: Gun Range lane closed at source (5952893f, 2026-08-22): training-dummy
  damage is now host-authoritative end to end. Poses already replicated on host time
  (currentHostTimeMs); now resolveAuthoritativeShot targets dummies at the exact host-time
  pose, guests never self-apply dummy damage (shot result reconciles health/score/feed with
  the exact host respawn stamp so lifeIds match), and lobby snapshots replicate
  {active, health, respawnAtHostTimeMs} every heartbeat for observers/rejoiners.
  18 new tests (`gun-range-dummy-replication.test.ts`). Diagnosis: PASS74_HF347_GUNRANGE_DIAGNOSIS.md.
  Still owed: the live two-browser host/guest matrix (close-out bar), and the RustRig and
  Terminal lanes, which are separate faults ("cant move" — see HF-347 source rows).

### HF-348 — tactical/explosive crossbow bolts break glass in solo and hosted authority
- Source: atomicnext.txt ("tac crossbow bolt and explosion didn't break glass").
- Status: ALREADY-FIXED at source (both bolt phases break glass solo+hosted, replicated). Closes only via the live two-browser matrix.
- Re-verified 2026-08-23 (lane K). There is exactly one crossbow - the TAC-15
  `explosive-crossbow` - so the owner's "tac crossbow bolt AND explosion" is
  its two phases, not two weapons. Both were covered on the HOSTED side (guest
  prediction stays presentation-only; host-canonical panes admit exactly once)
  but nothing pinned the SOLO path, where the local player is its own
  authority. Test added to pass72-crossbow-glass-contract.test.ts: solo bolt
  impact breaches its pane, the solo blast detaches a second pane (the
  explosion profile carries more damage than a bullet, so the pane leaves the
  frame - still open, still non-solid), and a replayed phase is refused so solo
  cannot double-count a break. Source unchanged.

## P1 — explosives and audio

### HF-349 — Semtex sometimes produces no visible explosion
- Source: atomicnext.txt row 4 (one authoritative detonation → visible blast, lighting, particles,
  damage and audio at the exact position; cold/warm, player/bot, solo/hosted, both browsers).
- Status: IMPLEMENTED (970d4c52) — blast survives a frame hitch via presented-frame accounting, longer decay, visible initial ring and non-additive smoke.

### HF-350 — continuous buzzing after a bot Semtex in 1v1; stray background noises
- Source: atomicnext.txt rows 5–6 (locate the actual Web Audio owner; bounded stop/disconnect on
  completion, death, map change, pause, rematch; never mute-all as a fix).
- Status: IMPLEMENTED (audit fix) — ambience ducking now actually recovers. The duck was armed by every explosion while recoverAmbienceDuck() had ZERO callers, so after the first grenade the ambience bed stayed at 40% for the rest of the match on every map. Now released each frame from updateSensoryFeedback. Live bisect of the reported buzzing is still owed.

### HF-351 — explosion audio quality restored; ambient and immersive audio richer
- Source: pass74.txt ("better ambient and immersive sounds and screen animations/flashes pulses etc,
  better quality sounds etc, richer game") + atomicnext.txt row 6 (punch, transient clarity,
  distance/occlusion, per-explosive identity; waveform/spectrum evidence; owner HITL for taste).
- Status: IMPLEMENTED (970d4c52) — spatial explosionAt with per-family layers, HRTF panner, tinnitus tail, ambience ducking. Owner taste remains HITL.

### HF-352 — screen feedback: hit flashes, damage pulses, immersive animation polish
- Source: pass74.txt ("screen animations/flashes pulses etc ... richer game").
- Status: IMPLEMENTED (970d4c52) — camera-shake and kill-confirm-pulse modules; accessibility-scaled. Wiring into the frame loop pending.

### HF-362 — total HUD/UI/menu reskin: keep layout and functionality, look cool, feel alive
- Source: owner directive 2026-08-21 ("total HUD/UI/MENU reskin and overhaul its a big stale, keep
  the layout and functionalities, just makeing it look cool and feel more alive").
- Bounds: layout and every functionality/surface preserved (typed surface registry inventory is the
  contract); direction is the retro-military operations-terminal style guide; every text pair >=
  4.5:1; min sizes per AGENTS.md at 1280x720; "alive" = purposeful motion (transitions, pulses,
  scan accents) gated by prefers-reduced-motion and the accessibility scale; zero new gameplay
  authority. Owner taste is HITL.
- Status: IMPLEMENTED (51c440f0), then CORRECTED 2026-08-22 (cc4e16df) after the owner reported the
  result still reads stale and the killstreak screen is "hard to see, read and use". The earlier
  reskin had left three concrete defects, all now fixed in src/ui/pass74-visual-refresh.css:
  (1) #menu-panel-streaks was painted a "full dark console plate" (rgba(8,24,29,.98) ->
  rgba(4,12,16,.99)) with #0c1a20 cards inside an otherwise light deck - a near-black island, and
  a direct AGENTS.md brightness violation; it now shares the deck surface.
  (2) Each card's plain-language reward description sat at the 10px floor of --pass66-micro in
  #a3b8ba; descriptions are now 13px body text at 1280x720 and selection is signalled three
  redundant ways (accent fill, inset bar, elevation) instead of a 1px border colour.
  (3) REAL LAYOUT BUG on every navigation tab: tactical-ui.css:382 absolutely positions the `01`
  badge while pass66-overhaul.css:174 lays the button out as `30px minmax(0,1fr)` assuming the
  badge occupies column 1, so the title fell into the badge column and printed on top of the
  sublabel ("DEPLOY" over "ARENA + LOBBY"). Fixed with explicit grid areas.
  Also: every sub-9px violation in the deck is gone (8px settings/leaderboard labels, a 7px
  advanced-graphics note) - a DOM sweep of all four tabs reports ZERO elements below the contract
  floor at 1280x720 and 1920x1080 with zero horizontal overflow. Owner taste remains HITL.

### HF-363 — filmic grading, canopy light and procedural-jungle visual quality
- Source: owner shared https://x.com/prasenx/status/2087604022849184080 as "a great example of high
  quality visuals from Claude" and asked for methods that bring that quality here.
- Reference resolved: a fully procedural first-person Three.js jungle (zero external art assets;
  every texture, mesh and sound generated in code), built with the Gauntlet Loop. Companion repo
  `StarKnightt/jungle-trail` is **MIT licensed**, so it is a legitimate reference — but per the repo
  contract the techniques are REIMPLEMENTED in typed WebGPU/TSL; no GLSL or source is copied.
- Techniques adopted: (1) filmic grade chain in strict order — ASC CDL slope/offset/power plus
  channel crosstalk on the LINEAR side, then transfer function, then toe/midtone-contrast/split-tone,
  with tone mapping LAST; measured bloom and luminance grain; (2) atmospheric scattering baked to a
  cube and PMREM-prefiltered so sky and IBL share one function; (3) analytic canopy transmittance
  instead of leaf cards in shadow maps; (4) half-res dithered raymarch light shafts; (5) every
  procedural texture as a bakeable surface function with normals derived by Sobel sampling;
  (6) high-count instanced vegetation from two primitives (bent leaf card, swept tube) plus one large
  leaf atlas, with per-instance wind phase; (7) thin-lens DOF and depth-reconstructed motion blur;
  (8) mutually incommensurate ambient loop lengths so ambience never audibly repeats — folded into
  HF-351.
- Combat-safety bound: grading must not crush shadow detail where enemies hide, bloom must not blind,
  grain stays subtle, and vegetation gains no collision it did not already have.
- Gauntlet Loop assessment (recorded honestly): its published skill deliberately refuses to define
  round counts, scoring or stopping conditions and names the human as the only brake. That is
  incompatible with unattended operation, and this repo's frozen gates plus adversarial verification
  are already stricter. Adopt the shape — fan-out builders, a separate harsh critic, blind A/B
  against a reference — and keep our mechanical stop conditions. No licence is published for the
  gauntlet-loop skill repo, so nothing is copied from it.
- Status: IMPLEMENTED (cbca7f68) — filmic grade chain RENDERS: render-runtime -> filmic-grade-chain -> grade-profile, ordered CDL/crosstalk -> transfer -> TONE MAP LAST -> display shaping, fail-closed on re-order, per-preset selection wired. Fixed a latent bug where outputColorTransform defaulted true, so vignette and dither ran pre-ACES leaving dither ~20x stronger in deep shadow, and bloom threshold sat below 1.0 linear.

### HF-364 — landed-but-unwired modules must not read as closed defects
- Source: independent Opus 5 audit of the overnight commits, 2026-08-22.
- Finding: roughly 1,400 lines across ten modules are fully tested but have ZERO production
  callers — local-health-regen, team-prescription, killstreak-activation-gate, camera-shake,
  kill-confirm-pulse, rare-weapon-announcement, carpet-corridor-targeting, prone-clearance,
  coplanar-surface-audit, rendering/grade-profile — plus audio's HF-351 spatial path and the
  mobile look-rate integration. The green suite is inflated by tests that exercise unreachable
  code, and commit titles read as completions.
- Rule: a module is "landed, not wired" until a production call site exists. The owner-facing
  status of its row must say so, and no HITL package may imply those defects are fixed.
- Status: STANDING — wiring audit 2026-08-23: local-health-regen, team-prescription,
  killstreak-activation-gate, camera-shake, kill-confirm-pulse, rare-weapon-announcement,
  carpet-corridor-targeting, prone-clearance (64b78af2) and rendering/grade-profile all have
  production call sites now. coplanar-surface-audit is deliberately test-harness-only: its test
  audits all built arenas as a CI gate and it does not ship in the bundle — recorded here as the
  honest status rather than wired for wiring's sake. swim-state wired de0a8075.

## Retained positives — regression guards

### HF-353 — Railgun see-through-walls behaviour is right
- Source: pass74.txt ("rail gun see through walls is great") + atomicnext.txt row 11. No change in
  this pass may reintroduce the old wall-visibility failure or remove intended perception rules.
- Status: RETAINED-POSITIVE

### HF-354 — first-person arm thickness and off-screen framing are right
- Source: pass74.txt. Guard alongside HF-340's elbow correction.
- Status: RETAINED-POSITIVE

## P1 — new scope added by owner on 2026-08-21 (live directives)

### HF-357 — mobile controls, UI and HUD smoothness in landscape and portrait
- Source: owner directive ("get the mobile verison of the game a bit smoother in control/UI/HUD etc,
  landscape and horiztonal"). Improve touch controls feel, HUD scaling/legibility and orientation
  handling; mobile remains secondary to Chrome/Firefox desktop but must not be janky.
- Status: IMPLEMENTED (cbca7f68) — frame-rate-independent look stick, >=9px live-HUD floor, dead CSS generations removed, touch targets raised.

### HF-358 — water/ocean upgrade via typed WebGPU/TSL rewrite; swimmable water volumes
- Source: owner directives (mega-ocean, stylized-water and water+swim references; Forge map 3
  "tideglass" work by Codex on this machine). `abyssal-ocean` (MIT, pin `142265f5`) is an algorithm
  reference requiring an independent typed WebGPU/TSL rewrite; the stylized-water and swim posts are
  comparator/technique references. No code copying. Scope includes a swim movement state (enter/exit
  water volume, buoyancy, swim speed, restricted weapon handling, audio) so island water is
  traversable rather than a death barrier — host-authoritative like every movement state.
- Status: IMPLEMENTED (cbca7f68; movement-loop consumption de0a8075; replication + weapon
  restriction 878fe67e, 2026-08-23) — the reducers are consumed by updatePhysics (surface clamp
  gated to non-swimmable bodies, neutral buoyancy with commanded ascent/descent while swimming,
  no fall damage on water entry), the swimming flag replicates in PlayerSnapshot (remote swimmers
  present prone-at-surface), and firearms are restricted while swimming with a feed hint.
  verify-swim-state.mjs proves enter/hold/release on farcrysis AND that rustworks' non-swim float
  zone is unchanged. Note: a physics audit found the farcrysis SHORELINE cannot reach swim depth
  by walking (terrain/water level drift) — that fix rides the farcrysis terrain-authority lane.

### HF-359 — revive and improve the "farcrysis" map from a previous branch
- Source: owner directive ("improve and bring back the farcrysis map which was in a previous
  branch"). Locate the branch, assess state, restore into the candidate improved, pass the forging
  review (no floating geometry, matching authority, both profiles).
- Status: IMPLEMENTED WITH KNOWN GAPS (aa114737, audit fixes) — farcrysis revived as the fifth arena. Audit found and fixed two criticals: the research-station core was sealed by full-width north/south walls making its whole interior unreachable (with a bot patrol point inside it), and the per-frame animation driver was attached to a THREE.Group so wind, water, god-rays and vegetation LOD never ran at all. REMAINING GAPS, not fixed: menu preview media does not exist so the map card will 404; visible terrain displaces ~2.2m while collision is a flat plane; a spawn sits 1.10m from a palm collider; the sightline assertion was replaced with a vacuous >=0 check and the metric itself has no occlusion test.

### HF-360 — original character archetype skins lane (separate branch, staged)
- Source: owner reminder ("H3 and Blender offline to create original, copyright-safe character
  skins and rig animations in a separate branch for later integration. Start with three original
  archetypes: bulky symbiote-like, adventurous explorer-like, and naval special-operations-like.
  Cover selectable skins/animations and asset provenance." Explorer archetype first.)
- Licence gate: the Pass 73 external-source audit records MiniMax H3's Community License as
  excluding UK use absent written rights, and this machine is recorded UK. On 2026-08-21 Dave reaffirmed H3 use: it runs locally on his machine and is not for
  distribution; per that owner decision the gate lifts for local asset authoring. Recorded caveat:
  if a build containing H3-derived assets is later published, those assets ship with it — revisit at
  release time. The lane still starts from the Blender procedural operator pipeline, with H3
  assisting texture/concept work. All archetypes are original designs — no franchise likenesses.
- Status: SUBSTANTIALLY LANDED (skins branch b1f0bac5) - the pipeline RUNS and three original archetypes exist: explorer 1.0001/1.0, symbiote 1.0022/1.1, navalops 1.0000/1.0, none clamped. Nine GLBs verified by parsing the binaries rather than the receipts: 62 joints and 24 clips in every file, LOD reduction 8558 -> 6231 -> 3949 triangles. Three script defects were the real blocker: procedural objects were never linked into a collection (so matrix_world never updated, the silhouette gate measured every accessory at the world origin, and select_set made export impossible - which is why no GLB had ever been produced); an accessory hung 126mm below the floor; and the envelope baseline was measured after proportion edits, exempting the bulk multipliers from their own cap.
- INTEGRATED 2026-08-22 (a1934ac4 merge + a45b0f4e): skins lane merged into the integration line
  and wired end to end - lazy per-skin loader (LOD0/LOD1 shipped per archetype), lobby-skin
  protocol message + optional member/join skinId validated against the SELECTABLE catalog,
  host-authoritative adoption mirroring squad identity, snapshot replication with guest
  prefetch, OPERATOR SKIN lobby selector, and remote third-person presentation built from the
  replicated member skin. 36 new tests. Owner HITL (visual taste + hit-proxy parity in a live
  lobby) remains the close-out bar.

### HF-361 — mocap-to-animation route evaluated for in-game third-person animation
- Source: owner directive (mocap X references). `mixamo-llm-mocap` (MIT, pin `00dfd53`) is an
  offline third-person retargeting reference with separately governed dependencies; evaluate as an
  authoring-time route only, never runtime, and never for first-person arms.
- Status: IMPLEMENTED (ba4cd584) — docs/PASS74_MOCAP_ROUTE_EVALUATION.md written. Recommendation: do NOT adopt until the GVHMR/SMPL-X licence sub-gate is cleared; the MIT repo licence does not cover them.

## Process rows

### HF-355 — measured, bounded streamlining/refactor pass subordinate to correctness
- Source: atomicnext.txt ("Required streamlining/refactor pass"): measure hotspots first, decompose
  `src/legacy-main.ts` along real ownership boundaries (explosives/audio lifecycle, support
  possession/HUD, collision/contact, QA adapters), no whole-file rewrite, before/after evidence.
- Status: OPEN — the refactor lane failed leaving a broken 23KB extraction importing a non-existent module. Parked at ../pass74-parked/ rather than repaired, since a half-extracted QA adapter is a liability.

### HF-356 — local HITL preview only; no publication past Pass 73
- Source: owner instruction 2026-08-21. The pass ends with a locally served build and an owner
  checklist. No push to production, gh-pages, or the release workflow.
- Status: STANDING

## HITL 2026-08-23 — owner played the Pass 76 candidate

Raw findings from the live session, recorded verbatim-in-substance before triage
so none is lost or softened. These supersede any earlier "done" claim they
contradict.

### HF-365 — first-person arms read thin, badly held and badly animated
- Source: owner HITL ("the arms are thin and weirdly held and animated").
- Note: HF-354 previously recorded arm thickness as a RETAINED POSITIVE. The
  owner now says the opposite while playing, so that row is superseded here —
  believe the player, not the old status.
- Status: OPEN

### HF-366 — operator skins are unreadable in the menu; no preview of yourself
- Source: owner HITL ("i picked a skin but they all looked greyed out i have no
  idea what i look like? Should be a 2d and 3d preview and the arms should look
  diff too?").
- Scope: skin cards must show the actual skin, a live 3D preview of the selected
  operator, and the FIRST-PERSON arms must change with the skin.
- Status: OPEN

### HF-367 — cannot take control of Chopper Gunner / Piloted Drone
- Source: owner HITL ("i cant take control of chopper gunner or piloted drone
  when i press they key again? why").
- Root cause: the second press was evaluated as a fresh ACTIVATION. The charge
  had just been spent calling the platform in, so projectionEarned was false and
  the gate refused with NOT EARNED before the toggle code beneath it could run —
  a platform you had already paid for was permanently uncontrollable. A drone
  flying autonomously was also excluded from selection, so its key fell through
  to another activation instead of handing over the controls.
- Status: IMPLEMENTED — control-toggle presses are exempt from the charge and
  possession checks (they spend nothing) while the dead / match-phase / tactical
  map / targeting refusals still apply; autonomous drones are selectable.

### HF-368 — M14 EBR wall penetration too weak
- Source: owner HITL ("Ebr rifle can see through walls but needs better wall
  banging i think maybe 50% more pen"). The see-through-walls behaviour is a
  RETAINED POSITIVE (HF-353) and must not change.
- Status: IMPLEMENTED (3b79d9a2) - per-weapon `wallPenetrationMultiplier` term in
  ballistics.ts, authored 1.5 on the M14 EBR only (0.55 x 1.16 -> x1.5 energy);
  every other weapon pinned at 1. Tests: ballistics.test.ts "HF-368" describe
  (interior-wall before/after damage 0->11 and 4->15, brick still stops it,
  clear-path damage unchanged 37.2) + weapon-catalog.test.ts non-default-scalar
  sweep. HF-353 optic asserted untouched. Verified green 2026-08-23 (lane K).
- Wiring re-verified end to end 2026-08-23 (lane K), because this row was rated
  PARTIAL: catalog `penetration.wallPenetrationMultiplier: 1.5` ->
  combat/legacy-weapon-adapter.ts:138 -> WeaponPenetrationProfile ->
  `weaponPenetrationEnergy` (the single place the scalar enters the model) ->
  `traceBallisticPath`:299; LEGACY_WEAPONS is what gameplay.ts exports as
  WEAPONS. It is landed, not staged. Note for anyone chasing the hash: the work
  is inside commit 3b79d9a2, whose SUBJECT names only HF-374.

### HF-369 — Carpet Bomber second click (direction) is not explained
- Source: owner HITL ("should be clearer that the 2nd click of the carpet bomb
  is for its direction, animated on the map maybe when selecting the drop and
  direction pins").
- Status: OPEN

### HF-370 — HUD and menus are static and dated; the game does not feel alive
- Source: owner HITL ("the menus really don't look that different, it needs to
  be much more dynamic … maybe not even pinned directly to the screen … dynamic
  with how you look and move like most modern first person shooters … when you
  take damage and when you're breathing and when you're stationary … a lot more
  alive and a lot more modern, not like a game that's 20 years old").
- Scope: diegetic/parallaxed HUD response to look and movement, breathing and
  idle sway, damage reaction, weapon handling motion — modern-shooter feel.
- Status: OPEN

### HF-371 — not enough dust, particles and ambient life
- Source: owner HITL ("we need more like dust and particle effects and ambient
  sounds all sorts").
- Status: OPEN

### HF-372 — Farcrysis and High Seas have no menu preview or loading screen
- Source: owner HITL ("i'm going to need a preview like the other maps … on the
  main menu" / "need a decent loading screen for farcrysis and hijacked").
- Status: OPEN

### HF-373 — High Seas below-deck is too dark to play
- Source: owner HITL ("too dark down at the bottom of hijacked, needs sorting").
- Note: the below-deck rebuild's own follow-up predicted this exact risk and
  named the fix (a dedicated brighter emissive rather than sharing the
  engine-amber material, which requires extending the 13-material inventory
  contract and its test together).
- Status: OPEN

### HF-374 — Farcrysis did not boot for the owner
- Source: owner HITL ("i couldnt get farcrysis to boot").
- Note: every automated boot check in this repo runs headless, and headless
  Chromium on this machine cannot create a WebGPU device — so all six-arena
  green results were WebGL2-only while the owner plays WebGPU. A WebGPU-route
  arena boot sweep (scripts/qa/verify-webgpu-arena-boot.mjs) now exists to close
  that blind spot.
- Status: OPEN — verification gap identified, cause not yet isolated.

### HF-375 — bot and player animation/rig quality, per skin
- Source: owner HITL, with a shared reference on generating animation/rig work
  and the idea of generating reference video locally and describing it into an
  implementation. Scope: every bot and player model should have good rigs and
  animations, differentiated by skin.
- Status: OPEN

### HF-376 — audio quality across the board
- Source: owner HITL ("the sounds are all so bad").
- Status: OPEN
