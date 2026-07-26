---
name: atomic-acres-spatial-audio
description: Build, tune, spatialize, mix, persist, or verify Atomic Acres weapon sounds, footsteps, breathing and heartbeat, UI and announcements, ambience, menu and in-game music, arena audio zones, occlusion, voice pools, autoplay recovery, and game-wide audio-event coverage and budgets.
---

# Atomic Acres Spatial Audio

Create complete, positional and bounded audio without inventing gameplay authority.

## Workflow

1. Read repo rules and the F16 runtime authority at `src/sound-event-inventory.ts` plus `src/sound-event-inventory.test.ts`, then inspect current audio/footstep code, admitted movement snapshots, arena surface/audio definitions, settings/accessibility schemas, budgets, asset manifest and acceptance rows.
2. Route every event through an explicit semantic bus and versioned persisted gain/mute settings.
3. Use bounded reusable spatial chains for remote/world sources; keep local nearfield handling explicit.
4. Derive footsteps from admitted grounded travel, velocity, stance and surface. Key state by actor/life/continuity and reset teleports, stale snapshots and reconciliation jumps without emission.
5. Apply monotonic rolloff, correct HRTF/pan, deterministic priority/stealing, coalescing/cooldowns and budgeted occlusion low-pass.
6. Define distinct arena-owned ambience beds/zones with start, suspend, switch and disposal lifecycles.
7. Start/resume audio only after a valid user gesture; recover from suspension and tear down match/arena resources.
8. Prove no clipping, NaN, runaway gain, bus bypass, node growth, teleport burst, stale playback, missing event, or unlicensed source.

## Invariants

- Authority: audio consumes semantic events and admitted state; it never decides movement, visibility, hit, damage or score.
- Accessibility: category mutes and reduced-sensory settings change only intended presentation while preserving non-audio equivalents for critical state.
- Performance: hard-cap active voices, continuous loops, reusable chains, per-bus voices and occlusion queries/CPU; use deterministic stealing and complete disposal.
- Privacy: never announce or replicate local custom loadout names or hidden support rewards through audio.
- Provenance: manifest source, license, derivative notes and digest for every sample, stem and generated sound; never rip franchise audio.
- Coverage: every registered sound event declares bus, spatial policy, variants, concurrency/cooldown, provenance and evidence. A staging fixture proves the contract shape, not canonical runtime completeness.

## Validate

Read [references/audio-budget-contract.md](references/audio-budget-contract.md), then from this skill directory run both contract fixtures:

`node scripts/verify-audio-catalog.mjs scripts/fixtures/known-good.json`

`node scripts/verify-audio-catalog.mjs scripts/fixtures/incomplete.json`

`node scripts/verify-audio-catalog.mjs --self-test`

The first command must exit zero, the second must exit nonzero, and the self-test must reject every adversarial mutation. For a candidate manifest, run:

`node scripts/verify-audio-catalog.mjs <audio-manifest.json>`

Use `runtimeAuthority.state: "staging-contract"` for isolated contract fixtures. Claim `"canonical-runtime"` only when both F16 authority files exist in the validator's repository root. The validator then enforces the exact bus, family, staging-event, spatial-profile and arena oracles, numeric pan/occlusion and footstep evidence, monotonic rolloff, cap arithmetic and lifecycle settlement.
