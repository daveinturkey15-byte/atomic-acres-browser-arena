---
title: Pass 30 Stormfront Escalation
status: implementation-locked
owner: Dave / Jigglyclaw
branch: overhaul/pass27-world-identity
baseline: 72c313c494853ed1ee4673f06a8f064330ac9efc
approved: 2026-07-18
---

# Goal

Make Atomic Acres more modern, atmospheric and streak-driven without weakening deterministic gameplay, multiplayer safety, software fallbacks or the Pass 29 output contract.

# Owner-approved requirements

## R1 — Tri-Pass airstrike

- Preserve the 7-kill, three-point, simultaneous one-second Tri-Pass flow.
- Double each bomb's maximum damage from `225` to `450`.
- Double each bomb's blast radius from `7.5` to `15` world metres.
- Preserve line-of-sight occlusion, friendly-fire exclusion, authoritative hit/death processing and bounded presentation cleanup.

## R2 — 8-kill Hunter Swarm

- Add a one-use-per-life reward at an uninterrupted 8-kill streak.
- Manual activation uses keyboard `6`; controller remains accessible through the existing support cycle after a bounded mapping is assigned.
- Exactly five original hunter-killer drones spawn in a bounded formation over mid-map and dive toward hostile living targets.
- Prefer unique hostile targets; deterministically distribute extra drones when fewer than five hostiles exist.
- Direct hit damage is lethal (`200`) for standing/crouched targets.
- Splash damage is bounded to `100` before mitigation.
- Prone applies a `0.09` multiplier: a direct hit deals `18`, so even all five converging drones total `90` and a full-health prone player survives the whole swarm.
- Drones never target the owner or friendlies, expire cleanly, collide with arena solids, and do not become physics/network entities.
- The activating client remains damage authority through existing validated hit/death messages; drone art and flight are presentation-local.

## R3 — 15-kill Nuke

- Add a one-use-per-life reward at an uninterrupted 15-kill streak.
- Manual activation uses keyboard `7`.
- Nuke sequence: five-second warning, original procedural siren/charge, sky/fog escalation, flash, expanding shockwave, camera rumble and deep original blast tail.
- At detonation, every living hostile bot/remote receives lethal hostile-only damage. The owner and teammates are never damaged.
- One hostile receives at most one nuke damage event per detonation.
- The sequence is bounded, has no copied commercial sound/visual assets, disposes all presentation objects, and has a reduced/Compatibility presentation path.
- Nuke does not bypass ordinary death, score, streak, drop, respawn, match-end or network validation paths.

## R4 — Global immediate streak leaderboard

- Dave explicitly approved a managed global backend and anti-abuse controls, superseding the generic AKP no-hosted-service MVP rule for this feature only.
- Target service: Cloudflare Worker + D1; no write secret is shipped to the browser.
- The leaderboard ranks named personal best **streaks**, not only completed-match kills.
- When a player reaches a streak greater than their known personal best, submit immediately; do not wait for round end, unload or match completion.
- A later page close/disconnect cannot erase an accepted streak.
- Global records persist across builds, browsers and devices and render in the menu.
- Keep versioned local storage as an offline cache/fallback and retain current P2P merge behavior during backend unavailability.
- Server accepts only strict normalized callsigns and bounded integer fields, stores only a player's best claim, limits rows returned, uses prepared SQL, enforces origin allowlisting, request-size bounds and per-install/IP time-bucket throttling.
- Browser requests use a per-install random identifier, build identifier and idempotency key. These are identifiers, not secrets.
- Client-authoritative browser scores cannot be made cheat-proof. Server validation and rate limits bound abuse; no UI or documentation may claim authoritative anti-cheat.
- Backend deployment is blocked until a one-time Cloudflare login and D1 provisioning are completed; the game must still work offline before that external step.

## R5 — Stormfront sky and atmosphere

- Shift the authored cloud layer toward purple shadows and orange sunlit edges while keeping the early-morning sky readable.
- Use at least two bounded cloud bands with deterministic shader structure and no texture fetches or volumetric ray marching.
- Preserve the linear-HDR → restrained grade → local ACES → one sRGB transfer contract.
- Add subtle low-ground mist cards/meshes plus tuned scene fog. Mist is presentation-only, depth-safe, nonauthoritative and reduced/disabled in Performance/Compatibility or software rendering as appropriate.
- Fog must not erase route silhouettes, tactical markers, enemies or dark-space readability.

## R6 — Modern vegetation and world detail

- Improve grass forms/shading without increasing Pass 29 instance, blade, triangle, chunk or submission ceilings.
- Add deterministic per-instance colour/shape variation, softer tip silhouettes and more convincing dawn/dew response without per-frame allocations or extra textures.
- Replace faceted tree crowns with layered branch/canopy silhouettes, bark variation and deterministic leaf colour variation while bounding draw calls and shadows.
- Add small original details where they strengthen route identity: verge stones, drains, planters/ground litter, fence/utility detail or dew-lit shrubs.
- Added dressing is presentation-only and cannot alter collision, cover, spawn, minimap or line-of-sight authority.
- Preserve Compatibility and software-renderer bypasses.

# Mechanical acceptance checks

- **C1** `TRI_PASS_BLAST_RADIUS === 15` and `TRI_PASS_MAX_DAMAGE === 450` in source and unit tests.
- **C2** Field-support pure tests prove 3/5/7 repeatable rewards plus one-use 8/15 continuous-streak rewards and death reset behavior.
- **C3** Hunter damage pure tests prove standing/crouched direct hit `200`, standing/crouched splash `<=100`, prone direct `99`, prone splash `<=50`, no friendly targets and exactly five assignments when hostiles exist.
- **C4** Browser/debug verification proves five drones launch from center, acquire only hostiles, impact/expire, clean up and report bounded telemetry.
- **C5** Nuke pure/browser tests prove one five-second sequence, hostile-only single-hit lethal damage, ordinary death/score processing, cleanup and reduced-profile presentation.
- **C6** New personal best streak invokes immediate global submission before match end; repeat/lower streaks do not spam; local fallback persists on API failure.
- **C7** Worker tests reject malformed names, oversized bodies, disallowed origins, invalid/bounded scores and throttled floods; GET returns bounded sorted records; D1 writes are idempotent and monotonic.
- **C8** Live backend smoke writes a unique synthetic QA record, reads it back from the global endpoint and confirms no secret exists in the production bundle. Synthetic QA records are identified and prunable.
- **C9** Lighting/sky tests prove purple cloud shadow, orange edge, bounded shader bands, subtle fog ranges and no extra output transfer.
- **C10** Vegetation tests preserve Pass 29 maximum budgets, deterministic placement/checksum, nonauthority and zero per-frame allocations.
- **C11** Production Chromium captures show readable routes/enemies, subtle mist, purple-orange clouds, modernized grass/trees and no false cover/clipping.
- **C12** Compatibility and ordinary software WebGL bypass expensive grass/mist/ray work truthfully.
- **C13** Existing gameplay contract, golden replay, collision, weapons, bots, match timing, spawns, protocol, multiplayer lifecycle and review-tree gates pass.
- **C14** TypeScript, all unit tests, build, dependency audit and retries-disabled focused browser tests pass on the exact candidate.
- **C15** No generated evidence, backend state, credentials or authentication material enters the source/release commit.

# Release boundary

Implementation and local verification may proceed now. External Cloudflare provisioning, source push and public deployment require scoped owner authorization already given for the global leaderboard and later real login completion. Existing `review/*` archives must remain preserved.
