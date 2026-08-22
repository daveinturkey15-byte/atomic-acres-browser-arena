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
- Status: PARTIAL (bcad57e4) - the checkpoint can now CROSS THE WIRE: satellite protocol module plus a pure send/receive/promote state machine, 48 tests, no protocol version bump (old peers drop the messages at the transport, which is the required fail-closed fallback). PROMOTION REMAINS DISABLED. Still owed, and none of it is cosmetic: network.ts has no role flip, no host stand-down path (a host can lose its signalling id while still serving guests, so two peers could both believe they own the match), and followers do not re-point at a promoted host. A separate real defect was found in host-migration.ts - authorizeSelfPromotion compares the guest's Date.now() against a host-stamped expiry with no rebase, the same class of bug the checkpoint clock rebase exists to prevent.

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

## P0 — browser parity and performance

### HF-331 — Firefox renders ~10 FPS against 150+ in Chrome; debug live and fix
- Source: owner directive 2026-08-21 (worse than the 60-FPS report in atomicnext.txt). Firefox and
  Chrome are the two primary browsers; both must use the explicit fail-closed WebGPU route with the
  same features. Diagnose live on this machine (installed Firefox, RTX 5080): determine
  WebGPU-vs-WebGL2 route actually taken, caps/VSync, adapter identity, long tasks, and frame-time
  distribution; fix without removing features. Edge/WebKit/Opera/mobile stay secondary.
- Status: PARTIAL - phase 1 landed (aa114737); phase 2 MEASURED IN PART on 2026-08-22 and the harness is now in the repo (scripts/qa/measure-hf331-firefox-gap.mjs). Established: (a) a headless measurement is WORTHLESS here - headless Chromium falls back to SwiftShader (software=true) and would have invented a gap; the script says so and defaults to headed. (b) On the real RTX 5080, chromium on ?renderer=webgl2 runs the quality Atomic Acres scene at 49.3 Hz against 150+ on WebGPU. So the WebGL2 COMPAT PATH ITSELF costs about 3x in Chrome, before Firefox is involved at all - and Firefox has no WebGPU on this machine, so 49 Hz is its structural ceiling. NOT established: the Firefox number. Playwright's Firefox would not get past launch/newPage on a machine saturated by concurrent swarms, and it left orphaned processes; the earlier combined run also hung because page.evaluate has no timeout and a starved rAF never resolves (fixed in the stage probe). The remaining question is precise: the owner sees ~10 FPS, the compat path explains 49, so about a further 5x is unaccounted for. Re-run both scripts headed on a QUIET machine to close it.

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
- Status: OPEN - GENUINELY UNWIRED, and naive wiring was REFUTED on 2026-08-22. An analyst produced seven anchor-verified legacy-main patches; adversarial verification rejected them for two concrete reasons. (1) The owner's 'exactly 10%' CANNOT be met from legacy-main alone: the port only returns true when the flamethrower's timed-map-weapon authority is grantable, and that authority is arena-bound (src/timed-map-weapon-authority.ts pins flamethrower to one arenaId), so the real rate is conditional, not 10%. (2) SINGLE-INSTANCE CANNIBALISATION: the only admissible transition is claimTimedMapWeapon, so a care-package grant CONSUMES the world pickup - on rustworks-1v1 the physical flamethrower would silently vanish mid-match with no feedback to a player already walking toward it. Closing this row honestly needs a weapon-instance decision, not a wiring patch.

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
- Status: IMPLEMENTED WITH A KNOWN GAP - ledger status was stale, verified 2026-08-22. src/rare-weapon-announcement.ts is wired and the visual announcement reaches every player. GAP: the presenter's contract advertises four channels and legacy-main:15533 consumes three, dropping presentation.audioCue - so against the owner's literal wording, 'unmistakable to every player' is met visually but NOT audibly. Roughly a one-line re-wire. Second issue recorded: #banner is shared unarbitrated state with four other writers, so a rare spawn during the ENGAGE window overwrites the ENGAGE banner and the ENGAGE timeout then hides the banner unconditionally.

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

### HF-345 — prone clipping near walls across arenas
- Source: atomicnext.txt ("clipping when prone and near walls in many maps too").
- Status: IMPLEMENTED — prone clearance solver landed with 15 tests. Consumption in applyStancePose still owed.

### HF-346 — Terminal z-fighting; zero persistent coplanar flicker on any level
- Source: pass74.txt ("rust and terminal still issues") + atomicnext.txt ("z fighting on some assets
  in terminal map, should be none on any level").
- Status: IMPLEMENTED (bcad57e4) - the exemption is now direction-aware. Positive offsets are rejected outright and the visually-upper surface must hold the more negative effective bias. skyline-floor-joint-z -2 -> -3. Coupling verified by reverting that single offset, which reports exactly the 5 inverted pairs the audit named. All five arenas: zero pairs.

### HF-347 — RustRig, Terminal and Gun Range multiplayer faults
- Source: pass74.txt ("rust and terminal still issues anmd gun test level when multoiplayer").
- Status: OPEN

### HF-348 — tactical/explosive crossbow bolts break glass in solo and hosted authority
- Source: atomicnext.txt ("tac crossbow bolt and explosion didn't break glass").
- Status: ALREADY-FIXED at source (both bolt phases break glass solo+hosted, replicated). Closes only via the live two-browser matrix.

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
- Status: IMPLEMENTED (51c440f0) — full CSS reskin against the style guide: palette, type scale, spacing, component states, motion behind prefers-reduced-motion. Layout and every surface preserved. Owner taste is HITL.

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
- Status: STANDING

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
- Status: IMPLEMENTED (cbca7f68) — water is registry-driven rather than hard-gated to RustRig, with one frozen band table shared by CPU buoyancy and GPU surface. Retired bodies hide before detaching. Swim-state consumption in the movement loop remains a handoff.

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
- Status: SUBSTANTIALLY LANDED (skins branch b1f0bac5) - the pipeline RUNS and three original archetypes exist: explorer 1.0001/1.0, symbiote 1.0022/1.1, navalops 1.0000/1.0, none clamped. Nine GLBs verified by parsing the binaries rather than the receipts: 62 joints and 24 clips in every file, LOD reduction 8558 -> 6231 -> 3949 triangles. Three script defects were the real blocker: procedural objects were never linked into a collection (so matrix_world never updated, the silhouette gate measured every accessory at the world origin, and select_set made export impossible - which is why no GLB had ever been produced); an accessory hung 126mm below the floor; and the envelope baseline was measured after proportion edits, exempting the bulk multipliers from their own cap. NOT INTEGRATED - nothing imports these assets (HF-364).

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
