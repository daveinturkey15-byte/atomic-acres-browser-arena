# Pass 65 Owner HITL Checklist

This document has two layers: a concise blocking owner/taste route for Dave, followed by the exhaustive mechanical evidence checklist that the integrator must precompute and Dave may review or spot-check. It is not approval by itself. Publication remains locked until Dave explicitly approves the exact preview source SHA named in the evidence header.

## 1. Immutable evidence header

The release integrator fills this before handing over the candidate:

| Field | Required value |
|---|---|
| Source commit | Full 40-character Pass 65 candidate SHA |
| Preview build | Immutable `pr-preview-<pr>-<sha>` identity |
| Preview URL | Exact URL, including build identity rather than a moving alias |
| Built at | UTC timestamp |
| Pull request | PR number and head/base lineage |
| Pre-approval manifest head | Full process-only `S0M` SHA descended from S0 |
| Acceptance matrix | Digest of `acceptance/pass-65.json`; sequential `R1..R99` mapping and every pre-HITL evidence policy pass, post-release R04 evidence is explicitly future rather than fabricated, `status="accepted"` is present because schema v1 requires it, and `humanAcceptance` is absent so the generic gate has exactly one expected error |
| Runtime tree | File count and SHA-256 tree digest |
| Asset manifest | Digest plus licence/provenance report |
| Required CI | Exact run ID and five required-job results |
| Browser/backend | Chrome version, actual WebGPU, adapter/vendor/architecture, no fallback |
| Settings | Quality, Performance and representative Custom effective-setting hashes |
| Test machine | RTX 5080, driver, display resolution/refresh |
| Stable fallback | Byte-exact Pass 63 subtree/tree digest and route; Pass 64 separately labelled failed-regression evidence |
| Best-netcode benchmark | Unchanged Pass 62 record/digest |

Fail closed if any identity is missing, abbreviated ambiguously, moving, mutable, or inconsistent; also fail if S0M changes runtime/release-shell bytes or its acceptance output has any error other than missing Dave approval.

## 2. Review setup

- Open the immutable preview, not `latest`, `normal`, the public live channel, or a local dirty server.
- Confirm the on-screen build/pass identity matches the evidence header.
- Confirm native Chrome reports actual WebGPU on the NVIDIA hardware adapter with no software fallback.
- Use the primary 2560×1440 display for the owner pass; retain the deterministic 1600×900 evidence corpus for comparison.
- Start on Quality, then repeat authority-parity scenes on Performance and stress-sensitive scenes on a recorded high-end Custom profile.
- Keep browser console/GPU error capture active.
- Use a fresh private match for lifecycle checks and a second peer for authority checks.
- Stop immediately on a device loss, wrong build, wrong backend, corrupted settings migration, cross-profile gameplay drift, or unexpected publication action.

## 2A. Concise blocking owner route

Use diagnostic grants and deterministic setup so this stays practical:

1. Confirm the full S0 SHA/build ID, real RTX 5080 WebGPU backend and clean browser/GPU logs.
2. Watch all four distinct prerecorded menu videos: judge the helicopter's smooth varied path and sleek cockpit, then the Gun Range cat's composed joyful POV loop and reduced-motion poster. Confirm browsing maps is immediately responsive and performs no live arena/render work.
3. Inspect Quality default, Performance and Custom; expand Advanced Graphics, set target FPS above 144, change representative supported controls and confirm each creates a visible/telemetry-backed runtime change after its labelled apply boundary, then reload.
4. Rename/use one custom preset, choose weapon/secondary/one grenade family, deploy, spend the grenade, verify a kill does not restore it, then use a corpse ammo pickup to restore exactly one; respawn and rematch.
5. In Gun Range, sample every new weapon and the reworked knife; focus on feel, identity, hands, clipping, passive motion, fire/reload, sound and effects.
6. Test damage directions, critical-health visuals/breathing and reduced-sensory behaviour.
7. Hear local/remote/bot footsteps and two contrasting arena ambience profiles.
8. Test smoke, flash, DMR smoke/wall rule, explosive bolt and the Railgun with a second peer. The Railgun's large map-spanning bolt must remain unmistakable to both players through buildings along its authoritative penetration path.
9. Test one intact-to-damaged shed sequence: F door, obstruction, visible aperture shoot-through, explosion detach, non-flat nudge and flat/sleeping bullet wake.
10. Exercise all five killstreak slot families with diagnostic grants, including retained Scout Sweep and Nuke. Earn a reward, die twice and consume it. Verify Care/Carpet targeting shows the admitted shared red ground X and Carpet shows its caller-only red route corridor; the Care aircraft faces forward, its crate descends under a visible parachute and `F to collect killstreak` works.
11. For the standalone drone, choose autonomous and first-person modes. During Chopper Gunner, press `F` to enter/exit at different times while flight remains AI. Stand beside a door/crate/weapon and confirm the one eligible world interaction owns `F`; support enter/exit becomes available only when no higher-priority world candidate is eligible. Aim away from a victim and verify support hit numbers remain over that victim, with no misleading centre-screen number.
12. Pause and resume several match starts: there is no unsolicited menu bounce, and the in-match menu blurs only the last valid gameplay frame with no retired map screenshot.
13. Visit every map on Quality and Performance, checking identical semantic cover/collision; observe bots use every catalog weapon and grenade over deterministic evidence, and verify Atomic solo reinforcement thresholds at 10/20/30/40 defeats. Then run one combined high-end Custom stress scene.
14. Complete one representative two-peer join/play/death/respawn/reconnect/rematch lifecycle.
15. Review the precomputed evidence summary, known issues, Pass 63 rollback rehearsal, Pass 64 regression record, staged `The Big One` Live identity and release-lineage plan; then approve, reject or defer the full S0 SHA. This HITL decision does not itself authorize publication; Codex must return with final publish-ready identities and ask separately.

## 2B. Precomputed evidence review and optional spot checks

Sections 3–12 are owned by the integrator and independent QA lanes. They must already be green and digest-bound at S0. Dave can inspect or repeat any case, but is not expected to manually reproduce the complete combinatorial matrix during the morning taste review.

## 3. Main menu and configuration

### Preview choreography

- Watch at least two complete loops for each map. The helicopter varies pitch, yaw, bank, turn bias, speed and height occasionally and smoothly; it never reads as a perfect orbit, a jitter source or a collision risk.
- Review the checked-in offline recipe/seed and the compressed output digest. Each loop contains natural occasional variation while remaining reproducible and inside the authored safe volume; runtime does not invent a second path.
- Inspect exterior fly-by and cockpit-adjacent moments. The canopy, frame, restrained instruments, interior/exterior materials, LODs and silhouette read as sleek and intentional rather than a hollow/blocky shell.
- Watch the Gun Range cat body/head/look-at path through a full loop. It notices purposeful details, moves comfortably, never clips, closes the loop cleanly and remains a joy to watch rather than idle camera drift.
- Enable reduced motion. Each preview keeps a strong, informative composition without rapid travel or disappearing content.
- Rapidly click Nuke Town â†’ Terminal â†’ RustRig â†’ Gun Range and back. The latest selection wins without black/stale frames, jank or retained decoders. Telemetry remains at zero arena constructions, gameplay pipeline compiles and WebGPU submissions until Deploy is pressed.

### Graphics

- Quality is the effective default on the capable target machine.
- Exactly Performance, Quality, Max and Custom appear at the top level; Advanced Graphics starts collapsed and legible, named profiles are uncapped, and committed advanced edits select Custom from the last named-profile snapshot.
- Target FPS accepts values above 144 and clearly distinguishes adaptive target from an optional hard/uncapped scheduler.
- Every visible advanced setting comes from the canonical WebGPU renderer-feature inventory, has a real runtime consumer and reports supported/effective/apply-mode state. Unsupported settings are disabled or clamped with a reason; they do not silently fail or masquerade as Cyberpunk technology the browser does not implement.
- Live-change and arena-reload settings behave as labelled.
- Render scale, shadows, filtering, atmosphere, particles, decals, bloom/exposure, material quality, dynamic-debris quality, motion and damage-flash controls persist correctly.
- Performance and Custom do not change semantic geometry, collision, recoil, damage, projectile, visibility, spawn, navigation or movement authority. In particular, Atomic's kitchen/sofa presentation must match the collider set in every profile.
- WebGL compatibility remains an explicit compatibility route rather than a silent WebGPU fallback.

### Audio and accessibility

- Master, effects/weapons, announcements, movement, ambience, menu music and in-game music controls are independent and persistent.
- Mute states, zero-volume states and resumed browser audio behave correctly.
- Reduced motion, reduced damage flash and reduced sensory effects visibly reduce presentation without changing shared gameplay.
- Keyboard/focus order, labels and escape/back behaviour work at desktop and narrow viewport sizes.

### Loadouts and streak selection

- Existing four curated kits remain present and coherent.
- The second row presents Custom 1/2/3 plus the approved fourth-tile behaviour.
- Rename accepts useful Unicode, rejects empty/oversized/unsafe input, survives reload and is not exposed to peers.
- Every custom preset selects one allowed primary, secondary and exactly one grenade family from Frag/Smoke/Flash/Semtex; only one grenade exists on spawn and carry never exceeds one.
- Five killstreak slots obey the exact frozen families: Scout/Adrenaline/Care; Yardhawk/Piloted Drone; two distinct Tri-Pass/Carpet Bomber/Hunter Swarm/Chopper choices; and mutually exclusive Nuke/Drone Swarm.
- Corrupt/old saved data recovers without destroying the last known-good selection.

## 4. Core combat feedback

- Take damage from eight compass directions while facing a fixed heading; every wedge points correctly.
- Rotate the camera between hits; existing and new wedges remain camera-relative.
- Receive concurrent damage from at least four sources; distinct directions merge and decay legibly without covering the reticle.
- Exercise bullet, pellet, explosion, self, fall/environmental and unknown-source damage.
- Cross the low-health threshold repeatedly; hysteresis prevents flicker.
- At severe health, verify pulse/vignette and breathing/heartbeat intensity.
- Recover, die, respawn, rematch and change arena; no low-health or direction effect sticks.
- Repeat with reduced-flash/reduced-sensory settings and confirm intelligible feedback; review the automated final-frame analysis against the frozen photosensitive-flash limits.

## 5. Movement, footsteps and ambience

- Walk, sprint, crouch and stop locally; cadence follows actual travelled distance and never emits while stationary.
- Observe a remote player and bot at near/mid/far distances; attenuation and left/right panning follow position and speed.
- Teleport, respawn or reconcile a peer; no burst of queued footsteps occurs.
- Move across defined surfaces; sound identity changes at the correct physical boundary.
- Visit every arena and identify its distinct continuous environmental ambience.
- Switch arenas repeatedly; old ambience and spatial voices stop rather than accumulating.

## 6. First-person presentation and weapon corpus

For every selectable firearm, crossbow and knife, inspect:

- Equip and unequip.
- Hip idle and passive breathing/inertia.
- Walk, sprint, landing and retreat from nearby geometry.
- ADS in/out where applicable.
- Fire, dry fire, recoil and recovery.
- Tactical and empty reload.
- Switch and melee/knife attack.
- Left-hand grip, wrist/finger deformation, magazine/bolt/pump/socket contact.
- Muzzle, casing, tracer, impact, report, mechanics and environmental tail.
- World/drop model and third-person presentation.
- Material response, texture density, LOD transition and absence of generic/debug fallback.

Reject clipping through the camera/world, detached fingers, mismatched sockets, excessive idle sway, authority-ray movement caused by visual animation, ripped/unlicensed content, shared generic assets that defeat the requested identity, or unbounded bloom/audio.

## 7. Arsenal role checks

Run short close/mid/long-range comparisons rather than judging feel from one target:

- Uzi-role SMG: fastest/most mobile close-range identity, steep falloff and weak penetration.
- MP5-role SMG: more controlled and useful at moderate range without becoming an assault rifle.
- Loud flashlight pistol: visibly occlusion-correct always-on light, slower cadence, stronger hit and bounded loud report.
- Explosive crossbow: slow bolt, stable attachment, canonical beeps and one small timed blast.
- Machine pistol: selectable, weakest damage/highest recoil secondary role.
- Balanced M4-role rifle: predictable 30-round generalist.
- Harder AK-role rifle: harder hit/penetration with slower, clunkier handling and stronger recoil.
- Existing LMG: selectable without accidental Pass 64 stat drift.
- Minigun: exact frozen spin-up and magazine values plus exactly 20% equipped movement reduction.
- Railgun: large 180m-or-longer core/halo bolt remains visible for the specified presentation window through map geometry to shooter and remote peer, aligned with the authoritative penetration endpoints and synchronized report.
- DMR: 2.5× thermal sees living targets through smoke but never through a solid wall.
- Slug shotgun: exactly one accurate projectile and distinct longer-range/high-recoil role.
- Revised scatter shotgun: lower total damage, wider spread and longer useful envelope without dominance.
- Knife: authored model/material/lighting, convincing attack and passive movement.

Spot-check recoil, falloff, wallbang, reserve/magazine, reload, switch and stance policies against the frozen balance report. No weapon may be “complete” with a missing bot/drop/replay/network/telemetry mapping.

## 8. Grenades and visibility

- Frag behaviour still matches its frozen comparator.
- Semtex has a dedicated wrapped-charge bundle silhouette in hand, flight and stuck states; it sticks on first valid impact and does not reuse a generic grenade model.
- Smoke deploys from a typed inventory slot, has a coherent lifetime, blocks normal visual/AI acquisition and does not block bullets.
- A late-joining peer reconstructs active smoke consistently.
- Flash detonates on first valid impact without countdown beeps; strength follows distance, facing and line of sight; a closed solid wall blocks it. The one strong whiteout excludes the HUD and recovers monotonically within DEC-14.
- Reduced-flash mode changes presentation, not the authoritative result.
- DMR thermal sees a living target through smoke while normal view does not; both views stop at walls.
- Grenade use, respawn, reconnect, duplicate/reordered messages and rematch do not duplicate effects or inventory.
- Spend the selected grenade, score a kill and confirm it remains depleted; then walk over a valid corpse ammo pickup and confirm ammo plus exactly one selected grenade replenish atomically. Repeat with duplicate/reordered pickup messages and confirm the cap remains one.

## 9. Destructible shed vertical slice and map rollout

Test each agreed outdoor-map placement, then the dedicated stress scene:

- At least two sheds appear in every map classified as outdoor by the frozen product decision.
- Dark-green corrugated cube base and pitched roof read correctly at near/mid/far range.
- Press F within range/LOS: the door opens or closes over one nominal second.
- Reverse/interact mid-motion; motion remains stable and authoritative.
- Interrupt with player, major debris and a host-resolved bullet; mesh, collider and state agree.
- Shoot an intact panel: decal/rim/hole presentation matches the authoritative aperture.
- Fire again through the visible aperture: the panel no longer blocks that trace.
- Fire beside the aperture: intact metal still resolves material, penetration and damage correctly.
- Saturate the bounded hole/dent budget; rendering and ballistics retain the same exact canonical aperture region, with no enlarged invisible shoot-through.
- Apply explosions below/at/above authored thresholds; dents, deformation, detachment and collapse are stable and exactly once.
- Walk into non-flat major debris; valid contact wakes and nudges it within bounded authority rules.
- Verify flat/sleeping debris settles and stops wasteful routine replication, then shoot it and confirm the host wakes/applies bounded impulse at any time.
- Late join, packet loss/reorder, death, rematch and arena reset reconstruct the same shed state.
- Confirm bullets, players, AI LOS, grenades and navigation agree on current dynamic geometry.
- Repeat the maximum-shed/debris stress case on High and Max; no cap, long-task, physics, GPU or network budget is exceeded.

Reject a visual-only hole, invisible shoot-through, render-only door, client-authored fracture, unbounded debris, runtime arbitrary CSG claim, or presentation that differs in gameplay authority by quality profile.

## 10. Killstreaks

- Earn/select/consume every streak through legitimate host-owned score flow. Unconsumed rewards survive repeated deaths; progress still resets per life and rematch clears the epoch.
- Adrenaline lasts exactly 15 seconds, applies the approved non-stacking damage/move/reload modifiers, expires on schedule and follows the agreed death policy.
- Care-package aircraft, parachute and crate lifecycle is coherent; F loot is range/LOS/sequence validated and exactly once.
- Care Package and Carpet Bomber targets produce a large host-admitted ground X visible to both peers; Carpet additionally shows its owner a large map-bounded red payload corridor before commit. Rejection, cancel, commit and expiry clean up exactly once.
- Inspect deterministic weighted reward evidence: the pool is derived from the unique catalog, contains retained Scout Sweep at the highest base-weight band and every present/future eligible nonretired streak except Care Package exactly once, recomputes under synthetic add/retire/rename/weight mutations, contains no retired/recursive entry, and gives selectable Nuke exactly 1%.
- Chopper flies under AI for 30 seconds, acquires valid targets, respects cover/LOS and meets the measurable four-to-five-second escape/survival envelope. Its gun defaults to AI; `F` enters/exits owner gun-only control at any active time, AI resumes firing on exit, the operator body stays vulnerable and no gun input changes flight.
- Carpet Bomber activation supplies only the frozen strip anchor semantics; host-seeded RNG chooses and communicates a random valid ingress, then resolves exactly 20 bounded zigzag impacts along the intended strip.
- Drone Swarm creates exactly 24 targetable 50-HP drones from a deterministic valid centre-map volume, begins in a spread-out formation with bounded separation, then distributes into divergent individual/small-group routes. It seeks eligible opposing living human players and bots indoors/outdoors, rejects allies/dead lives, performs unlimited host-authored 20-round reload loops until its 60-second hard expiry, and meets the frozen approximately-five-second exposure/escape survival-pressure band. Piloted Drone uses the same centre-volume authority for its single-unit spawn.
- Destroy drones within the frozen hitbox/core and per-weapon shot-count bands; no client can forge drone damage/death.
- Standalone Drone explicitly offers autonomous-AI or first-person owner-control deployment, reuses the Swarm drone asset/gun family, and restores player control on exit, destruction, death, disconnect and 30-second fuel expiry.
- Piloted Drone altitude controls use Space/Crouch, wall vision matches the approved railgun-like rule, HP is 50 and ammunition is exactly two 20-round magazines.
- Piloted/autonomous Drone and Chopper Gunner use their authored non-placeholder damage, readable unobstructed first-person camera/HUD, gun report/animation/tracer and target-world-position hit feedback. Deliberately aim away from the damaged target and reject any number placed at the caller reticle.
- While a support control session is available, overlap its `F` toggle with every door/crate/weapon prompt. Exactly one prompt/action appears, the eligible world interaction wins by the shared deterministic priority arbiter, and support enter/exit wins only after no higher-priority world candidate remains eligible and a fresh key edge occurs.
- Swarm and piloted variants use the identical immutable DroneGunProfileId; only reserve, lifetime and control mode differ.
- Across several seeded activations, chopper pitch/yaw/bank/direction/height variance is subtle and smooth; peers see the same path and targeting, LOS, cover, collision and 30-second lifetime remain unchanged.
- Verify pilot-body vulnerability policy, score attribution, spawn protection, rematch cleanup and late-join behaviour.
- Stress overlapping aircraft/drones/explosions/audio; entity, projectile, particle, shadow, audio and network caps remain bounded.

## 11. Multiplayer and lifecycle pass

- Complete one solo match and one two-peer private match on every arena.
- Exercise join, deploy, combat, death, respawn, loadout change/redeploy, disconnect/reconnect, late join, match end and rematch.
- Run selected smoke, flash, crossbow, shed and support-entity scenarios under injected delay, loss, duplication and reordering.
- Confirm host/client hashes converge after repair snapshots.
- Confirm clients cannot author ammo, reload, damage, health, score, rewards, support entities, visibility, doors, fracture or debris.
- Confirm bot rules and target acquisition remain coherent with smoke, sheds and support entities.
- From fixed seeds, prove bots derive and cycle every shipped bot-eligible weapon plus Frag/Smoke/Flash/Semtex without a stale hand-maintained roster. Synthetic future catalog IDs must auto-enrol or fail the completeness gate.
- On Atomic solo, bot count changes at defeated-bot totals 10/20/30/40 up to the existing cap, never at 5/15/25/35; rematch resets it and sibling-map rules do not drift.
- Confirm room links and presentation profiles do not change shared mechanics.

## 12. Performance, disposal and legal review

- Review per-arena High/Max CPU and presentation p50/p95/p99/max, >20/33/50/100ms frame counts, long tasks, GPU queue latency, compile/decode/upload events, draw, triangle, texture, transient target, shadow, particle, audio-node and physics-body evidence. Average FPS alone cannot pass this gate.
- Compare foreground native-WebGPU Atomic Acres and Terminal in the same build across loading, movement, combat and support stress. Atomic must meet the frozen absolute bounds and allowed delta rather than merely avoid a crash.
- Repeat worst-case smoke + explosions + two sheds + drone swarm + combat scene.
- Change arenas at least ten times; resource counts settle near baseline and no continuous audio/physics/render resources leak.
- Start/join each map repeatedly and pause/resume during countdown and active play. No transition stalls, frozen visible frame, unsolicited menu opening or retired Nuke Town screenshot is allowed.
- Review `F-R610-01`: ten delayed A→B→C arena plus chooser/latest/normal/room/stable/back same-tab circuits, including pagehide/pageshow, show zero Three.js `isReady`/GPU errors, stale-generation mutation, duplicate owners or lifecycle-counter growth.
- Check browser console, uncaptured GPU errors and device-loss status.
- Inspect the asset/provenance manifest for every new model, texture, animation, sound and music stem.
- Reject missing checksums/licences, proprietary franchise assets, or undocumented external code/data.

## 13. Owner disposition

Choose one outcome and record it against the full candidate SHA:

- **APPROVE EXACT SHA** — candidate satisfies owner HITL; only the acceptance-manifest/process-only commit permitted by the repository policy may follow.
- **REJECT** — list observed failures with arena, mode, weapon/entity, reproduction steps and evidence.
- **DEFER** — candidate remains unpublished; identify checks not completed or decisions still open.

Approval wording should explicitly name the full candidate SHA. Any later change to runtime, release shell, assets, gameplay data, settings, network schema or public topology invalidates the approval and requires a new immutable preview.

After approval, the integrator must still run the post-approval acceptance commit gates and exact-merge gates, then stop at the publish-ready exact main SHA. Codex must show Dave the final checks and topology and obtain a separate explicit publish confirmation. Only then may the protected production workflow run. Public checks must show Pass 65 Live as `The Big One`, byte-exact Pass 63 Stable, Pass 64 absent from the Stable role, and the frozen Pass 62 offline/reconstructible policy. Owner HITL approval validates named S0 source and runtime/release-shell trees; it is neither publish authorization nor evidence that production succeeded.
