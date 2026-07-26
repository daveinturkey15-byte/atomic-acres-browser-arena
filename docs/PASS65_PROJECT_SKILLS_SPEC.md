# Pass 65 Project-Skill Package Specification

State: project-local skill package is present on the Pass 65 integration lineage; each skill remains usable only to the extent that its current validator and forward-test evidence pass.
Activation gate: skills and their validators are full-impact Pass 65 work. They must travel with the exact candidate and cannot be cited from an unrelated branch or older SHA.
Design rule: each skill stays narrow, concise, executable, and tied to project-local validators. Shared release controls remain in the existing release/arena/HUD skills.

## 1. Package layout

Proposed project-local package:

```text
.agents/skills/
  atomic-acres-combat-registry/
    SKILL.md
    agents/openai.yaml
    references/coverage-contract.md
    scripts/verify-combat-registry.mjs
  atomic-acres-weapon-viewmodel-forging/
    SKILL.md
    agents/openai.yaml
    references/asset-animation-contract.md
    scripts/verify-viewmodel-assets.mjs
  atomic-acres-killstreak-authority/
    SKILL.md
    agents/openai.yaml
    references/support-authority-contract.md
    scripts/verify-killstreak-catalog.mjs
  atomic-acres-destructible-world/
    SKILL.md
    agents/openai.yaml
    references/shed-authority-contract.md
    scripts/verify-interactive-world.mjs
  atomic-acres-spatial-audio/
    SKILL.md
    agents/openai.yaml
    references/audio-budget-contract.md
    scripts/verify-audio-catalog.mjs
  atomic-acres-multiplayer-combat-verification/
    SKILL.md
    agents/openai.yaml
    references/chaos-matrix.md
    scripts/run-pass65-combat-matrix.mjs
  atomic-acres-owner-feedback-gate/
    SKILL.md
    agents/openai.yaml
    scripts/verify-owner-feedback-ledger.mjs
```

Only create a resource when it is executable or prevents repeated rediscovery. Do not add README, changelog, or duplicated prose.

## 2. `atomic-acres-combat-registry`

### Trigger description

Author, extend, rebalance, or verify Atomic Acres weapons, sidearms, grenades, projectile effects, loadout eligibility, damage/falloff/recoil/spread/ammo/reload/movement/penetration policy, or exhaustive combat-ID coverage. Use whenever a content ID or combat statistic changes.

### Core workflow

1. Read the repo instructions, Pass 65 spec, current protocol/catalog, ballistics contract, and acceptance manifest.
2. Classify the requested change: schema, authority, balance, loadout, presentation identity, or all.
3. Add/change the canonical typed definition before runtime branching.
4. Keep pure catalog/authority files free of Three.js and WebAudio imports.
5. Extend strict protocol parsing and mismatch behavior when identity changes.
6. Prove exhaustive coverage across gameplay, protocol, loadout, bots, drops, replay, presentation, audio, penetration, telemetry, tests, and provenance.
7. Run boundary/property tests for damage, falloff, recoil, spread, cadence, ammo, reload, switch, movement and wallbang.
8. Challenge dominance through role/TTK comparisons, modifier ordering, and adversarial inputs.
9. Hand off exact commit, changed paths, test output, assumptions, unknowns, and falsifiers.

### Hard rules

- Do not add weapon/grenade branches directly to `legacy-main.ts` before registry/reducer support.
- Do not trust client ammo, reload, switch, spin-up, projectile timing, or shared damage.
- Do not use an incomplete/generic release fallback.
- Do not rebalance existing content accidentally during adapter migration.
- Do not copy proprietary franchise assets, audio, code, animations, or branded presentation.
- Per DEC-11, every current/future weapon uses its approved real-world display name while stable machine IDs remain protocol/storage/replay/telemetry authority; a display rename must not fork identity.
- Per DEC-07, loadouts expose exactly one selected grenade family with spawn/carry cap one; kills never replenish it and the validated corpse-ammo-pickup transaction restores it exactly once.
- Adding any weapon, grenade or projectile ID must automatically enter every catalog-derived completeness set; validators must mutate the catalog with synthetic future IDs and reject every downstream registry that fails to update.

### Validator responsibilities

`verify-combat-registry.mjs` should fail when:

- IDs are duplicated or unknown.
- A numeric value is non-finite/out of bounds.
- Slot/family/fire-kind combinations are illegal.
- A required gameplay/presentation/audio/asset/test/provenance mapping is missing.
- A projectile/fire-mode-specific field is absent.
- A new ID lacks explicit bot/drop/loadout/replay policy.

## 3. `atomic-acres-weapon-viewmodel-forging`

### Trigger description

Forge, replace, animate, texture, light, or verify Atomic Acres first-person arms, hands, firearms, knife, grenade handling, weapon sockets, action clips, idle/passive motion, ADS, recoil presentation, muzzle/ejection effects, or third-person weapon identity.

### Core workflow

1. Read the weapon catalog entry, current viewmodel/action contracts, asset manifest, source/licence record, renderer/TSL rules, and deterministic capture requirements.
2. Freeze gameplay timings and camera-centred authority ray; presentation cannot move authority.
3. Author a dedicated first-person skeleton and per-weapon presentation definition.
4. Validate semantic parts and sockets: grips, magazine, bolt/pump, muzzle, eject, optic, light, knife/grenade.
5. Implement action graph priority and normalized clips: equip, idle, walk, sprint, ADS, fire, reload/empty reload, melee, inspect, special action.
6. Add bounded additive passive motion and final grip IK; reduce in ADS and expose accessibility scaling.
7. Validate material color space, normals, roughness/metalness, texel density, LOD, triangles, draws and decoded texture budgets.
8. Generate deterministic action corpus at required viewport/profile/backend/source identity.
9. Reject clipping, detached fingers, deformation, black/missing materials, socket drift, muzzle/ejection errors, and generic fallback.

### Hard rules

- Primitive models are debug-only and cannot reach an approved preview.
- Every shipped asset needs source, licence/provenance and digest.
- Do not reuse the same generic model as a false “new weapon.”
- Use TSL/node-compatible materials on WebGPU; no legacy GLSL-only path.
- Drive review captures with an injectable clock/seed, not ambient wall time.

### Validator responsibilities

`verify-viewmodel-assets.mjs` should check manifest presence/digests, LOD/action/socket declarations, semantic-part completeness, budget bounds, source provenance, and one indexed capture/evidence row for every weapon/action state.

## 4. `atomic-acres-killstreak-authority`

### Trigger description

Add, change, select, balance, network, simulate, or verify Atomic Acres killstreaks/Field Support, including earning, five-slot loadouts, Adrenaline, care packages, aircraft, bombs, choppers, drones, possession, support health/ammo/fuel, targeting, rewards, and exactly-once outcomes.

### Core workflow

1. Read catalog/schema, protocol, remote-support admission, canonical combat-result path, arena nav metadata, and acceptance rows.
2. Define cost/tier/selection/activation/entity/authority/presentation policy in the typed catalog.
3. Freeze exact family-constrained slots at match start: Scout/Adrenaline/Care; Yardhawk/Piloted Drone; two distinct Tri-Pass/Carpet Bomber/Hunter Swarm/Chopper choices; Nuke/Drone Swarm.
4. Model activation as host-owned stable ID/seed/time/life/revision with exactly-once consume.
5. For stateful effects, use host fixed-step entities; reliable lifecycle plus bounded lossy pose snapshots.
6. Derive targeting, navigation, reward, hit, health, ammo, reload, fuel, expiry and damage on the host.
7. Bind targetable support to pose-history hit proxies and the canonical combat-result path.
8. Test delay/loss/duplication/reorder/reconnect/late join/rematch and forged client claims.
9. Prove specified counts, HP, magazines, durations, probabilities, cover/LOS and cleanup exactly.

### Hard rules

- Never accept client-authored reward, path, target, ammo, health, hit, damage, or score.
- Shared RNG uses canonical seed/time, never ambient `Math.random()`.
- Nuke and Drone Swarm are selectable mutually exclusive slot-5 alternatives; Nuke is also exactly 1% of the derived care pool.
- The reward pool is a projection of the canonical catalog, never a second authored list. Every present/future eligible nonretired nonrecursive streak appears exactly once; Scout Sweep has a highest-band base weight; every catalog add/rename/retire/cost/weight change recomputes the set and exact safe-integer formula automatically.
- Chopper flight is always host-AI. The owner may toggle gun-only possession with `F` throughout the 30-second active window; no gun input may enter flight state.
- Chopper/drone targeting respects hard cover and semantic smoke.
- Support entities/audio/lights/projectiles are pooled, prewarmed, capped and disposed.

### Validator responsibilities

`verify-killstreak-catalog.mjs` should check catalog completeness, exact slot-family legality, Nuke/Drone exclusion, exact weights/counts/HP/ammo/durations, chopper gun/flight isolation, authority policy, nav requirements, entity/effect budgets, and required unit/network/visual evidence IDs. Its adversarial suite must add at least two synthetic future streaks and mutate rename/retire/cost/base-weight fields, proving automatic care-pool inclusion/recomputation and rejecting stale mirrors.

## 5. `atomic-acres-destructible-world`

### Trigger description

Design, implement, place, network, render, or verify Atomic Acres interactive/destructible objects, dynamic collision authority, shed doors, panel dents/perforation/fracture, ballistic apertures, Rapier debris, player/shot impulses, persistence, late join, reset, and object budgets.

### Core workflow

1. Read current arena collision/ballistics/physics/AI/navigation consumers, interactive-world definition, shed contract, TSL renderer rules, and budgets.
2. Add stable authored object/panel/chunk/collider IDs and bounded definition/state schemas.
3. Route movement, ballistics, grenades, AI LOS, support targeting, spawn/nav through one revisioned world-collision authority.
4. Implement one greybox vertical slice: one-second door, one panel, one analytic aperture, one detachable major chunk.
5. Make host authority decide interaction, obstruction, bullet perforation, explosion damage/fracture, debris activation and impulses.
6. Use reliable ordered events plus full/periodic repairable snapshots; reject stale/replayed/impossible data.
7. Link every visual hole to the same analytic ballistic aperture; keep player collision solid until authored detachment.
8. Use pre-authored chunks and bounded dents, not arbitrary runtime CSG/soft bodies.
9. Prove late join, packet chaos, rematch reset, profile parity, disposal and performance before map rollout.
10. Place two sheds only after the outdoor-map registry and one-shed stop gate are approved.

### Hard rules

- No visual-only hole or render-only moving door over static authority.
- No independent client debris authority or unbounded state arrays.
- Minor debris is presentation-only; major debris is bounded and host-simulated.
- Do not expand to all maps if the vertical slice misses authority, visual or budget gates.
- Record profile-independent object authority and profile-specific presentation separately.

### Validator responsibilities

`verify-interactive-world.mjs` should challenge ID uniqueness, state bounds, door trajectory/angle parity, aperture/ballistics parity, panel thresholds, chunk caps, outdoor placement counts, consumer parity, snapshot hashes, reset/disposal and resource budgets.

## 6. `atomic-acres-spatial-audio`

### Trigger description

Build, tune, spatialize, mix, persist, or verify Atomic Acres weapon sounds, footsteps, breathing/heartbeat, announcements, UI, ambience, menu music, in-game music, per-arena audio zones, occlusion, voice pools, autoplay recovery, and audio resource budgets.

### Core workflow

1. Read current audio/footstep implementation, player snapshot/interpolation, arena definitions, settings schema, accessibility requirements, and asset manifest.
2. Route semantic events to explicit mixer buses and versioned settings.
3. Use a bounded spatial voice pool for remote/world sources; local nearfield sounds remain intentional.
4. Derive footstep cadence from admitted travel/velocity/stance/surface and reset on continuity changes.
5. Apply monotonic rolloff, correct pan/HRTF, source priorities, coalescing/cooldowns and bounded occlusion low-pass.
6. Define arena-owned continuous ambience beds/zones with lifecycle/disposal.
7. Start/resume audio only after valid user gesture; handle suspension and arena/match teardown.
8. Prove no clipping/NaN/runaway gain, bus bypass, voice/node growth, teleport burst, or stale playback.
9. Manifest every sample/stem/source/digest/licence.

### Hard rules

- Do not infer remote authority from audio.
- Do not store or replicate custom loadout names through audio/announcements.
- Do not ship unlicensed/ripped franchise sound.
- Do not create unbounded oscillator/source/Panner nodes.
- Reduced sensory and category mutes must stop the intended presentation without changing gameplay.

### Validator responsibilities

`verify-audio-catalog.mjs` should check bus/category coverage, normalized persisted values, source/provenance/digests, per-arena ambience identity, spatial profile bounds, voice caps, lifecycle/disposal and required evidence rows.

## 7. `atomic-acres-multiplayer-combat-verification`

### Trigger description

Verify or red-team Atomic Acres multiplayer combat, inventory, weapons, grenades, projectiles, smoke/flash, killstreaks, drones, interactive sheds, stale-life protection, exactly-once results, network chaos, rematch/reconnect, authority forgery, target-hardware performance, and release acceptance.

### Core workflow

1. Read exact source SHA, acceptance manifest, release topology, frozen comparators, protocol parsers, domain invariants and current budgets.
2. Refuse tests against an ambiguous/uncommitted candidate identity.
3. Run smallest pure/unit/property gates before browser/GPU/network matrices.
4. Exercise solo, two-peer and host+guest+bot scenarios.
5. Inject delay, loss, duplication, reorder, reconnect, late join, respawn races and rematch.
6. Attempt forged/stale ammo, spin-up, damage, effect, reward, entity pose/health, door/fracture and score messages.
7. Compare host/client state hashes and canonical result counts.
8. Run deterministic visual corpus and RTX hardware stress with honest adapter/backend/timing labels.
9. Run resource/disposal loops and stable/benchmark byte checks.
10. Emit evidence indexed to requirement/falsifier IDs; never convert failure into a weaker threshold silently.

### Hard rules

- CI/SwiftShader is functional evidence, not RTX 5080 performance proof.
- A passing happy path does not verify authority; attack the falsifiers.
- Do not self-approve the exact preview authored by the same specialist.
- Any runtime/release-shell change after HITL invalidates approval.
- Public release proof requires workflow, Pages, receipt, bytes and rendered route agreement.

### Validator responsibilities

`run-pass65-combat-matrix.mjs` should provide bounded named groups, exact source/build identity, timeout/cleanup, state-hash summaries, requirement/falsifier IDs, artifact paths and a nonzero exit on missing evidence or threshold failure.

## 8. `atomic-acres-owner-feedback-gate`

### Trigger description

Reconcile any Atomic Acres owner correction, HITL observation, regression, missing specification item or durable future-facing rule. Use before implementing new feedback and again after integration so no chat statement is treated as implicitly covered.

### Core workflow

1. Atomize each statement without dropping corrections, negations, `all`/future scope or `still`/regression evidence.
2. Add stable `HF-###` rows with priority, one accountable lane, map/mode scope, falsifier/evidence and lifecycle state.
3. Map every feedback ID exactly once to the planning matrix and record explicit supersessions.
4. Update canonical catalogs/contracts before downstream mirrors.
5. Keep `OPEN`, `IMPLEMENTED`, `VERIFIED` and `HITL` distinct.
6. Run the ledger verifier, negative self-test and affected domain/runtime evidence.
7. Hand off exact source identity, evidence, assumptions, unknowns and remaining falsifiers; never infer publish authority.

### Validator responsibilities

`verify-owner-feedback-ledger.mjs` fails duplicate, skipped, malformed, unowned, unscoped or unmapped feedback IDs, unknown planning references, stale latest-ID metadata and missing repository routing rules. Its self-test deliberately mutates a known-good ledger and must prove those defects are rejected.

## 9. Skill validation and forward testing

When the repo gate opens:

1. Confirm the project-local skill location and repo conventions.
2. Initialize each real skill with the canonical `skill-creator` script; do not copy this document verbatim into six oversized files.
3. Generate matching `agents/openai.yaml` metadata from the final skill text.
4. Implement only reusable references/scripts that the repo actually needs.
5. Run `quick_validate.py` on every folder.
6. Run each deterministic verifier script on a known-good and intentionally incomplete fixture.
7. Forward-test each skill with a fresh subagent and raw task/artifact, withholding the intended diagnosis.
8. Fix triggers or workflow gaps revealed by forward tests.
9. Add the validated skills after P0 on the B1-based runtime integration lineage; require every dependent implementation lane to wait for their validation/forward-test commit.
