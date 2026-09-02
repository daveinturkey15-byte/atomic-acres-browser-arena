# Atomic Acres agent contract

These rules apply to Codex, Hermes, Gemini/AGY, and any future human or automated contributor.

## Sources of truth

- `origin/main` is the only source branch for production candidates.
- GitHub pull requests are the central contribution ledger. Chat/session claims and local branches are not release state.
- The `gh-pages` branch is production output only. Never develop on it or publish to it from a feature worktree.
- `docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md` is the canonical contribution and release procedure.

## Pass 65 routing

- Before any Pass 65 work, read `docs/PASS65_P0_RELEASE_FOUNDATION_2026-07-25.md`, `docs/PASS65_REQUIREMENTS_MATRIX.md`, `docs/PASS65_DECISION_RECEIPTS.json`, `docs/PASS65_WORK_BREAKDOWN_RUNBOOK.md`, and the relevant sections of `docs/PASS65_TECHNICAL_CONTRACT_SKETCHES.md`; every correction-wave owner must also read `docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md`, while release/HITL owners must read `docs/PASS65_OWNER_HITL_CHECKLIST.md`.
- Only the process-only P0 contribution starts from released Pass 64 base `B0=5075a52d80c6db69a97ed53acc2df5368728371a`. Runtime, release-shell, baseline, package, QA-code, asset, and `.agents/skills` work starts from exact post-P0 main `B1` after all five required checks are green.
- An `OPEN` decision or documented default is not implementation authority. A task dependency written `P04[DEC-x=FROZEN]` requires the validated frozen decision receipt.
- F11/B1.0 lifecycle, atomic arena transaction, collision-authority parity, and rapid same-tab falsifier gates precede specialist feature multiplication. PV01 explicitly freezes exact S0 and its preview/tree digests before final evidence.
- Pass 65 is superseded audit evidence at exact SHA `7c57f0bcdedd66236767a4e7e92afabf2769506e` and must never be published. Never merge an approval as if it were runtime approval or reuse approval after runtime/release-shell drift.

## Pass 66 routing

- Pass 66 starts from the exact inspected Pass 65 candidate `7c57f0bcdedd66236767a4e7e92afabf2769506e`. Dave has given standing conditional authorization to publish the frozen Pass 66 candidate as **The Big One** once all blocking exact-SHA mechanical, visual, provenance, acceptance and protected-release gates are genuinely green, without waiting for another subjective HITL feedback round. This instruction does not claim Dave tested an immutable preview and must never be recorded as such. Pass 65 must never be promoted; Pass 63 stays byte-exact Stable.
- `HF-141` through `HF-160` in the correction ledger and the linked Version 66 source outcomes are blocking additions, not a replacement for unresolved `HF-001` through `HF-140`. Stability, frame pacing, lifecycle and authoritative collision/perception regressions precede cosmetic expansion.
- Normal browser throttling is an operating constraint: hidden presentation frames are forbidden. Generation-owned fetch/decode/preparation may progress where Chromium permits, hosted authority runs only its minimum fixed-step/network path, offline simulation pauses, and one coalesced foreground recovery resumes the existing admission.
- Solo skirmish starts with exactly one enemy bot on every bot-enabled arena. Hosted-lobby choices, arena-specific reinforcements and hard caps remain separate catalog values; graphics profiles never change gameplay counts.
- Smoke colour, lifetime, radius, shot corridors, human LOS and bot perception are projections of one host-authoritative volume contract. Glass presentation, collision, damage state and projectile aperture are likewise one authoritative lifecycle in every graphics profile.

## Multi-agent discipline (all harnesses)

**Read `docs/MULTI_AGENT_REPO_DISCIPLINE.md` before writing anything in this repository.**
It applies to Claude Code, Codex, Cursor, Antigravity/Gemini, Pi, OMP, Hermes desktop and
Hermes headless alike, and every rule in it was written after a real incident on this
machine. The five that cause the most damage when ignored:

- **Confirm the worktree path and branch; never infer them.** There are 365 worktrees and
  458 branches here. A worker once wrote into the protected Pass 62 benchmark checkout and
  its critic then reviewed that copy and approved it.
- **Feature worktrees edit and test; they never publish.** One canonical checkout performs
  release, compliance, vault sync and backup.
- **Exit code 0 is not success.** Six of eleven workers once reported success having done
  nothing — quota rejections that still exit 0. Verify against the repository.
- **Never weaken a test, threshold or assertion to reach green.** A correct failure stays
  failing and its row stays OPEN. A red test you can trust beats a green one you cannot.
- **Boot the app before claiming a candidate works.** 2,858 passing tests once accompanied a
  build that would not start, because unit tests never boot the DOM.

## Contribution isolation

- Fetch `origin/main`, create a clean isolated worktree, and use `contrib/<machine>/<harness>/<slug>` for new work.
- One worktree has one owner and one bounded outcome. Never let two agents write the same worktree.
- Declare the change impact before implementation: `process-only`, `release-shell`, or `runtime`. Unknown paths are `runtime`.
- Run `npm run pipeline:preflight -- --machine <machine> --harness <harness>` before implementation and again before handoff.
- Do not clean, reset, stash, move, or delete another task's worktree. Reconcile it read-only and preserve uncertain state.
- Record observations, inferences, assumptions, unknowns, and falsifiers separately when they affect release decisions.
- Do not weaken a timeout, threshold, screenshot tolerance, or assertion inside a feature fix merely to obtain green CI. A contract change needs explicit evidence and review.
- Every new owner-feedback statement receives one stable `HF-###` ledger row before implementation, with one owner lane, affected maps/modes, a mechanical falsifier, required evidence and planning-requirement mapping. Update `docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json` so each atomized source outcome reaches that row, its exact canonical owner, executable tests and eventual exact-SHA receipt; chat acknowledgement and graph prose are not evidence. `npm run qa:pass65:owner-feedback` must reject duplicate, skipped, malformed, unowned, untested or stale-projection rows; `npm run qa:pass65:owner-feedback:candidate` must additionally reject every `OPEN` or merely `IMPLEMENTED` P0/P1 row and every P0/P1 row without complete digest-checked candidate evidence. `IMPLEMENTED` is not `VERIFIED` and owner taste remains `HITL` only after mechanical gates pass.
- Recurring cleanup passes start from measured hotspots, unreachable-code/import evidence, and one bounded ownership boundary. Remove only proven-dead code, keep QA-only modules that still feed a named verifier, update the canonical Project Map when ownership changes, and rerun positive gameplay/network/render-profile contracts. Do not disguise a whole-tree move or behavior rewrite as cleanup.
- Desky (`dave-gaming-pc`) is the active development machine and can exercise both Performance and Quality Graphics. Treat both as presentations over one authoritative physics world: every substantial player-reachable visible object must have matching movement and shot authority in both profiles. Tiny grass, decals, particles, and overhead dressing may remain non-solid. Never add profile-only collision or hide a collider mismatch behind a render-profile switch; test affected geometry in both profiles.
- Canonical content catalogs drive every downstream roster. Adding, renaming or retiring a weapon, grenade, killstreak, collision material, renderer feature or interaction kind must either project automatically into bots/UI/audio/protocol/persistence/evidence or fail a synthetic mutation gate. A second hand-maintained eligibility list is a release blocker.
- Interaction key `F` is resolved by one pinned press lifecycle. A release before 1,000 ms performs the winning eligible tap world action such as care-crate collection, door or weapon pickup; reaching 1,000 ms performs eligible Piloted Drone or Chopper Gunner enter/exit with visible progress. Exactly one action commits after explicit priority, range, LOS and deterministic tie-break. Keyup, blur, pause, death, epoch change, target invalidation or range/LOS loss cancels stale work, and individual features may not register competing raw `F` handlers.
- Remote/support damage feedback is bound to the authoritative damaged target and projects from that target's current world position. Chopper, piloted/autonomous drone, Drone Swarm and future support weapons must never place damage numbers at the caller's current reticle when the target is elsewhere.
- Shipped humans, bots, and their corpses use the same canonical rigged operator family, current team appearance, and current weapon presentation. Primitive/blocky/procedural humanoids are test fixtures only and must never be a runtime fallback when a canonical rig exists. A corpse is a non-authoritative presentation snapshot, never a second low-quality character implementation.
- Every arena change must pass the forging review: no floating or orphan geometry, no missing interior roof/floor, doors and openings read as their gameplay semantics, authored visible mass matches movement and projectile authority, opaque surfaces occlude local light/effects, asset quality is coherent with its surroundings, and deterministic review cameras cover the changed surfaces in both profiles.
- Keep stable machine arena IDs separate from display labels. Current display order is Nuke Town, Terminal, RustRig, Gun Range. Decode retired labels only at explicit URL/storage/protocol compatibility boundaries and never emit them as current UI text.
- Pass 64's required HITL route is WebGPU fail-closed after renderer initialization and contains no legacy custom GLSL materials. WebGL2 is compatibility coverage only. Preserve the byte-exact Pass 63 production subtree as the selectable stable rollback and retain Pass 62's immutable benchmark record; never reinterpret either through shared Pass 64 renderer code.

## HUD and menu forging

- Preserve the typed UI surface and lifecycle-state inventories in `src/ui/surface-registry.ts`. A visual redesign may move or restyle a surface, but must not drop multiplayer state, loadout, accessibility, diagnostics, keyboard/gamepad focus, or return-to-lobby controls.
- Player-facing command and HUD chrome must remain a bright, legible tactical system rather than regressing to a near-black or dark-blue monolith. At 1280x720, menu labels and critical HUD status text are at least 9px, primary actions and values are at least 12px, and every review viewport must be free of clipping and surface overlap.
- Arena-selection previews are distinct prerecorded, compressed, locally hosted videos of the actual selected production arena, with unique real-map landmarks and poster/static fallbacks; a proxy scene, placeholder, another arena or live menu render fails. Browsing the menu must construct zero gameplay arenas and run zero live preview rendering or physics. Only after the selected video's first frame is visible may one fenced, isolated submission compile the retained-asset TSL/HDR pipeline; it must not attach an arena root, render a gameplay scene, recur, or compete with the preview decoder. Nuke Town, Terminal and RustRig videos use the authored helicopter/cockpit flyover; Gun Range uses the authored cat first-person moment. The deterministic offline render recipe remains source/provenance evidence, while runtime uses bounded media decode, race-safe map switching and a static reduced-motion poster. The selected arena itself streams and compiles only after explicit deployment begins behind its loading transition.
- Use `.agents/skills/atomic-acres-webgpu-frame-pacing` for renderer-loop, pause/menu lifecycle, arena-streaming, freeze or frame-tail work. Active native-WebGPU gameplay must never read or copy the presented game canvas into 2D/CPU memory; a WebGPU pause uses CSS compositor blur, while WebGL2 compatibility may perform at most one fresh pause-open canvas-to-2D copy outside the frame loop. Require the clean exact-SHA installed-Chrome native-WebGPU 2560x1440 Atomic-versus-Terminal frame-pacing receipt and lifecycle gates before publish. Pass 66's standing authorization waives only an additional subjective owner round; it waives no mechanical, visual-regression or exact-SHA evidence.
- The top-level graphics surface exposes exactly the ladder declared by `GRAPHICS_PROFILE_DESCRIPTIONS` (`src/ui/graphics-profile-descriptions.ts`), in that order, plus `CUSTOM` and the non-preset RTX native-runtime explainer entry; `src/ui/pass64-shell.test.ts` and the three browser assertions in `tests/e2e/atomic-acres.spec.ts` and `tests/e2e/pass64-hud-menu.spec.ts` pin it exactly and must move together. This sentence used to enumerate the profiles and went stale twice — once when RAY TRACED shipped (HF-398) and again when BALANCED and the RTX explainer shipped (HF-418) — so it now names the source of truth instead. The former Quality value migrates to Max; Quality is the balanced high-fidelity profile, Max deliberately selects the highest supported values, Performance is the lowest gameplay-safe profile, and all named profiles default to uncapped rendering. Custom starts from the last selected named profile and persists only after a successful atomic Save/Exit or panel-exit commit. Advanced Graphics starts collapsed and is generated from the canonical renderer-feature inventory; every visible control must have a real runtime consumer, capability/apply-mode reason, persistence round-trip and scene support. Decorative/no-op controls and silently omitted new renderer features fail the orphan-option gate.
- Every HUD/menu change runs `src/ui/surface-registry.test.ts`, `src/ui/menu-preview-camera.test.ts`, and `tests/e2e/pass64-hud-menu.spec.ts`, then visually inspects the desktop, laptop, ultrawide, narrow, high-DPI, live-HUD, returned-lobby, and match-end artifacts.

## Integration and production

- Contributors may commit and push only their contribution branch. They must not push `main`, push `gh-pages`, merge their own PR, or run `npm run deploy`.
- Every PR must use the repository template and identify its machine, harness, base SHA, head SHA, changed paths, tests, and release-note impact.
- Every Pass 62+ `runtime` or `release-shell` PR must change exactly one `acceptance/pass-<number>.json`, map every requested outcome to evidence, and record Dave's approval of the immutable PR preview's exact source SHA. Runtime/release-shell changes after that preview invalidate approval.
- Pass 66 is the narrow exception to a new owner-preview interaction: after the immutable preview exists and every blocking gate is green, a process-only manifest update may bind Dave's already-recorded standing conditional publication instruction to that exact SHA. The receipt must truthfully say that Dave did not inspect that immutable preview in a new HITL round, use the actual later binding timestamp, and invalidate on any runtime or release-shell drift.
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

**Symptom -> Cause -> Correction -> Verify:** a publicly selectable Stable fallback shows `LAST RELEASE · PENDING_PRODUCTION` -> the pinned Pages subtree was built before production timestamp injection and byte-preservation carried the candidate sentinel forward -> rebuild the exact approved Stable source with `VITE_RELEASED_AT` derived from the immutable pinned Pages commit time, record `rebuiltFromSource: true` plus original Pages identity, and fail production unless every channel exposes a parseable real timestamp -> the topology byte/provenance gate passes and cache-busted browser smoke reports a UK-local Last Release label with no `PENDING_PRODUCTION` on Live, Stable, or Rollback.

**Symptom -> Cause -> Correction -> Verify:** a body, door, roof, light, or prop regresses to placeholder quality while tests stay green -> structural telemetry was mistaken for visual proof -> prohibit primitive runtime operator fallbacks and require deterministic pixel/ROI review cameras plus semantic geometry/collision assertions -> inspect the immutable WebGPU contact sheet and run the corresponding per-arena contract in both profiles.

**Symptom -> Cause -> Correction -> Verify:** a corpse or low-detail path shows the retired block-built humanoid while live combatants use the authored rig -> character presentation was given a separate primitive fallback or a caller could opt out of the canonical rig -> all players, bots, reinforcements, and corpses must use `buildOperator` with the same loaded rig, team appearance, and carried weapon; performance profiles may simplify materials but never substitute anatomy -> run `src/corpse-presentation-contract.test.ts` and the canonical rigged death browser check.

**Symptom -> Cause -> Correction -> Verify:** gameplay simulation/audio continue but the visible native-WebGPU frame freezes for seconds -> the active renderer periodically copied the presented game canvas into a 2D pause canvas and forced a synchronous GPU readback -> remove active/periodic canvas capture, use CSS compositor blur for WebGPU, and retain at most one backend-guarded pause-open copy for WebGL2 -> run `npm run qa:pass65:frame-pacing-policy`, both lifecycle gates, and the clean exact-SHA installed-Chrome 2560x1440 Atomic-versus-Terminal p50/p95/p99/max and >20/33/50/100 ms gate before headed owner HITL.
