# Documentation index

## Current development and release

- [Pass 65 P0 release foundation](PASS65_P0_RELEASE_FOUNDATION_2026-07-25.md) - exact Pass 64 handoff evidence, B0/B1 branch discipline, process-only allowlist, planning-corpus validation, and the mandatory no-publish-before-HITL stop.
- [Pass 65 “Big One” master plan](PASS65_BIG_ONE_MASTER_PLAN.md) - complete scope, architecture, phased delivery, authority boundaries, integration strategy, QA, immutable preview, and protected release plan.
- [Pass 65 requirements and decisions](PASS65_REQUIREMENTS_MATRIX.md) - 94 user-facing/system requirements with active falsifiers and evidence, plus 15 explicit product decisions and freeze deadlines.
- [Pass 65 forging-team runbook](PASS65_WORK_BREAKDOWN_RUNBOOK.md) - 120 bounded tasks, dependencies, ownership leases, handoff rules, integration order, and wave exits.
- [Pass 65 technical contract sketches](PASS65_TECHNICAL_CONTRACT_SKETCHES.md) - design-only typed contracts for identities, catalogs, loadouts, ordnance, support entities, destructible surfaces, settings, audio, and evidence.
- [Pass 65 project-skill plan](PASS65_PROJECT_SKILLS_SPEC.md) - six narrow future repo-local skills, validators, negative fixtures, and forward-test gates; the skills themselves are deliberately deferred to B1.
- [Pass 65 estimation and critical path](PASS65_ESTIMATION_AND_CRITICAL_PATH.md) - one-to-one 120-task P50/P90 register, confidence, waits, reserves, and dependency-derived schedule model.
- [Pass 65 owner HITL checklist](PASS65_OWNER_HITL_CHECKLIST.md) - concise blocking review route plus precomputed mechanical-evidence review and exact-SHA approve/reject/defer contract.
- [Pass 64 WebGPU, gameplay, railgun, arena-quality, and HUD specification](PASS64_WEBGPU_GAMEPLAY_HUD_SPEC_2026-07-25.md) - frozen requirements, authority boundaries, migration phases, falsifiers, and immutable HITL contract.
- [Pass 64 forging team](PASS64_FORGING_TEAM_2026-07-25.md) - twelve specialist roles, dependency order, branch ownership, and integration discipline.
- [Pass 63 cleanup, Project Map, chat, and deferred visual repairs](PASS63_CLEANUP_PROJECT_MAP_CHAT_SPEC_2026-07-24.md) - current local HITL scope, numbered requirements, authority boundaries, and no-publish decision.
- [Pass 62 offline integration record](PASS62_OFFLINE_INTEGRATION_2026-07-24.md) - exact gameplay, graphics, and netcode inputs plus integrated verification evidence.
- [Pass 62 graphics refinement record](PASS62_GRAPHICS_REFINEMENT_HITL_2026-07-24.md) - current WebGL lighting/effects architecture, adaptive ladder, compression, and visual falsifiers.
- [Pass 62 netcode correctness record](PASS62_NETCODE_CORRECTNESS_2026-07-24.md) - immutable authored-shot timeline and host-resolution contract retained by Pass 63.
- [Player-facing production release ledger](../src/changelog.ts) - canonical Pass number, public notes, and first-successful-promotion time for the live game.
- [Player feedback contribution specification](PLAYER_FEEDBACK_CONTRIBUTION_SPEC_2026-07-22.md) - weapon presentation, movement/collision, combat feedback, round statistics, and season-aware leaderboard reset contract.
- [Atomic Acres aesthetic overhaul specification](ATOMIC_ACRES_AESTHETIC_OVERHAUL_SPEC_2026-07-22.md) - authored model-home, garden, material, lighting, performance, and deterministic browser-review contract.
- [Skyline Terminal overhaul specification](SKYLINE_TERMINAL_OVERHAUL_SPEC_2026-07-22.md) - active traversal, cover, asset, material, preview, and verification contract for the original airport arena.
- [Skyline Terminal overhaul evidence](SKYLINE_TERMINAL_OVERHAUL_EVIDENCE_2026-07-22.md) - browser, clearance, performance, provenance, and integration evidence for the isolated Terminal branch.
- [Rustworks tower overhaul specification](RUSTWORKS_TOWER_OVERHAUL_SPEC_2026-07-22.md) - derrick, undercroft, trench, container-route, collision, ballistics, and performance contract.
- [Rustworks tower overhaul handoff](RUSTWORKS_TOWER_OVERHAUL_HANDOFF_2026-07-22.md) - exact authored asset, test, provenance, and integration evidence.
- [Pass 55 indoor range and walk-up armory specification](PASS55_INDOOR_RANGE_ARMORY_SPEC_2026-07-22.md) - expanded indoor Gun Range, walk-up weapon pickups, Mastiff 63 LMG, and instant sniper ADS.
- [Pass 54 wall penetration specification](PASS54_WALL_PENETRATION_SPEC_2026-07-22.md) - canonical FMJ-like material, weapon, distance, angle, multiplayer-authority, and future-asset coverage rule.

- [README](../README.md) — product overview, controls, and setup.
- [Pass 54 Skyline Terminal polish specification](PASS54_SKYLINE_TERMINAL_POLISH_SPEC_2026-07-22.md) — active authored-detail, originality, performance, and verification contract for Skyline Terminal.
- [Pass 54 Skyline Terminal verification record](PASS54_SKYLINE_TERMINAL_POLISH_RELEASE_2026-07-22.md) — implementation summary, mechanical gates, render evidence, and exact Gemini sidecar receipts.
- [Pass 52 specification](PASS52_RECONCILED_MULTIPLAYER_CHANGELOG_SPEC_2026-07-21.md) — retained multiplayer and changelog foundation, superseded where newer scoped contracts and executable tests differ.
- [Pass 52 release record](PASS52_RECONCILED_MULTIPLAYER_CHANGELOG_RELEASE_2026-07-21.md) — release-facing implementation notes.
- [Verification and release hygiene](VERIFICATION_AND_RELEASE_HYGIENE.md) — canonical local/CI gates, portability, provenance, and legal-distinction rules.
- [Contribution and production pipeline](CONTRIBUTION_AND_RELEASE_PIPELINE.md) — canonical multi-machine, multi-harness contribution ledger and serialized Pages release process.
- [QA release verification plan](QA-RELEASE-VERIFICATION-PLAN.md) — broader evidence and release-check strategy.

## Historical passes

The other dated pass documents in this directory are an implementation archive. They are evidence of the route to the current build, not independent sources of current product truth. When documents conflict, use the player-facing release ledger for what is live, then the newest applicable scoped contract and executable tests. A contribution handoff does not become production truth until its exact `main` SHA is promoted and verified.

## Asset sources and licensing

- [Art asset guide](../ART_ASSET_GUIDE.md)
- [Asset manifest](../assets.manifest.json)
- Third-party runtime license/readme files live beside their assets under `public/assets/third-party/`.
- Rejected candidates remain under `third-party-candidates/` and are excluded from the release tree.
