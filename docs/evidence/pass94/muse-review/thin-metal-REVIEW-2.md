# Muse re-review — thin-metal perforation lane after fixes (HF-467)

Reviewer: Meta Muse Spark 1.3 (skeptic). Scope: `git log --oneline cbc737ca..HEAD`
(3571e48c refactor + 1e0c6f2c, 307692c7, d0f28e21, f35b1d04, 554de1dc, fe26c8cd,
74909b1c, 59a188e0), full diff over `src`, first review
`docs/evidence/pass94/muse-review/thin-metal-REVIEW.md` (DO-NOT-SHIP, F-01..F-10).
Read-only; no builds, no test runs, no `src/` edits. HEAD verified: 59a188e0.

## Verdict: SHIP

1. Every blocking finding from REVIEW-1 is fixed in the source AND pinned by a
   named test: F-01 (`rejects a valid older envelope after a newer state was
   applied`), F-02 (`rejects subset panels and panel states from another match`),
   F-03 (`keeps hole ids fresh when a guest is promoted to host`), F-04
   (protocol assertion inside `replicates through a hash-bound envelope and
   rejects tampering`), F-07 (`restores the prior scene root and disposes a
   failed successor`). No missing-test gap remains from the blocking set.
2. The 3571e48c hoist into `src/thin-metal-perforation-runtime.ts` is
   behaviour-preserving against the removed `src/legacy-main.ts` hunks (point-by-point
   below); the one construct that could have broken (`worldApertureQuery`
   method extraction) is safe because the shed's `apertureQuery` is a lexically-bound
   arrow property (`src/interactive-world-runtime.ts:1335`), not a prototype method.
3. Mechanical gates are green by construction of the diff itself: `src/legacy-main.ts`
   measures 37,362 lines vs the unchanged 37,365 ceiling (F-05 resolved with NO ledger
   entry needed — the hoist nets −115), and the rollback-leak fix mirrors the shed
   lines beside it exactly. Residual notes N-01/N-02 below are hardening observations,
   not ship-blockers, each with a one-line fix for a later lane.

## F-01 — stale-envelope replay: FIXED + pinned

`src/thin-metal-perforation.ts:486` (`private lastAppliedRevision = -1`),
`:635` (`if (value.revision <= this.lastAppliedRevision) return false`),
`:654` (watermark advance on accept), `:664` (watermark reset on epoch advance).
Why sufficient: the guest never mints (`guest-cannot-mint-hole` unchanged), so the
applied-watermark equals the guest's effective revision at all times; any older or
duplicate same-arena/match envelope now returns `false` with state untouched, which is
the shed-monotonicity property REVIEW-1 asked for (shed uses strict `<` against world
revision; see N-01 for the deliberate `<=` delta). Pinning test:
`src/thin-metal-perforation.test.ts:207`
(`rejects a valid older envelope after a newer state was applied` — applies rev-N,
replays rev-0, asserts `false` + aperture still open).

## F-02 — subset envelope / unchecked match fields: FIXED + pinned

`src/thin-metal-perforation.ts:637-641`: `value.panels.length !== this.panels.size`
exact-count check plus per-state `arenaId`/`matchEpoch` equality against the
authority; `isPanelState` now requires the two fields (`exactKeys` +
`isArenaId` + `boundedInteger(matchEpoch, 1)`), and every state constructor
(initial `:503-511`, apply `:644-650`, mint `:585-591`, reset `:666-672`) fills them
from the authority (fe26c8cd closed the mint-path hole where a locally-minted state
would otherwise carry stale/empty identity). Pinning test:
`src/thin-metal-perforation.test.ts:220`
(`rejects subset panels and panel states from another match` — rehashed subset and
rehashed wrong-arena states both shape-valid per `isThinMetalPerforationEnvelope`
yet both `applyAuthoritativeEnvelope → false`).

## F-03 — nextHoleId on guest apply: FIXED + pinned

`src/thin-metal-perforation.ts:651`:
`for (const aperture of state.holes) this.nextHoleId = Math.max(this.nextHoleId, aperture.id + 1)`.
Why sufficient: max-over-applied (not count-based) survives non-contiguous ids and
repeat applies (idempotent — re-applying the same envelope cannot move the watermark
backward since F-01 rejects it first). Pinning test:
`src/thin-metal-perforation.test.ts:248`
(`keeps hole ids fresh when a guest is promoted to host` — 4 host holes applied,
promote, next mint asserts `id === 4`).

## F-04 — isStateTrafficMessage type: FIXED + pinned

`src/protocol.ts:1446`: return type now includes `ThinMetalPerforationStateMessage`;
runtime body already returned `true` for the type, so this is the one-token
narrowing fix REVIEW-1 prescribed, no runtime change. Pinning test: the added
`expect(isStateTrafficMessage(message)).toBe(true)` inside
`src/thin-metal-perforation.test.ts:173`
(`replicates through a hash-bound envelope and rejects tampering`).

## Hoist 3571e48c — behaviour-preserving (vs `git show 1bd382e8 -- src/legacy-main.ts`)

Compared each removed legacy-main hunk against `src/thin-metal-perforation-runtime.ts`:

- create+attach: `createAndAttachThinMetalPerforationRuntime` = old
  `createThinMetalPerforationAuthority` verbatim (null when no registry, `scene.add`
  at creation). Same immediate-visibility semantics (thin-metal next root was never
  hidden pre-commit in either version).
- `worldApertureQuery` (`src/legacy-main.ts:4582`):
  `buildWorldApertureQuery(() => interactiveWorldRuntime?.apertureQuery, …)` extracts
  the shed method, but the shed's `apertureQuery` is `readonly … = (surface, point) =>`
  (`src/interactive-world-runtime.ts:1335`) — lexically bound, so unbound invocation
  is identical. The `const`-vs-`function` hoisting delta is inert: `traceWeaponPath`
  only dereferences it at call time, post-module-init.
- impact routing (`src/legacy-main.ts:4670,4679`): loop guard
  (`hasHostAuthority`, `ownsThinMetalPanel` skip) stays in legacy-main;
  `routeInteractiveWorldBallisticImpact` reproduces the old ternary exactly
  (thin-metal-owns → `applyPanelImpact`, else house → `applyHouseBulletImpact`, else
  `applyBulletImpact`), including the `accepted:false` passthrough that the caller's
  `if (!result?.accepted) continue` consumes identically. Comment-only deletion
  (energyAtEntryQ note) is not behaviour.
- broadcast: module-level `lastThinMetalPerforationBroadcastRevision` → per-runtime
  `lastBroadcastRevision`, reset to −1 in `commitThinMetalPerforationRuntime` exactly
  where the old commit reset the module variable; `startGame` behaviour identical
  (neither version reset the thin-metal watermark there). Parameterised
  `player.id`/`network`/`randomNonce` are the same values the closure captured.
- guest ingress + reset: `handleThinMetalPerforationMessage` checks are the same five
  predicates in the same order; `resetThinMetalPerforationRuntime` keeps the
  `matchEpoch > priorEpoch` guard and unconditional `setHostAuthority`. F-08's nesting
  inside `if (interactiveWorldRuntime)` is preserved unchanged — still the recorded
  TODO, not a regression.
- commit/dispose: `previous?.authority.root.removeFromParent()` + return-next and
  `runtime?.authority.dispose()` are the old lines with the pointer renamed.
- rollback at 3571 preserved the F-07 bug verbatim (pointer-only restore) — then
  554de1dc fixed it (next section). Net HEAD state correct; no intermediate commit
  ships (single lane branch, HEAD is the candidate).

## Rollback-leak fix 554de1dc/74909b1c: FIXED + pinned

`src/thin-metal-perforation-runtime.ts:69-83`: rollback re-adds
`previous.authority.root` + `visible = true`, then
`next.authority.root.removeFromParent()` + `next.authority.dispose()` — mirrors the
shed rollback lines directly below the call site (`src/legacy-main.ts:30303-30310`).
Covers previous-null (first-arena: just disposes next) and both-null (no-op).
74909b1c is a 3-line formatting collapse keeping the file under the ratchet; no
semantics. Pinning test: `src/thin-metal-perforation.test.ts:264`
(`restores the prior scene root and disposes a failed successor` — asserts
parentage flip + `dispose` called once).

## TODO reassessment (F-06 / F-08 / F-10): safe to ship as TODOs

- F-06 (cold material inventory, no receipt): safe. Bounded risk is 2 programs on the
  later-arena-switch path only; first deployment is covered by the whole-scene
  precompile; `dispose()` releases all four GPU objects. Receipt (
  `snapshot()` inventory before/after on nuketown2) remains a one-line follow-up.
- F-08 (epoch block nested under shed guard): safe. Both runtimes are created together
  per arena and nuketown2 always yields both; the helper early-returns on null, so the
  unreachable-today staleness mode has no trigger. Hoisting to the authority's own
  prior epoch stays a non-blocking cleanup.
- F-10 (revision bumps per counted hit, `src/thin-metal-perforation.ts` mint path):
  safe. Over-budget hits still bump `revision` and therefore broadcast, but the state
  is ≤24 holes on the existing tick cadence with revision-gating — measurable wire
  only, no correctness impact. Gate-on-content-change stays a one-line follow-up.

## Residual non-blocking notes (later lane, smallest fix each)

- N-01 — equal-revision retransmit returns `false` (`:635` uses `<=`; shed uses strict
  `<`). Harmless today (`handleThinMetalPerforationMessage` ignores the return and a
  duplicate carries identical state), but a future caller branching on the return could
  misread an idempotent repair as rejection. Fix (optional): adopt shed-strict `<`
  once the forced-reliable repair path asserts duplicate acceptance in a test.
- N-02 — exact-count without uniqueness: `[a:1, a:1]` (length 2, all known) would pass
  `:637` and apply twice, last-wins. Unreachable without a hostile host (envelope hash
  is integrity-only; authorship rides `isHostAuthorityMessage` + `by === hostId`, same
  threat model as the shed path, and the host never emits duplicates). Fix (optional):
  one-line `new Set(value.panels.map(s => s.panelId)).size === value.panels.length`.
- N-03 — F-05 margin: ceiling 37,365 vs 37,362 leaves 3 lines of slack (RATCHET_SLACK
  250, so no lock-in trip). The next lane touching legacy-main should expect to file a
  CEILING_HISTORY entry; the hoist bought room but did not remove the ratchet.

## What stayed good

Sibling-not-fork discipline untouched by all nine commits; energy-at-entry + penetrated
gating unchanged; `exactKeys` + wire-budget cap carried onto the two new identity
fields; full emitted surface-name registry binding unchanged.
