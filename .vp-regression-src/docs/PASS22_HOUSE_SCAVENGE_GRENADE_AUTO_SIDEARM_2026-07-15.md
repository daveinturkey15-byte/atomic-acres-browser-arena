# Atomic Acres Pass 22 — Traversable Houses, Scavenging, Stable Grenades, and Marksman Auto Sidearm

Date: 2026-07-15
Status: ramp/scope hotfix published to isolated review; canonical root and Pass 21 preserved
Branch: `overhaul/house-loot-grenade-pass-22`
Baseline: Pass 21 source `67ca0c2`

## Overview

Pass 22 converts Dave's Pass 21 playtest feedback into shared architecture, inventory, grenade, and weapon contracts. It remains an additive isolated review candidate; canonical Pass 20 and review/pass21 remain unchanged.

## Requirements

### R1 — Broken-window traversal

- Every breakable house pane must reveal a real character opening.
- A standing capsule must not walk directly through the sill/opening.
- A player who jumps and crouches must be able to pass through the opening in either direction using the real controller.
- Glass continues to block shots until broken but never becomes a hidden movement collider.

### R2 — Ramp, door, and room clearance

- Move each continuous ramp away from exterior/interior door circulation.
- Slightly widen the usable rooms while retaining exactly two ground rooms and two upper rooms per house.
- Preserve the rendered and Rapier-physical exterior incline, then add a smaller rendered and physical interior incline per house; no hidden step substitution.
- Front-to-rear ground route and ramp route must pass in both directions with the real capsule.

### R3 — Floor continuity

- Ground, upper floor, landing, and ramp-top pieces must positively overlap at traversal joins.
- No terrain slit, dark floor gap, raw slab seam, or collision lip may remain in ordinary interior or oblique exterior views.
- Finish geometry remains non-colliding and derives from the shared architecture declaration.

### R4 — Walk-over scavenging without forced swap

- Moving directly over an available death drop automatically scavenges ammunition for the player's currently carried weapon, regardless of the dropped weapon identity.
- Scavenging never changes the equipped or primary weapon.
- The drop's weapon remains independently available for explicit `F` swapping after its ammo payload is scavenged.
- Ammo payload and weapon payload are independently consume-once, expiring, stably identified, replicated, and non-duplicating.
- Full ammo plus full grenades must not consume the ammo payload.

### R5 — Two-grenade inventory and drop refill

- Fresh deployment, respawn, and rematch provide two grenades.
- Grenade cap is two.
- Successful walk-over scavenging restores exactly one grenade up to the cap.
- Throwing and exploding grenades must not stall/freeze the game loop.
- Explosion work, particles, audio, collision queries, and cleanup must remain bounded.

### R6 — Marksman full-auto machine pistol

- The marksman/sniper kit receives a Glock-style full-auto machine pistol labelled `G18 AUTO` in-game.
- Existing kits retain the service pistol.
- The machine pistol is automatic, compact, close-range, lower damage per shot, and balanced by recoil/cadence/ammunition.
- It reuses/adapts the approved pistol asset rather than adding an unaudited external asset.
- Its principal projectile, permanent reticle, and physical ADS sight inherit the same authoritative centre-ray invariant as every other gun.
- Its local and replicated shot cadence is validated through the canonical weapon registry.

## Acceptance criteria

- C1: Shared architecture tests prove every window has stable dimensions/IDs and a crouched airborne capsule route; standing direct traversal remains blocked by sill/lintel geometry.
- C2: Door/ramp clearance tests prove positive separation and bidirectional front/rear/ramp traversal for both mirrored houses.
- C3: Floor/landing/ramp-top declarations have positive overlap; browser pixels show no visible floor gap.
- C4: Pure drop tests prove independent ammo and weapon payload consumption, no forced swap, caps, expiry, and idempotence.
- C5: Browser input proves walk-over scavenging restores carried-weapon reserve plus one grenade and leaves the dropped weapon available for `F`.
- C6: Protocol/multiplayer QA proves one replicated scavenging transition and one later weapon-swap transition cannot replay or manufacture ammo/grenades.
- C7: Initial/respawn/rematch grenade count is exactly two; each drop restores at most one up to two.
- C8: A real grenade throw reaches explosion/cleanup without long task, page error, frame stall, unbounded transient count, or frozen simulation; repeated bounded throws remain healthy.
- C9: Marksman deploys sniper + `G18 AUTO`; other kits deploy their existing primary + service pistol. G18 hold-fire cadence is automatic and bounded.
- C10: Registry-wide deterministic and Chromium tests include the new machine pistol in reticle/principal-ray/physical-sight coverage.
- C11: TypeScript, all deterministic tests, full serial Chromium, two-peer QA, visual/performance checks, build, release-tree scan, dependency audit, exact-artifact checksum, and public HTTPS checks pass before publication.
- C12: Publish only to a new additive `review/pass22/` subtree; canonical root and all earlier review subtrees remain unchanged.

## Decisions

- Dave's phrase “five two grebades” is interpreted as “give two grenades,” consistent with the following refill request.
- Walk-over scavenging uses a tighter radius than `F` weapon interaction so merely seeing a prompt does not consume supplies.
- Ammo and weapon availability are separate state transitions; this avoids auto-loot deleting a gun before the player can choose it.
- The sidearm is described as Glock-style/G18 AUTO without implying affiliation or importing proprietary assets.

## Implemented contract

### Shared house architecture

- House width: `20.2`; depth: `16.4`; wall thickness: `0.42`.
- Window sill top: `0.58`, above the controller's `0.42` auto-step but low enough for the real jump arc.
- Ground window opening height: `1.97`; width: `2.6`.
- The stance controller permits airborne shrinking from standing to crouch; airborne stand/prone transitions remain rejected.
- The original `2.8`-wide continuous incline remains fully exterior and joins its upper side landing without crossing either ground-door route.
- A separate `2.2`-wide interior incline rises through a deliberate framed floor well to a positively overlapping upper landing. Slim non-colliding rails/posts keep the route readable without becoming invisible barriers.
- The ground floor remains one overlapping slab. The upper floor uses `upper-floor-main`, `upper-floor-ramp-front`, and `upper-floor-ramp-rear` around the intentional ramp well, eliminating accidental seams while retaining real vertical circulation.

### Death-drop scavenging

- Manual weapon range remains `2.35`; automatic horizontal scavenging range is `1.05`.
- A drop now owns independent `weaponConsumedAt` and `ammoConsumedAt` transitions.
- Walking over a useful drop fills reserve for the currently selected carried weapon and restores one grenade up to two, without changing either selected or primary weapon.
- Explicit `F` consumes only the weapon payload. A depleted drop is removed only after both payloads are unavailable.
- Pickup replication includes `mode: 'scavenge' | 'weapon'`; distance, stable ID, nonce, payload availability, source weapon, and remote state admission remain validated.

### Grenades

- Spawn/reset/rematch inventory and cap: `2`.
- The old per-explosion expanding sphere plus independent `requestAnimationFrame` animation was removed.
- Explosion presentation is now a bounded ground ring/light in the main game frame loop: `280ms` lifetime and at most four active visuals.
- Grenade mesh, ring, material, geometry, and light cleanup are explicit; explosion telemetry includes total count, active visuals, age, and a frame heartbeat.

### Marksman sidearm

- Protocol ID: `machine-pistol`; display name: `G18 AUTO`.
- Entitlement is derived from primary: sniper deploys `['sniper', 'machine-pistol']`; every standard kit retains `pistol`.
- Values: `20` close damage, `11` minimum damage, `900 RPM`, `20/80` magazine/reserve, `1.65s` reload, automatic fire, close-range falloff, sustained spread, and faster recoil presentation.
- It reuses the original authored pistol family with an extended magazine and `auto-selector`; no external asset or trademarked logo was added.
- Registry-derived model readiness, protocol admission, audio, hand sockets, recoil, physical sight, authoritative center ray, HUD, and multiplayer snapshots include the machine pistol.

## Local verification evidence

- TypeScript/lint: passed.
- Deterministic: `164/164` across 32 files.
- Production build: passed; output CSS `index-DRJOKkTa.css`, app JS `index-BgPEm9Ns.js`, Rapier `rapier-B45baom8.js`.
- Exact `dist/` checksum manifest: 27 files; manifest SHA-256 `4ff055c42fdaa9b912214412d3f3bad310e364aa8ff3983514e2315dbf362caf`.
- Release-tree verifier: `27` files, `0` rejected-candidate files, `0` oversized policy violations.
- Chromium: `26/26` passed in four bounded serial groups (`9 + 6 + 7 + 4`) because the gateway's 600-second outer command cap is shorter than this one-file software-WebGL suite. Assertions and per-test timeouts were unchanged. Coverage includes all six weapons' physical sight/reticle ray, sniper+G18 loadout, independent walk-over/F drop consumption, two-frag non-freezing explosion with frame heartbeat, real jump→airborne-crouch window crossing, houses/ramps/floors, match reset, and Quality/Performance budgets.
- Two-peer QA: passed with zero errors, opposite teams, 46.96-unit spawn separation, stance/window/scavenge/weapon-pickup replication, and authoritative ammo/grenade scavenging before the later independent weapon swap.
- Visual inspection: exterior side ramp is connected to the upper side landing and leaves the front/rear ground doors clear; the widened interior has continuous floor/ceiling surfaces with no visible hole or Z-fighting seam; G18 ADS telemetry reports `sightOffset [0, 0]`.

## Indoor-ramp and Longline-scope hotfix

- Runtime source commit: `199d5f1` (`fix: add indoor ramps and true sniper scope`).
- Each mirrored house now declares both `exterior-access-ramp` (`2.8` wide) and `interior-access-ramp` (`2.2` wide), each with a nine-anchor bidirectional route.
- Rapier controller tests ascend and descend both inclines in both house orientations. Door/window corridors remain clear and the floor-well sections positively overlap their landing.
- Static-batch sources now carry `staticBatchRendered: true`, allowing debug/QA telemetry to distinguish a deliberately hidden source mesh that is present in a render batch from geometry that genuinely disappeared. Performance remains within the existing `140`-call budget.
- Longline ADS uses a true angular 3× camera FOV: `2 × atan(tan(baseFov / 2) / 3)`. At the verified `82°` base FOV this settles at approximately `32.319°`.
- Once ADS/FOV convergence is reached, the opaque physical scope body is replaced by a centered circular scope picture and reticle. Ordinary HUD elements are suppressed during the scoped view; the authoritative camera-center shot ray is unchanged.
- Hotfix verification: TypeScript/lint passed; `167/167` deterministic tests passed across 32 files; all `26/26` Chromium scenarios passed in bounded serial groups; local two-peer compatibility QA passed with `errors: []`; Performance and Quality budgets passed; dependency audit found zero vulnerabilities.
- Exact hotfix artifact: 27 files; release-tree verifier clean; checksum-manifest SHA-256 `ab1d39a58aff11339b300f1b4f37da3a113e5fc591af37fa0d42254a7d47770b`.
- Final local visual checks confirmed the batched indoor deck, slim rails/posts, framed upper landing, retained outdoor ramp, clear 3× sight picture, centered reticle, no black optic occlusion, and no ordinary HUD bleed-through.

### Hotfix replacement release

- Runtime source: `199d5f1`; public-QA final-approach hardening: `66d1bba` (QA script only; runtime artifact unchanged).
- Pages deployment: `9b9b9dcb0b17481742657776d7cec47ba30d5c50` (`built`).
- Review URL: `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass22/?source=199d5f1&pages=9b9b9dc`.
- All 27 public files matched the exact tested artifact hashes.
- Public telemetry reported four ramps/four visible rendered ramps, two `2.8` exterior ramps, two `2.2` interior ramps, and nine anchors for each exterior/interior route.
- Public visual inspection confirmed the indoor ramp/landing and clear centered 3× scope. Browser console and JavaScript error buffers remained empty.
- Local and public two-peer QA both exited `0` with `errors: []`, stance/window/scavenge/weapon replication true, one remote per peer, opposing teams, and 46.96-unit spawn separation.
- The first public QA attempt exposed one remaining direct `2.2`-unit verifier teleport into the `1.05` pickup radius. The verifier now smooths that final approach over 12 bounded steps; production movement admission and pickup authority were not changed.
- Canonical root remained `index.html` blob `430899c6324a128ed99a4344c7de058be7eeb163` and assets tree `e328066cf30bdbfef9a4f08d5933d877d17ff113`; `review/pass21` remained tree `d3dfa8a6ceb60825c0be92f43c430467dedb0a78`.

## Isolated review release

- Gameplay implementation: `a5ffa28d58f6ef3967cf20efec7eb2e947da6ea3`.
- Public-QA bounded-staging hardening: `f45b97e0c8a41a58dd3771c8e91d1c6e7e79cb6f` (QA script only; runtime artifacts unchanged).
- Pages deployment: `922070af4d3cec2e7c083474e9f866b5bf2db9ce` (`built`).
- URL: `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass22/?source=a5ffa28&pages=922070a`.
- Public HTML, app JS, and CSS hashes match the exact tested local artifacts.
- Public solo smoke reached an active match with two houses, six windows, two grenades, marksman `sniper + machine-pistol`, and G18 `sightOffset [0, 0]`.
- Public two-peer QA exited `0` with `errors: []`, opposing teams, one remote per peer, 46.96-unit spawn separation, and stance/window/scavenge/weapon replication.
- Canonical root was preserved: root index blob `430899c6324a128ed99a4344c7de058be7eeb163`, root assets tree `e328066cf30bdbfef9a4f08d5933d877d17ff113`.
- Pass 21 was preserved: `review/pass21` tree `d3dfa8a6ceb60825c0be92f43c430467dedb0a78` and public index blob `47a8c6f28670481bac1f6867fc888eed0c396635`.

### Public-QA staging gotcha

**Symptom:** Local multiplayer QA passed, but the first public run timed out waiting for the guest to observe the host's post-death-drop staging position.

**Cause:** A debug teleport exceeded remote movement-admission velocity, and the verifier had not proved bidirectional convergence before emitting the next authority transition. Local latency happened to hide the rejected snapshot.

**Correction:** Wait for both peers to observe initial combat staging, then move later staging positions in bounded `0.2`-unit increments every `120ms` before entering the `1.05` scavenging radius. Production admission limits remain unchanged.

**Verify:** Both local and public `qa:multiplayer` now exit `0` with zero errors and independent `scavengeReplicated` plus `pickupReplicated` assertions true.
