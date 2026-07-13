# Atomic Acres — Classes, Melee and Field Support Pass 14

Date: 2026-07-13
Status: release candidate — local gates passed; awaiting immutable public deployment

## Overview

Pass 14 converts the good-feeling Pass 13 combat slice into a complete original class loop: two honest render modes, visible first/third-person bodies, one selected primary plus a shared service pistol, responsive knife melee, richer two-home interiors and three bounded earned field-support rewards.

Black Ops 2 is a qualitative benchmark for immediacy, legibility, compact contact times and reward cadence. Atomic Acres must not copy Nuketown's exact floorplan, dimensions, interiors, routes, props, sightlines, spawn coordinates, art, names, UI, animations, tuning tables or killstreak presentation.

## Requirements

### R1 — Visible combatants

- First-person sleeves, forearms, gloves, hands and weapon-contact pose remain visible in both Performance and Quality.
- Enemy and friendly operators remain visible in both modes at all playable ranges.
- Performance may simplify materials and micro-geometry but may not remove semantic body parts or team colour blocks.
- Presentation animation must not move authoritative hit proxies.

### R2 — Two user-facing render modes

- Options exposes only `PERFORMANCE` and `QUALITY`.
- Performance uses the Pass 13 Balanced lineage: responsive representation, palette-basic static materials, no shadows, no multisample AA, DPR cap 0.60, no full-screen grain/grade layers.
- Quality retains authored materials, static cached shadows and AA at DPR cap 1.0. Full-screen blend/grain overlays are disabled in both player-facing modes to protect the remote-display compositor path.
- Legacy `compat` may remain query-accessible solely as an automated diagnostic fallback, but must not appear in player-facing controls or persisted option cycling.

### R3 — Class loadouts

- Each of the three classes selects exactly one primary family.
- Every class also carries the same original balanced service pistol.
- Spawn, respawn and class change equip the class primary by default.
- Weapon switching toggles only between that primary and the pistol.
- Primary identity remains replicated; pistol identity and ammo are protocol-safe.
- No player can cycle into another class's primary without changing class through the existing menu/lifecycle rules.

### R4 — Service pistol

- Original compact semi-automatic pistol model, sound, muzzle/ejection/reload presentation and third-person representation.
- Useful close/medium-range fallback without outperforming primaries in their intended roles.
- Deterministic cadence, damage, spread, magazine and reserve rules covered by tests.
- Physical ADS and authoritative camera-ray endpoint rules remain unchanged.

### R5 — Knife melee

- Dedicated melee input plus a keyboard fallback.
- Responsive first-person arm/knife wind-up, contact and recover animation.
- Third-person presentation animation is separate from collision/hit proxies.
- One authoritative short-range forward attack per action, with cone/line-of-sight validation and bounded cadence.
- Damage, reach and timing are deterministic and tested.
- Multiplayer claims remain identity-bound and admission-checked; no client may manufacture unlimited melee hits.

### R6 — Original earned field support

Without copying commercial names or presentation:

1. **Scout Sweep** — reconnaissance role; temporarily reveals opposing positions through an original radar/HUD treatment.
2. **Yardhawk** — pursuit-drone role; one bounded autonomous aerial device seeks a legal opposing target and performs one strike.
3. **Tri-Pass Strike** — air-support role; three clearly telegraphed bounded map passes affect legal outdoor target regions.

- Rewards unlock from consecutive eliminations. Death resets the live streak counter but preserves earned unused rewards; match reset clears both.
- No hidden pay/progression layer.
- Effects, actors, audio and markers use bounded pools/capacity.
- Solo and multiplayer behavior must be deterministic enough for tests; hostile damage authority must not regress to trusting arbitrary remote packets.
- Names, silhouettes, sounds, UI and tuning remain original to Atomic Acres.

### R7 — Original compact two-home arena

- Preserve Atomic Acres' original overall identity and geometry lineage.
- Enrich both homes with readable ground-floor and upper-floor rooms, stairs, entrances, windows, cover and distinct colour/prop language.
- Preserve compact two-home/central-street functional pacing while retaining original route shapes, dimensions and sightlines.
- Add no copied Nuketown room arrangement, bus/truck composition, garden geometry, signage, mannequin placement or spawn coordinates.
- Keep radius-aware collision, arena bounds and out-of-map shot prevention.

## Mechanical acceptance checks

- C1: all deterministic/unit tests pass, including new loadout, pistol, melee and streak state tests.
- C2: browser debug proves first-person arm/hand semantic parts and at least one bot operator body are visible in both Performance and Quality.
- C3: options UI offers exactly two modes; persisted mode cycling cannot select Compatibility.
- C4: each class spawns with its selected primary; switching reaches only service pistol and returns to the selected primary.
- C5: melee executes one bounded hit window, respects range/occlusion/cadence and visibly returns to idle.
- C6: each support reward unlocks at its declared streak, activates once, remains bounded and resets correctly.
- C7: added presentation meshes remain non-authoritative and non-raycast where appropriate.
- C8: Performance passes the real Windows foreground pacing comparison and isolated compatibility budget; Quality remains smooth enough for the declared display path with telemetry recorded honestly.
- C9: full functional Chromium, production build, local/public two-browser WebRTC and visual/console QA pass.
- C10: release deployment changes only immutable `review/pass14/`; canonical Pass 12 and review Passes 03–13 remain unchanged until owner acceptance.

## Out of scope

- Exact recreation of Nuketown or any Black Ops 2 map/content.
- Copied commercial weapon/operator/drone/aircraft models, animation clips, UI, audio, branding or tuning.
- Ranked/competitive claims before fully host-authoritative rewind damage exists.
- More than two player-facing rendering choices.

## Initial claim state

- Observed from owner: core gameplay is starting to feel good; enemies and hands appeared invisible during real-path testing.
- Observed from Pass 13 telemetry: the public Performance profile retained weapon presentation telemetry and reduced scene representation, but telemetry alone does not prove human-visible operators or limbs.
- Unknown until reproduced: whether invisibility is caused by mode-specific geometry reduction, material/lighting contrast, camera framing, occlusion, spawn position or a runtime lifecycle defect.
- Falsifier: same-spawn public screenshots and semantic visibility telemetry showing correctly framed, nonzero-visible hand/operator meshes in both modes on the owner's path.

## Release-candidate verification evidence

- Deterministic: `108/108` tests across `25` files.
- TypeScript: `npm run lint` passed.
- Production: `npm run build` passed.
- Chromium: `18/18` scenarios passed, including exact two-option menu, primary/pistol inventory, visible arms/operator, knife miss animation, all three support activations, interiors and zero visible collision proxies.
- Local WebRTC: host/client connected reciprocally with zero console errors; state cadence `33 ms`; interpolation rate `24`; snapshot age `188 ms`; interpolation error `0.051 m`; pistol replication `{ primary: carbine, weapon: pistol }`; victim-side melee reduced host to `0 HP` and recorded one death.
- Windows AMD/D3D11 unlocked:
  - Performance: `327.37 FPS`, p95 `4.6 ms`, max `8.0 ms`, `83` calls, `54,488` triangles.
  - Quality: `69.52 FPS`, p95 `20.4 ms`, max `34.7 ms`, `402` calls, `258,034` triangles.
- Windows ordinary foreground path on the active 30 Hz virtual display:
  - Performance: `28.82 Hz`, median `34.7 ms`, p95 `35.4 ms`, max `35.9 ms`.
  - Quality: `28.99 Hz`, median `34.5 ms`, p95 `35.3 ms`, max `35.9 ms`.
- Visual inspection: first-person arms and enemy operator are perceptually visible in both modes; Performance and Quality interiors retain open entrances, partitions, stairs and furniture; collision proxy telemetry is zero.
- Remaining C9/C10 work: immutable public `review/pass14/` deployment, deployed console/asset verification and deployed two-peer WebRTC verification. Canonical root remains unchanged until owner acceptance.
