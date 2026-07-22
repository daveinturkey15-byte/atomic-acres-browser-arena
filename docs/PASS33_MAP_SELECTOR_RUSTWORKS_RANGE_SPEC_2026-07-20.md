# Pass 33 — Map Selector, 1v1 Rustworks, and Gun Range

Date: 2026-07-20
Status: released

## Overview

Add a simple map selector to the opening deployment menu and ship three deliberately distinct play spaces:

1. **Atomic Acres** — existing authored team arena, five-minute score race with no kill cap.
2. **1V1 RUST** — an original compact industrial tower-and-yard arena for exactly one solo rival.
3. **GUN RANGE** — a solo, untimed shooting lane with reusable targets and an explicit score.

The commercial Rust reference is translated into compact vertical industrial pacing, sightline rhythm, stacked cover, catwalk pressure and a central tower silhouette. No proprietary geometry, measurements, textures, models, audio, branding, code, or extracted assets are copied.

## Requirements

- **R1 — Start selector:** the initial Deploy panel exposes three keyboard/focus-accessible map cards. One card is always selected and visibly reports its mode/rules.
- **R2 — Atomic rules:** Atomic Acres remains exactly five minutes but no longer ends at 25 kills. Its HUD/menu copy must not say “first to 25.”
- **R3 — Safe reinforcement bound:** removing Atomic's score cap must not make fifth-death bot reinforcement unbounded. Preserve the existing 2/3/4/5/6 progression and cap live solo bots at six.
- **R4 — 1V1 Rust:** the 1V1 selector option uses an original compact rusted industrial yard with a central climbable tower, perimeter cover, two opposed spawn families, collision-backed visible geometry, and exactly one solo bot. Multiplayer controls are deliberately disabled for this solo duel.
- **R5 — Gun range:** the range has a protected firing line, three distance bands, reusable collision/raycast targets, readable per-target values, no bots, no multiplayer controls, no match timeout, and a persistent score/hit readout.
- **R6 — Runtime switching:** selecting a map before deployment changes authoritative bounds, colliders, raycast geometry, spawns, patrol points, target set, map label, minimap content, bot population, match rules, and map-specific presentation together.
- **R7 — Retained combat:** all six weapon families, authoritative centre-ray invariant, recoil/reload/viewmodel behavior, input, collision, respawn, multiplayer protocol, Performance profile, and Atomic presentation gates remain intact.
- **R8 — Release:** build final bytes once, inspect them at a new immutable HTTPS review, then promote those exact reviewed bytes without rebuilding or mutating historical review paths.

## Acceptance criteria

- **C1:** unit tests prove all three map descriptors, unique ids/labels, finite bounds, clear in-bounds spawns, Rust solo bot count `1`, range solo bot count `0`, and range scoring values.
- **C2:** gameplay tests prove Atomic's `scoreLimit=null`, `durationMs=300000`; 25+ kills do not end it; expiry at five minutes does. Existing default first-to-25 behavior remains available for 1V1.
- **C3:** bot tests prove Atomic reinforcement caps at six even after arbitrarily many deaths.
- **C4:** TypeScript, Worker TypeScript, gameplay contract, complete unit suite, production build, release-tree verification, dependency audit, and `git diff --check` pass.
- **C5:** one-worker Chromium tests select and enter each map in Performance mode, proving selected id, map label, match rules, bot count, authoritative bounds/spawn safety, target count/score, and map-specific visible root.
- **C6:** direct browser inspection shows the selector is readable, Rustworks has a recognisable original industrial tower/yard silhouette, and the gun range provides clear lanes/targets/score without Atomic scenery leaking into either map.
- **C7:** representative Performance draw calls/triangles remain within the retained Atomic ceilings; the centre-ray 18-combination gate still passes.
- **C8:** immutable review and production trees are byte-identical after exact-byte promotion.

## Out of scope

- Reproducing Call of Duty Rust's exact geometry, measurements, textures, props, logos, skybox, spawns, or UI.
- Networked Rustworks or gun-range play; both new modes are deliberately solo.
- New weapons or changes to weapon ballistics.

## Decisions

- The visible menu label remains **1V1 RUST** because Dave explicitly requested that selector wording; the authored arena identity and telemetry use **Rustworks 1V1** to make its original implementation clear.
- Atomic keeps its five-minute time limit and winner-by-score-at-time behavior, but has no score-triggered early ending.
- The range is untimed practice rather than a five-minute match; score persists until map/mode reset.
- Rustworks uses one solo bot, keeps host/join controls disabled, and never participates in Atomic's reinforcement escalation.

## Verification evidence

- TypeScript and Worker checks: passed.
- Gameplay contract: passed against the regenerated Pass 33 baseline.
- Unit/property suite: **309/309 passed** across 63 files.
- Representative Chromium acceptance: **53 unique scenarios passed** with one worker and zero retries, partitioned into fresh-browser groups to avoid known SwiftShader resource ageing. Three Blender-rich presentation scenarios are deliberately outside Dave's representative Performance profile.
- Pass 33 browser contracts: **3/3 passed**, covering uncapped five-minute Atomic Acres, deep-linked and reselected Rustworks with exactly one rival and current-map navigation colliders, and real-shot Gun Range scoring/target respawn.
- Six weapons × three viewports: **18/18 authoritative centre-ray combinations passed**, with zero angular or HUD-centre error.
- Representative Performance render budgets:
  - Atomic Acres: **48 calls / 107,340 triangles**.
  - Rustworks 1V1: **46 calls / 2,230 triangles**.
  - Gun Range: **50 calls / 2,296 triangles**.
  - All remained below the established 147-call and 158,000-triangle ceilings, with no WebGL context loss or page errors.
- Compact menu check: all three selector cards and the solo deployment control remained visible at **1280×580** with no overlap.
- Production dependency audit: **0 vulnerabilities**.
- Release tree: **55 files / 20,322,405 bytes**; deterministic tree SHA-256 `347d2b0eddf79e4d1f3fdbd64de73e64a6733f19302a166a48a4151f165aaa44`.

## Independent review corrections

An independent static review found three map-switch state defects before release; all were corrected and covered by the final Pass 33 browser contract:

1. Bot navigation colliders are now recomputed whenever the active arena changes rather than retaining Atomic Acres geometry in Rustworks.
2. Atomic-only grass placements are always seeded from Atomic Acres colliders, including when the page is deep-linked into a solo map.
3. Failed physics creation now restores the previous arena, physics world, presentation, match state, spawn, and menu camera instead of mixing fallback visuals with the wrong collision world.

## Release identities

- Source commit: `9d0749fe5c89e96b7a2f92249ad1720ea4344318`.
- Immutable review: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass33-map-selector-rustworks-range-9d0749f/>.
- Review Pages commit: `c5db411659f747795c3b2ecf4d074b2517b4e095`.
- Production: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/>.
- Production Pages commit: `74dd444d62b71d1dfcba63dd7ccaa3af80dd13fc`.
- Review subtree remained immutable across promotion: `d56b2906f7a1cb97820e48b98cde110bad4f2a14` before and after production commit.
- Live verification fetched all **55 files / 20,322,405 bytes** from both review and production and found zero byte mismatches.
- GitHub Pages reported both deployment commits as `built`; production loaded Pass 33 with current-map Rustworks navigation, no WebGL context loss, and zero JavaScript errors.
