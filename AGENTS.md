# Atomic Acres agent contract

These rules apply to Codex, Hermes, Gemini/AGY, and any future human or automated contributor.

## Sources of truth

- `origin/main` is the only source branch for production candidates.
- GitHub pull requests are the central contribution ledger. Chat/session claims and local branches are not release state.
- The `gh-pages` branch is production output only. Never develop on it or publish to it from a feature worktree.
- `docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md` is the canonical contribution and release procedure.

## Pass 65 routing

- Before any Pass 65 work, read `docs/PASS65_P0_RELEASE_FOUNDATION_2026-07-25.md`, `docs/PASS65_REQUIREMENTS_MATRIX.md`, `docs/PASS65_WORK_BREAKDOWN_RUNBOOK.md`, and the relevant sections of `docs/PASS65_TECHNICAL_CONTRACT_SKETCHES.md`; release/HITL owners must also read `docs/PASS65_OWNER_HITL_CHECKLIST.md`.
- Only the process-only P0 contribution starts from released Pass 64 base `B0=5075a52d80c6db69a97ed53acc2df5368728371a`. Runtime, release-shell, baseline, package, QA-code, asset, and `.agents/skills` work starts from exact post-P0 main `B1` after all five required checks are green.
- An `OPEN` decision or documented default is not implementation authority. A task dependency written `P04[DEC-x=FROZEN]` requires the validated frozen decision receipt.
- F11/B1.0 lifecycle, atomic arena transaction, collision-authority parity, and rapid same-tab falsifier gates precede specialist feature multiplication. PV01 explicitly freezes exact S0 and its preview/tree digests before final evidence.
- Pass 65 must stop at the immutable S0 preview for Dave's explicit exact-SHA HITL. Never publish, merge an approval as if it were runtime approval, or reuse approval after runtime/release-shell drift.

## Contribution isolation

- Fetch `origin/main`, create a clean isolated worktree, and use `contrib/<machine>/<harness>/<slug>` for new work.
- One worktree has one owner and one bounded outcome. Never let two agents write the same worktree.
- Declare the change impact before implementation: `process-only`, `release-shell`, or `runtime`. Unknown paths are `runtime`.
- Run `npm run pipeline:preflight -- --machine <machine> --harness <harness>` before implementation and again before handoff.
- Do not clean, reset, stash, move, or delete another task's worktree. Reconcile it read-only and preserve uncertain state.
- Record observations, inferences, assumptions, unknowns, and falsifiers separately when they affect release decisions.
- Do not weaken a timeout, threshold, screenshot tolerance, or assertion inside a feature fix merely to obtain green CI. A contract change needs explicit evidence and review.
- Recurring cleanup passes start from measured hotspots, unreachable-code/import evidence, and one bounded ownership boundary. Remove only proven-dead code, keep QA-only modules that still feed a named verifier, update the canonical Project Map when ownership changes, and rerun positive gameplay/network/render-profile contracts. Do not disguise a whole-tree move or behavior rewrite as cleanup.
- Desky (`dave-gaming-pc`) is the active development machine and can exercise both Performance and Quality Graphics. Treat both as presentations over one authoritative physics world: every substantial player-reachable visible object must have matching movement and shot authority in both profiles. Tiny grass, decals, particles, and overhead dressing may remain non-solid. Never add profile-only collision or hide a collider mismatch behind a render-profile switch; test affected geometry in both profiles.
- Shipped humans, bots, and their corpses use the same canonical rigged operator family, current team appearance, and current weapon presentation. Primitive/blocky/procedural humanoids are test fixtures only and must never be a runtime fallback when a canonical rig exists. A corpse is a non-authoritative presentation snapshot, never a second low-quality character implementation.
- Every arena change must pass the forging review: no floating or orphan geometry, no missing interior roof/floor, doors and openings read as their gameplay semantics, authored visible mass matches movement and projectile authority, opaque surfaces occlude local light/effects, asset quality is coherent with its surroundings, and deterministic review cameras cover the changed surfaces in both profiles.
- Keep stable machine arena IDs separate from display labels. Current display order is Nuke Town, Terminal, RustRig, Gun Range. Decode retired labels only at explicit URL/storage/protocol compatibility boundaries and never emit them as current UI text.
- Pass 64's required HITL route is WebGPU fail-closed after renderer initialization and contains no legacy custom GLSL materials. WebGL2 is compatibility coverage only. Preserve the byte-exact Pass 63 production subtree as the selectable stable rollback and retain Pass 62's immutable benchmark record; never reinterpret either through shared Pass 64 renderer code.

## HUD and menu forging

- Preserve the typed UI surface and lifecycle-state inventories in `src/ui/surface-registry.ts`. A visual redesign may move or restyle a surface, but must not drop multiplayer state, loadout, accessibility, diagnostics, keyboard/gamepad focus, or return-to-lobby controls.
- Player-facing command and HUD chrome must remain a bright, legible tactical system rather than regressing to a near-black or dark-blue monolith. At 1280x720, menu labels and critical HUD status text are at least 9px, primary actions and values are at least 12px, and every review viewport must be free of clipping and surface overlap.
- Arena-selection previews use the selected arena's real renderer and a presentation-only camera. Nuke Town, Terminal, and RustRig use helicopter-cockpit flyover framing; Gun Range uses cat first-person framing. Keep `previewTime` deterministic for captures and make reduced-motion mode a static, equally informative pose.
- Every HUD/menu change runs `src/ui/surface-registry.test.ts`, `src/ui/menu-preview-camera.test.ts`, and `tests/e2e/pass64-hud-menu.spec.ts`, then visually inspects the desktop, laptop, ultrawide, narrow, high-DPI, live-HUD, returned-lobby, and match-end artifacts.

## Integration and production

- Contributors may commit and push only their contribution branch. They must not push `main`, push `gh-pages`, merge their own PR, or run `npm run deploy`.
- Every PR must use the repository template and identify its machine, harness, base SHA, head SHA, changed paths, tests, and release-note impact.
- Every Pass 62+ `runtime` or `release-shell` PR must change exactly one `acceptance/pass-<number>.json`, map every requested outcome to evidence, and record Dave's approval of the immutable PR preview's exact source SHA. Runtime/release-shell changes after that preview invalidate approval.
- A separate integrator reviews the actual diff and checks. The PR must contain current `origin/main` before merge.
- `requirements-acceptance` is a required check alongside both static/unit and both bounded-browser checks. Green tests without complete requirement coverage are not release evidence.
- Production promotion is serialized by `.github/workflows/release-production.yml`. Supply the exact green `main` SHA and release pass; never deploy from a feature branch or local dirty tree.
- Do not describe a change as live until the workflow receipt names the source SHA and Pages SHA and the canonical HTTPS site is checked.
- The production workflow must revalidate the acceptance manifest and pass its post-Pages canonical live smoke before writing a successful receipt.
- The first successful receipt plus cache-busted live smoke is terminal for that release task. Report success immediately; route non-blocking hygiene to a later PR instead of silently extending the release.
- Do not run synchronous or duplicate `gh run watch` processes from an agent turn. Use one-shot status reads, report material state changes, and keep waits bounded.

## Durable gotcha

**Symptom -> Cause -> Correction -> Verify:** several agents report successful work but production is stale or contradictory -> local worktrees, PR merges, Pages pushes, and release metadata were treated as interchangeable state -> use PRs as the contribution ledger and the single serialized production workflow as the only publisher -> confirm exact `main` SHA, successful required checks, workflow receipt, Pages SHA, release-button timestamp, and live browser logs.

**Symptom -> Cause -> Correction -> Verify:** the stable channel looks correct but its digest/count differs after nesting under a chooser -> the original provenance file was silently included, replaced, or recomputed -> copy the exact hosted subtree, preserve its original `channel-provenance.json`, exclude only the provenance file named by the original digest contract, and write outer pin metadata to a distinct file -> compare the original 118-file Pass 62 runtime digest, the complete 119-file copied subtree, and every copied byte.

**Symptom -> Cause -> Correction -> Verify:** a body, door, roof, light, or prop regresses to placeholder quality while tests stay green -> structural telemetry was mistaken for visual proof -> prohibit primitive runtime operator fallbacks and require deterministic pixel/ROI review cameras plus semantic geometry/collision assertions -> inspect the immutable WebGPU contact sheet and run the corresponding per-arena contract in both profiles.

**Symptom -> Cause -> Correction -> Verify:** a corpse or low-detail path shows the retired block-built humanoid while live combatants use the authored rig -> character presentation was given a separate primitive fallback or a caller could opt out of the canonical rig -> all players, bots, reinforcements, and corpses must use `buildOperator` with the same loaded rig, team appearance, and carried weapon; performance profiles may simplify materials but never substitute anatomy -> run `src/corpse-presentation-contract.test.ts` and the canonical rigged death browser check.
