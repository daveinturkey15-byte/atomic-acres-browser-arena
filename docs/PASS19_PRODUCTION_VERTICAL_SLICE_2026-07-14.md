# Atomic Acres — Pass 19 Production Vertical Slice

**Date:** 2026-07-14
**Branch:** `overhaul/production-vertical-slice-pass-19`
**Mechanical baseline:** Pass 18 checkpoint `ae55b46`
**Feel candidate:** Pass 13 checkpoint `05610ca` / implementation `9dd2b55`
**Visual candidate:** Pass 16 checkpoint `7a2c4b0` / implementation `293d15d`
**Current official perceptual baseline:** 5.9/10

## 1. Overview

Pass 19 is a visual-production pivot, not another broad procedural-detail pass. It preserves the proven movement, combat, authority, classes, multiplayer, collision, and two-profile renderer while replacing the highest-salience prototype presentation in one bounded playable slice.

No map-wide production expansion is allowed until the slice passes matched owner review and independent visual gates.

## 2. Claim state at start

### Observed

- Dave reports that progress felt strong earlier but now feels stagnant and drifted.
- Passes 17–18 improved deterministic evidence, renderer budgets, and procedural detail without materially raising the official 5.9/10 perceptual baseline.
- The first-person weapon/hands, operator anatomy, animation, sparse rooms, flat materials, and effects remain dominant prototype signals.
- Pass 13 received positive gameplay-feel feedback; Passes 15–16 introduced authored assets and rigged presentation.

### Inferred

- The project optimized what was easiest to count rather than what most affected perceived production quality.
- Further incremental detailing of the current procedural assemblies has low expected visual return.
- A replacement-quality authored slice is a better falsifiable test than another map-wide refinement pass.

### Unknown

- Whether Pass 16 is the strongest visual baseline; matched evidence must test it.
- Which external authored asset family, if any, is suitable after licence, topology, animation, and browser-cost inspection.
- Whether the present Quality draw-call ceiling remains appropriate after production assets; foreground frame pacing, not an arbitrary count, is authoritative.

### Falsifier

If a bounded authored slice cannot clearly beat the earlier candidate and Pass 18 in matched owner/independent review while retaining gameplay and performance, the asset direction is rejected before scaling.

## 3. Vertical-slice scope

The slice contains exactly:

1. the balanced-kit carbine in first person;
2. complete human hands and forearms;
3. hip, ADS, fire, recoil, reload, sprint, and knife presentation;
4. one complete hostile operator with idle, movement, aim, fire, hit, death, and knife presentation;
5. the Aqua threshold, stair, landing, and one upper room;
6. production lighting/material/effects treatment for those elements;
7. Quality and Performance representations of the same content.

## 4. Requirements

### R1 — Preserve the playable foundation

Do not alter camera-ray authority, damage, movement tuning, class balance, network identity binding, melee admission, house traversal, or spawn rules merely to improve presentation.

### R2 — Matched baseline before replacement

Capture the feel/visual candidate and current branch from identical or mechanically equivalent cameras and action milestones. Record harness incompatibilities rather than silently substituting unmatched frames.

### R3 — Authored human anatomy

Hands, forearms, and the operator must be recognisably human in silhouette and joint placement. Fingers must contact grips; wrists and elbows must remain plausible through the full action range.

### R4 — Mechanically legible weapon handling

The carbine must show a readable support grip, sight line, recoil impulse, magazine extraction, magazine insertion, bolt/action completion, sprint carry, and knife recovery.

### R5 — Production operator presentation

The operator must have believable proportions, two-hand weapon contact, planted locomotion, torso/hip weight transfer, readable team identity, hit response, and persistent death presentation.

### R6 — Finished room composition

The Aqua slice must have credible thresholds, wall thickness, stair opening, landing, ceiling, lighting transition, room purpose, bounded furnishings, cover, and material hierarchy. Decoration may not obstruct authoritative traversal.

### R7 — Original and licence-audited

No commercial Call of Duty, Black Ops, Black Ops 2, or Nuketown assets, names, textures, sounds, geometry, animations, dimensions, or tuning may be copied. Every imported asset must have a recorded licence/source and must fit the original Atomic Acres arena.

### R8 — Two-profile parity

Quality and Performance must expose the same combat-critical silhouettes, openings, weapon actions, operator actions, and navigable geometry. Performance may simplify material cost and secondary detail, not remove combat readability.

### R9 — Outcome-led performance

Normal Windows Chrome foreground frame pacing is the acceptance authority. Draw calls and triangles are diagnostic guardrails, not visual objectives. No visual degradation is allowed solely to win an arbitrary renderer count.

### R10 — No broad scaling before proof

Do not rebuild the second house, all weapons, all operators, or the whole map until the vertical slice passes C8 and C9 below.

## 5. Acceptance criteria

- **C1 — Baseline evidence:** matched earlier/current evidence exists for carbine hip/ADS/fire/reload, one operator combat view, Aqua threshold/stair/landing, and one active-combat view.
- **C2 — Human viewmodel:** visual review finds no tube limbs, detached wrists, impossible finger contact, or crossed-arm magazine insertion in the selected milestones.
- **C3 — Weapon action:** fire/recoil/reload/knife are visibly distinct in persisted frames and a real-time sequence; authoritative action timing remains unchanged.
- **C4 — Human operator:** front/side/rear and action captures show complete anatomy, two-hand contact, planted locomotion, hit/death continuity, and readable team identity.
- **C5 — Finished room:** the selected Aqua route reads as a coherent inhabited structure from exterior, threshold, stair foot, landing, and upper-room cameras, with no portrayed opening blocked by invisible collision.
- **C6 — Profile parity:** all C2–C5 checks pass in Quality and Performance.
- **C7 — Mechanical safety:** lint, deterministic tests, production build, relevant Chromium scenarios, reciprocal multiplayer, collision/traversal, and bounded-effects checks pass on the exact revision.
- **C8 — Owner A/B:** Dave judges the new slice materially better than both the strongest earlier candidate and Pass 18 from matched evidence.
- **C9 — Independent gate:** three independent reviewers score the matched slice at least 7.0/10 overall before scaling; no core category may be hidden by averaging.
- **C10 — Windows gate:** Quality and Performance each present at least 28.5 FPS on the normal 30 Hz Windows path with acceptable p95 pacing and no input/compositor regression.
- **C11 — Release gate:** later full-project review requires at least 8.5/10 overall and at least 8.0/10 in every core category.
- **C12 — Quota gate:** at 3% OpenAI Codex remaining, stop high-usage work, notify Dave with DeepSeek balance, and wait for the banked reset.

## 6. Out of scope until C8/C9 pass

- map-wide prop proliferation;
- rebuilding Coral house;
- finishing every weapon family;
- public release or canonical promotion;
- changing the gameplay topology to copy Nuketown;
- raising visual scores through unmatched evidence or prose-only review.

## 7. Immediate sequence

1. Build matched Pass 16 / Pass 18 capture capability.
2. Diagnose the five largest visible gaps from matched evidence.
3. Audit available authored assets and licences.
4. Select one asset direction and implement only the bounded slice.
5. Capture temporal and still evidence in both profiles.
6. Run owner A/B and independent gate.
7. Scale only after the gate passes.

## 8. Pass 19 FPS arms candidate evaluation — 2026-07-15

### Intake and static audit

- Candidate: `public/assets/third-party/opengameart/fps-arms/FPS_ARMS_RIG_1.fbx`.
- Licence/source records are preserved beside the unchanged FBX; the intake commit is `64a3ad0` (`chore: preserve pass 19 CC0 FPS arms candidate`).
- Binary FBX 7.4; one skinned mesh; 4,103 vertices; 16,304 polygon indices; 4,076 polygons.
- Bilateral upper-arm, forearm, hand, palm, thumb, and three-joint finger chains are present.
- The FBX contains no embedded `Texture`/`Video` object and no external texture filename reference. Runtime experiments therefore assigned `new_diff.png` and `atomic_arms_roughness.png` explicitly.
- Three.js `FBXLoader` removes periods from source node names. The experimental resolver required narrowly scoped aliases for both source names such as `upper_arm.R` and normalized runtime names such as `upper_armR`.

### Isolated A/B experiment

The candidate was tested only through an uncommitted opt-in path; the stable/default release was never changed.

| View | Local query | Finding |
|---|---|---|
| Stable Pass 18 | `?render=quality` | Existing procedural arms remained the control. |
| Raw imported bind | `?render=quality&pass19Arms=1&pass19ArmsIk=0` | Recognisable bilateral source anatomy, but hands were far apart, one arm crossed the weapon, the other floated to screen right, grip contact failed, and sleeve cuts were exposed. |
| Bone IK | `?render=quality&pass19Arms=1` | Hand controls reached the grip sockets, but the original shoulder placement overextended the chains (`1.12×` right, `1.46×` left), producing hose-like sleeves and implausible silhouettes. |
| Reachable shoulder IK | same opt-in query, tuned shoulder anchors | Contact error was effectively zero and final reach ratios were `0.452` right / `0.553` left, but the visible result still had angular tube-like forearms, hidden/tiny hands, exposed sleeve cuts, and no convincing grip silhouette. |
| Glove-only hybrid | candidate alpha-masked to gloves over Pass 18 forearms | Rejected: authored hands remained occluded and undersized; removing the procedural gloves exposed triangular cuff cuts. It did not beat the control. |

The candidate failed the hip-fire hero frame before action-sequence review. Reload, sprint, melee, ADS, and weapon-swap promotion tests were therefore intentionally not used to rationalize a baseline failure.

### Decision

**Rejected for production viewmodel integration.** The FBX remains preserved as an audited CC0 source candidate, but all uncommitted runtime loader, mapping, IK, query-flag, glove-mask, and hybrid-overlay changes were reverted. Pass 18 remains the selected stable viewmodel.

This is a visual-contract failure rather than a technical loader failure: the asset can be loaded, textured, cloned with `SkeletonUtils.clone`, and addressed by its normalized skeleton names, but its source hand spacing, independent hand controls, lost authoring-tool IK semantics, sleeve cuts, and bind proportions do not fit Atomic Acres' compact two-grip first-person contract without destructive re-rigging.

### Post-rejection verification

- `npm run lint` — passed.
- `npm test -- --run` — 31 files / 142 tests passed.
- `npm run build` — passed.
- `npm run test:e2e` — 20 Chromium scenarios passed in 3.3 minutes.
- `git diff --check` — passed.
- Working tree was clean before this evidence note was added.
- Stable release capture completed with zero console/page errors. Local ignored evidence:
  - `artifacts/pass19-fbx-evaluation/stable-menu.png`
  - `artifacts/pass19-fbx-evaluation/stable-gameplay.png`
  - `artifacts/pass19-fbx-evaluation/stable-qa-output.txt`
- Stable telemetry showed 6 procedural arm meshes, finite framing, right/left grip contact errors below `5e-15`, and reach ratios `0.556` / `0.805`.
