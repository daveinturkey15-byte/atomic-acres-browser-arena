# Pass 35 — Hitch-Free Explosions and Live Tri-Pass Targeting

Date: 2026-07-20
Status: released and verified

## Overview

Remove the player-visible freeze when grenades or field-support ordnance detonates, and show live hostile positions on the Tri-Pass tactical map while its three targets are being selected.

## Retained behavior

- Pass 34 grenade damage/radius remain `230` and `16` with cover blocking and falloff.
- Tri-Pass remains a seven-elimination reward with exactly three player-selected impacts after one second.
- Atomic Acres remains five minutes with no kill cap and no more than six solo bots.
- Rustworks remains exactly one solo bot; Gun Range remains bot-free.
- Performance mode remains representative; Blender remains optional.
- Authoritative weapon rays remain centred across all weapons/viewports.
- Existing support authority, team filtering, damage, cover checks, target IDs, and replay protections remain unchanged.

## Requirements

### R1 — No detonation-time rendering construction

Grenade, Yardhawk, Tri-Pass, and Hunter Swarm detonation paths must not create or dispose Three.js geometries, materials, lights, or requestAnimationFrame animation closures on the impact frame. Reusable unlit explosion presentation must be fully allocated and GPU-prewarmed during bootstrap.

### R2 — Bounded concurrent explosion audio

Several impacts in one frame must not construct a separate full procedural explosion mix for every impact. Coalesce the heavy explosion mix within a short perceptual window while retaining detonation feedback and telemetry.

### R3 — Explosion hitch telemetry and regression gate

Expose fixed pool capacity/activity/overflow, prewarm state, dynamic-light count, audio coalescing, and per-impact synchronous timing. Browser acceptance must exercise grenade, three simultaneous Tri-Pass impacts, Hunter Swarm, Yardhawk, and Nuke paths without JavaScript/WebGL errors or an unbounded main-thread stall.

### R4 — Live hostile Tri-Pass markers

While the Tri-Pass tactical map is open, render every currently alive hostile bot and remote player at its current authoritative/interpolated target position. Do not render the activating player, dead players, or teammates. Refresh markers while targeting remains open, not only when the overlay first appears.

### R5 — Readable targeting presentation

Hostiles use prominent pulsing red/orange markers with an `ENEMY` legend and count. Selected impact points remain visually distinct and numbered. The overlay explains that hostile positions are live and that three locations must be selected.

### R6 — Deterministic observability

Browser debug telemetry must expose the marker IDs, source kind, world positions, mapped canvas positions, alive/hostile filtering, and explosion-pool/profile state without adding private transport/network data to visible UI.

## Mechanical acceptance checks

- C1: lint, TypeScript build, complete unit/property suite, gameplay contract, release-tree gate, and dependency audit pass.
- C2: fixed-capacity support explosion presentation tests prove preallocation, reuse, overflow policy, expiry, zero dynamic lights, and variable-radius scaling.
- C3: audio tests prove heavy explosion mixes are coalesced within the configured window and resume afterwards.
- C4: focused Chromium acceptance opens Tri-Pass in solo and multiplayer fixtures, verifies only live hostiles appear, observes marker movement during targeting, selects three strikes, and records exactly three impacts.
- C5: focused explosion acceptance records prewarmed fixed pools and bounded synchronous timing for grenade and simultaneous support impacts, with no detonation-time pool growth, JavaScript error, or WebGL context loss.
- C6: map QA remains 3/3 and centre-ray QA remains 18/18.
- C7: immutable HTTPS review is visually inspected in Performance mode for the Tri-Pass overlay and explosion flow.
- C8: production receives the reviewed bytes without rebuilding; every live review/production file matches frozen `dist`.

## Out of scope

- Changing support damage, reward thresholds, strike timing, grenade physics, or network authority.
- Permanent always-on enemy radar outside Tri-Pass targeting.
- Contact-detonating frag grenades.

## Implemented design

- Replaced detonation-time support sphere/material/mesh construction with a fixed 12-slot `SupportExplosionPresentation` pool. Every slot is allocated before play, all slots are GPU-prewarmed, and the pool contains no dynamic lights.
- Expanded grenade bootstrap prewarming from one slot to the complete four-slot grenade pool.
- Removed the Tri-Pass missile point light and replaced Nuke's activation-time geometry/light construction with one bootstrap-owned unlit shockwave.
- Removed geometry/material disposal from support impact frames. Retired Yardhawk, Tri-Pass, and Hunter presentation roots are hidden immediately and amortized one root per frame only after the 900 ms blast window.
- Added a 90 ms heavy explosion-audio admission window, so simultaneous impacts retain feedback but construct one procedural mix rather than one mix per blast.
- Added support pool, audio admission, deferred-disposal, Nuke-prewarm, and synchronous-impact timing telemetry.
- The first aggregate burst gate exposed a separate `~48 ms` hitch in `spawnDeathDrop()` after an explosive kill. Death-drop models are now served from a fixed 12-slot, unlit, GPU-prewarmed presentation pool; no geometry, material, or weapon model is built or disposed on the kill frame.
- Atomic Acres' future reinforcement operators are now constructed and GPU-prewarmed during match setup, then held hidden in a dormant pool. Earning a reinforcement only resets and reveals a prepared operator. The bot haze remains an unlit sprite, preventing a new point-light shader variant when the reinforcement appears.
- Added 10 Hz Tri-Pass live hostile refresh using the existing bot and interpolated remote state. Markers are filtered by alive/team status, rendered as pulsing orange/red contacts, counted in the footer, and cleared on target completion/cancel/reset.

## Local verification evidence

- TypeScript/lint: passed.
- Unit/property: 67 files, 318/318 tests passed.
- Pass 35 Chromium: 2/2 passed against frozen `dist` (live marker movement/filtering, three impact completion, audio coalescing, support and grenade pool bounds).
- Existing support Chromium: 7/7 passed against frozen `dist` (Yardhawk, cover, Tri-Pass, Hunter Swarm, Nuke, gamepad support selection, grenade hitch).
- Pass 34 regressions: 4/4 passed against frozen `dist`.
- Map contracts: 3/3; no JavaScript errors or WebGL context losses.
- Centre-ray matrix: 18/18 with zero angular and CSS-pixel HUD error.
- Gameplay/replay contracts: passed unchanged.
- Release tree: 56 files, zero rejected/oversized candidates.
- Production dependency audit: zero vulnerabilities.
- Performance telemetry remained at Atomic Acres 48 calls / 107,340 triangles, Rustworks 46 / 2,230, and Gun Range 50 / 2,296.
- Local 1280×720 Performance visual review: two live enemy contacts were prominent, labels/count/instructions were readable, and no overlay clipping or overlap was found.

## Release identities

- Source implementation commit: `8e37775`.
- Immutable review: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass35-hitch-free-explosions-tri-pass-8e37775/>.
- Review Pages commit: `5e5c8bd8c9ad46d8b11fefc78dd9d575765d59b4` (`built`).
- Production: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/>.
- Production Pages commit: `130c2d36cd9b3f552ff9ae81a7910de62333671e` (`built`).
- Immutable review subtree: `63cedc3cd604bc56afc8d800388b90306ad7e59a` before and after promotion.
- Frozen release: 56 files / 20,453,619 bytes; deterministic tree SHA-256 `827bd906119344b0af087570c0f382f0892f9c78e83799d1dad7a27c0d4354c5`.
- Live fetch comparison: all 56 review and production files matched frozen `dist`; zero mismatches.
- Immutable visual review passed at 1280×720 and 960×540. Production reported zero JavaScript errors and zero WebGL context loss.
