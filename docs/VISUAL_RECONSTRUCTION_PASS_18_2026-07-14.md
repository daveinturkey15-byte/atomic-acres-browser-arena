# Atomic Acres — Visual Reconstruction Pass 18

**Date:** 2026-07-14  
**Branch:** `overhaul/visual-reconstruction-pass-18`  
**Baseline:** local Pass 17 checkpoint `5d988fc`; official perceptual score remains `5.9/10`  
**Status:** active implementation; unpublished and non-canonical

## 1. Why Pass 18 exists

Pass 17 established a strong technical foundation but failed independent visual review. Three reviewers scored the complete 76-frame evidence set at `5.8`, `5.3`, and `5.3`. The prior strategy—procedural primitives plus incremental polish—has reached diminishing returns.

Pass 18 is a reconstruction pass. It prioritizes visible authored form, action readability, architectural finish, and Quality/Performance parity. It must not trade away deterministic gameplay, multiplayer authority, renderer budgets, or the original Atomic Acres identity.

## 2. Requirements

### R1 — First-person anatomy

- Replace tube-like arm silhouettes with shoulder, upper-arm, elbow, forearm, wrist, palm, thumb, and finger-mass forms.
- Preserve a bounded mesh/draw-call contract through merged static segments or skinning-equivalent hierarchy.
- Give carbine, SMG, scattergun, pistol, and knife distinct support-hand and dominant-hand poses.
- Avoid visible wrist gaps, forearm disconnection, hand/receiver intersection, and oversized ADS obstruction.

### R2 — Physically readable weapon actions

- Hip, ADS, sprint, fire, reload-out, reload-in, and melee must be distinguishable without reading HUD ammunition.
- Fire must expose recoil travel, muzzle flash, mechanical movement, and recovery.
- Reload must expose magazine/shell displacement and support-hand intent.
- Knife must have wind-up, contact, and recovery silhouettes with visible blade and arm travel.

### R3 — Finished interior architecture

- Rebuild Aqua and Coral stairs/landings as authored structures with thin treads, risers, stringers/supports, railings, wall thickness, and trim.
- Give each floor purposeful room identity through original furniture, cover, signage, utilities, and color/material hierarchy.
- Preserve all validated routes, openings, collision contracts, and team transforms.
- Keep Aqua and Coral structurally and narratively distinct; do not copy protected commercial layouts or assets.

### R4 — Lighting and materials

- Establish readable interior gradients, contact depth, localized highlights, and material separation without restoring expensive global shadows.
- Break up broad repetitive walls with trim, panels, decals/signage, fixtures, and original texture variation.
- Keep combatants readable against every interior/exterior background.

### R5 — Performance parity

- Performance may reduce sampling, secondary props, texture resolution, and minor effects.
- Performance must retain the same authored architecture, silhouette, major material hierarchy, first-person anatomy, operator readability, and action poses as Quality.
- Performance may not revert to flat diagnostic/blockout colors.

### R6 — Third-person operators and motion

- Improve operator anatomy, weapon grip, posture, silhouette, and contact with stairs/ground.
- Add visibly distinct locomotion, fire/recoil, reload, melee, hit, death, and respawn key poses.
- Preserve team identity, hit proxies, remote interpolation, and host-authoritative admission.

### R7 — Evidence and release discipline

- Capture matched Pass 17/18 stills for every rubric-critical view.
- Add deterministic short motion evidence for locomotion, firing, reload, melee, hit/death, and respawn.
- Keep durable evidence outside Playwright's disposable `test-results/` directory.
- Do not publish, push, or promote Pass 18 without Dave's explicit approval.

## 3. Mechanical acceptance checks

- **C1 Source:** lint, deterministic tests, production build, and `git diff --check` pass.
- **C2 Anatomy:** named anatomy nodes exist for both arms; wrist/hand contact checks pass for all four firearms and knife; no action exceeds the declared contact-error limit.
- **C3 Action poses:** screenshot-difference and state assertions distinguish hip/fire, reload-out/reload-in, and knife wind-up/contact/recovery for every weapon family.
- **C4 Framing:** weapon-critical bounds remain inside the safe action viewport; intentionally off-screen shoulder roots are excluded from the framing metric.
- **C5 Architecture:** both houses pass forward/reverse routes, stair ascent/descent, opening/collision, wall-thickness, railing, and visible-collision-proxy checks.
- **C6 Profile parity:** matched Performance/Quality captures retain all combat-critical meshes and authored material groups; Performance parity receives an independent score of at least `6.5` before the interim gate.
- **C7 Budgets:** Performance `<=120` calls; Quality `<=160` calls and `<=150,000` triangles in active combat/action captures.
- **C8 Browser:** complete Chromium suite passes with no runtime/page errors.
- **C9 Multiplayer:** reciprocal host/guest verifier passes; melee, pistol, operator actions, and social pings replicate authoritatively.
- **C10 Performance:** foreground Windows Chrome sustains at least `28.5 FPS` in both public profiles on the active 30 Hz display.
- **C11 Interim tribunal:** three independent reviewers inspect complete durable evidence; overall and every visually supported category must reach `7.0` before owner review.
- **C12 Release tribunal:** overall `>=8.5`, every supported category `>=8.0`, and Dave prefers Pass 18 in a controlled matched comparison.

## 4. Implementation sequence

1. **Viewmodel anatomy contract and safe framing metric.**
2. **Weapon-specific fire/reload/melee reconstruction.**
3. **Aqua/Coral stair and interior reconstruction.**
4. **Quality/Performance material-parity reconstruction.**
5. **Third-person anatomy and action poses.**
6. **Motion-capture harness and matched evidence.**
7. **Full gates, interim tribunal, owner comparison, and only then release consideration.**

Each phase must finish its focused tests and visual evidence before the next phase broadens scope.

## 5. Explicit non-goals

- No exact recreation of Nuketown or any protected map, asset, sound, animation, name, geometry, or balance table.
- No third public graphics profile.
- No arbitrary text chat.
- No weakening of authoritative damage, collision, identity binding, replay protection, or bounded effects.
- No publication or canonical promotion during implementation.
- No score inflation from telemetry or test counts; perceptual quality is graded visually.

## 6. Current implementation tranche

Pass 18 begins with R1/R2 because the first-person weapon occupies the largest portion of every combat frame. The first tranche will:

1. replace palm/glove blobs with articulated palm/thumb/finger-mass geometry;
2. create weapon-specific dominant/support grip anchors;
3. make fire recoil and mechanical travel visibly distinct;
4. make reload-out and reload-in visibly distinct for all weapon families;
5. correct the framing verifier so off-screen shoulder roots do not mark every valid FPS pose as cropped;
6. regenerate the focused Quality/Performance action matrix and inspect it before touching architecture.
