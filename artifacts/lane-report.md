# Lane Report — HF-467 thin-metal perforation (R3 §9 sibling)

- **Executor:** GLM 5.3 Flash (model `zai/glm-5.3-flash`) via OMP on `dave-gaming-pc`
- **Branch:** `contrib/dave-gaming-pc/claude/thin-metal-perforation` (base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `876397c8`)
- **Worktree:** `C:\Users\david\projects\aa-claude-perforate` (new, isolated; `node_modules` junction → `aa-shared-install\node_modules`)
- **Commit:** `1bd382e8` — pushed, tracking origin
- **Change impact:** `runtime`

## What was built

`src/thin-metal-perforation.ts` — a per-panel perforation authority for plain
thin-metal panels, the sibling of the shed's authority the research specifies
(R3 §9), narrowed to one module per lane instruction:

- **Hit authority.** `applyPanelImpact` counts hits on a registered panel only
  when the round actually penetrated AND the trace's `energyAtEntryQ` meets
  `THIN_METAL_PERFORATION_MIN_ENERGY_Q` (derived:
  `round(BALLISTIC_MATERIALS['thin-metal'].entryCost × BALLISTIC_ENERGY_Q)` = 10).
  At the authored hit count (`hitsToOpen`) the panel mints a hole at that
  hit's point, quantised on the shed's `SHED_PANEL_COORD_Q` scale, clamped to
  the panel like the shed's `closestPanelPoint`.
- **Aperture registration.** `apertureQuery` (a `BallisticApertureQuery`,
  same contract as the runtime's shed-only query) returns true for entry
  points inside an open hole. Wired into `traceWeaponPath` via a combined
  `worldApertureQuery` (shed ∨ thin-metal), so bullets and bot shot traces
  pass host and guest alike. Movement colliders are kept — a bullet hole is
  not a doorway (shed `perforate` class semantics).
- **Budgets.** `THIN_METAL_MAX_HOLES_PER_PANEL = 2`,
  `THIN_METAL_MAX_HOLES_PER_ARENA = 24`. Over-budget hits still count, but
  mint nothing.
- **Presentation.** Bounded instanced set in a scene-level group: one rim
  torus + one alpha-cutout disc (deterministic `DataTexture` stencil, no DOM)
  per hole, capped by the arena budget.
- **Multiplayer (host-authoritative).** New `thin-metal-perforation-state`
  message shaped exactly like the shed's `interactive-world-snapshot`
  (`{type, schemaVersion, by, envelope, nonce}`), envelope SHA-256-hashed over
  sorted panel states (`canonicalSha256`). Registered in
  `isHostAuthorityMessage` and `isStateTrafficMessage`; `isGameMessage` /
  `messageBelongsToPlayer` extended. Guests apply
  `applyAuthoritativeEnvelope` (arena + epoch + hash + known-panel validated);
  host broadcasts on the shed's cadence, revision-gated. Reset rides the
  shared match epoch (epoch must advance; else throws). Authority is created,
  committed, rolled back, and disposed beside the interactive-world runtime in
  the arena transition.

### Registry wiring — nuketown2 (hooks, listed)

1. `src/nuketown2-arena.ts` — `NUKETOWN2_THIN_METAL_PANELS` export: six specs
   binding the full emitted surface names (both handed halves of `verge sign
   board`, `verge speed limit sign`, `verge street name blade`),
   `hitsToOpen: 3` each, authored hole radii (0.11/0.06/0.05 m).
2. `src/nuketown2-arena.ts` — one derived line in `buildNuketown2`'s return:
   `thinMetalPanels: thinMetalPanelPlacements(NUKETOWN2_THIN_METAL_PANELS, builder.shotSurfaces)`.
3. `src/map.ts` — `ArenaMap` gains the optional `thinMetalPanels` field
   (type-only; every other arena leaves it undefined and every thin-metal call
   site short-circuits).
4. `src/legacy-main.ts` — `createThinMetalPerforationAuthority` beside
   `createInteractiveWorldRuntime`; transition create/commit/rollback/dispose;
   reset + role flip in the shared epoch block; combined `worldApertureQuery`
   in `traceWeaponPath`; panel routing in `applyInteractiveWorldBallisticTrace`;
   broadcast + guest handler + dispatch.
5. `src/protocol.ts` — message registered in `GameMessage`, `isGameMessage`,
   `isHostAuthorityMessage`, `isStateTrafficMessage`, `messageBelongsToPlayer`.

## Gate outputs (quoted)

1. `npx tsc --noEmit` → **exit code 0** (no output).
2. `npx vitest run src/thin-metal-perforation.test.ts src/destructible-shed-*.test.ts
   src/ballistics.test.ts src/collider-visual-parity-gate.test.ts src/nuketown2-fidelity.test.ts`
   → **8 files passed, 105 tests passed, 0 failed** (thin-metal 10; shed
   definition/presentation/registry/map-parity unchanged; ballistics;
   collider-visual-parity-gate — nuketown2 walk-through budget **still 0**,
   ballistic unrated ceiling still 0; nuketown2-fidelity unchanged).
3. `scripts/release/pipeline-guard.mjs contribute` (AGENTS.md preflight, handoff
   leg) → **exit 0** (`containsOriginMain: true`, clean tree). Note: run with
   `--harness claude` because the orchestrator-authored lane branch's harness
   segment is `claude`; the executing harness is GLM 5.3 Flash via OMP (both
   facts stated here). `qa:lockfile` → `{"ok":true,...}`.

## Test acceptance mapping (all authored in `src/thin-metal-perforation.test.ts`)

- Hole appears after the authored hit count — `opens a hole exactly at the
  authored hit count, at the hit point` ✔
- Aperture registered — `lets the canonical trace pass through the open hole
  and nowhere else` (real `traceBallisticPath`; impact disappears at the hole
  only) ✔
- Hole budget respected — `respects the per-panel and global hole budgets` ✔
- Guests cannot mint a hole — `never lets a guest mint a hole, but still
  applies the host envelope` (+ network-level drop proven by
  `isHostAuthorityMessage` registration; envelope tampering rejected) ✔
- Shed behaviour unchanged — shed suites untouched and green; pinned in
  `leaves the destructible shed contract alone` ✔
- Parity gate walk-through budget nuketown2 still 0 — collider-visual-parity-gate
  suite green ✔

## Claim-states

- **Verified (observed):** the six wired panels are exactly today's
  `thin-metal`-rated nuketown2 surfaces: the two handed halves of `verge sign
  board`, `verge speed limit sign`, `verge street name blade`
  (`grep 'thin-metal' src/nuketown2-arena.ts` → those three `pair()` calls
  only). tsc + 105/105 tests + parity gate green on commit `1bd382e8`.
- **Verified false (owner's parenthetical vs current table):** the moving
  truck's box body and garage doors are NOT rated `thin-metal` today — the
  truck box surfaces carry no explicit material and fall to `vehicle` by the
  name rule; the garage door family falls to `interior-wall`. R3 §10 step 3
  deliberately rated the truck `vehicle` "for now (leave `thin-metal` for
  §9)". I did not re-rate them: that changes ballistics parity (thin-metal
  entry cost 0.95 vs vehicle 2.5) beyond this lane's contract. The moment a
  later lane rates them and adds a registry line, they gain holes with no
  further code.
- **Inference (bounded):** bot line-of-sight stays collider-based
  (`activeWorldColliders` + `segmentIntersectsBox`), so a hole does not open
  bot LOS — identical to the shed's accepted behaviour ("no LOS change on
  perforation" was explicitly deferred in the research). `apertureQuery` in
  this codebase is the ballistic query; that is what "movement/bullets/bot LOS
  pass through" resolves to for shot authority. Movement: the two sign
  surfaces are already `solid:false`; the solid sign board keeps its collider
  by design.
- **Incident (observed, external):** the shared install
  `C:\Users\david\projects\aa-shared-install\node_modules` was mutated by
  another process mid-run (LastWriteTime 16:38, entries dropped 349 → 103,
  `.bin` and `@jridgewell/*` gone), breaking `npx`-shimmed gates. Per lane
  rules I did not run npm install/ci/rebuild. Gates were executed with the
  version-identical complete install at `aa-omp-pass83` (vitest 4.1.9,
  typescript 6.0.3 — the same versions the shared install pins), read-only,
  via direct module entries. The junction itself was left pointed at
  `aa-shared-install` per lane contract.
- **Unknown:** whether the shared-install rebuild (another lane's operation)
  completed after 16:53; not re-checked after my final gate run.

## Codex ratchet repair

- **Verified:** `src/legacy-main.ts` was 37,477 lines before the refactor and is 37,362 lines after it,
  3 below the unchanged 37,365-line ceiling.
- **Verified:** thin-metal host wiring moved to `src/thin-metal-perforation-runtime.ts`: arena
  create/attach and transition lifecycle, combined aperture query, ballistic impact routing, reset/role
  flip, host broadcast, and guest ingress. The existing shed path and authority module were left intact.

## Review fixes

- **VERIFIED F-01:** `applyAuthoritativeEnvelope` now keeps an applied-revision watermark and rejects
  equal or older same-arena/match envelopes. The new test applies a newer valid state, replays the
  older valid state, and confirms the aperture remains open.
- **VERIFIED F-02:** every panel state now carries `arenaId` and `matchEpoch`; guest apply checks both
  against the authority and requires the exact registered panel count/set. Tests cover a rehashed
  subset and a rehashed panel state from another arena.
- **VERIFIED F-03:** guest apply advances `nextHoleId` past every replicated aperture id. The promotion
  test applies four host holes, promotes the guest, and confirms the next minted id is 4.
- **VERIFIED F-04:** `isStateTrafficMessage` now narrows to `ThinMetalPerforationStateMessage`; the
  thin-metal protocol test asserts the message is state traffic.
- **VERIFIED F-05:** no ratchet ledger change was needed after the HEAD hoist. The current
  `src/legacy-main.ts` count is 37,362, below the existing 37,365 ceiling.
- **VERIFIED F-07:** failed arena transition rollback now reattaches the previous thin-metal root,
  detaches and disposes the failed successor, and has a focused parentage/disposal test.
- **UNCHANGED F-09:** ballistic aperture semantics remain correct; movement and bot visual LOS stay
  on the retained shed-compatible collider path.
- **TODO F-06 (non-blocking):** capture the review-requested before/after Nuketown2 snapshot material
  inventory receipt on the real deployment path; no runtime code change is justified by the review.
- **TODO F-08 (non-blocking):** hoist thin-metal reset/role assignment out of the
  `interactiveWorldRuntime` guard and key it from the thin-metal authority's own prior epoch.
- **TODO F-10 (non-blocking):** increment thin-metal revision only when hole content changes, or gate
  broadcast on hole-count/content change, while preserving forced reliable repair sends.

### Review-fix gates

- **VERIFIED:** `npx tsc --noEmit` passed.
- **VERIFIED:** requested CPU-only focused Vitest set passed: 16 files, 223 tests, 0 failures.
- **CONSTRAINT:** no install/CI/rebuild, build, browser, preview, or GPU command was run.

## Follow-ups

The three Muse re-review TODO reassessment items (thin-metal-REVIEW-2.md) landed as
three commits on this branch, each gated before its commit.

- **DONE F-06 (0d570e09):** new receipt test builds the real nuketown2 arena
  (`buildNuketown2`), snapshots the scene's geometry/material/texture inventory
  before and after `createAndAttachThinMetalPerforationRuntime` →
  `removeFromParent()` + `disposeThinMetalPerforationRuntime`, asserts the cold
  presentation adds exactly 2 meshes / 2 geometries / 2 materials / 1 stencil
  texture, that every created GPU resource's `dispose` fires exactly once, and
  that the inventory counts return to baseline.
- **DONE F-08 (46fd135a):** `ThinMetalPerforationRuntime` now tracks its own
  `lastMatchEpoch` (set at creation, advanced by reset);
  `resetThinMetalPerforationRuntime` drops the caller-supplied shed
  `priorEpoch` and guards on that tracked epoch. In `src/legacy-main.ts` the
  thin-metal reset call is hoisted above the `if (interactiveWorldRuntime)`
  guard, so a thin-metal reset lands even with no shed runtime. Pinned by a
  no-shed-runtime reset test and a legacy-main source assertion.
- **DONE F-10 (2cfec655):** `applyPanelImpact` bumps `revision` only when
  `opensHole`, so an over-budget hit still counts (`hits`) but neither bumps
  the revision nor triggers the revision-gated broadcast. Pinned by a test
  walking hits 1–5: two silent dents, two mint broadcasts, then a silent
  over-budget hit at the per-panel cap.

### Follow-up gates

- **VERIFIED:** `npx tsc --noEmit` exit code 0 (run before each commit).
- **VERIFIED:** `npx vitest run src/thin-metal-perforation*.test.ts src/destructible-shed-*.test.ts src/ballistics.test.ts src/protocol*.test.ts src/legacy-main-size-ratchet.test.ts` — 8 files, 109 tests, 0 failures (final run; per-commit runs passed 106 → 108 → 109).
- **VERIFIED:** `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin HEAD` — `9e2405d7..2cfec655`.
- **VERIFIED:** `git status -sb` — `## contrib/dave-gaming-pc/claude/thin-metal-perforation...origin/contrib/dave-gaming-pc/claude/thin-metal-perforation` (in sync, clean).
- **CONSTRAINT:** no install/CI/rebuild, build, browser, preview, or GPU command was run.
