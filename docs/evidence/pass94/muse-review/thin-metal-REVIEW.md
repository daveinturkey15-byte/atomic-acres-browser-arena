# Muse review — thin-metal perforation lane (HF-467, commit 1bd382e8)

Reviewer: Meta Muse Spark 1.3 (skeptic). Scope: `git show HEAD` (6 files, +1069/−6),
`artifacts/lane-report.md`, R3 §9 (`aa-claude-research/.../R3-material-penetration-design.md` §9).
Read-only; no builds, no test runs, no `src/` edits.

## Verdict: DO-NOT-SHIP

1. `src/legacy-main.ts` is 37,477 lines vs the ratchet ceiling 37,365 (+112) and this
   commit does not touch `src/legacy-main-size-ratchet.test.ts` — the lane's own gate list
   omits the ratchet, so `npm test` goes red on merge. Mechanical, not stylistic.
2. `applyAuthoritativeEnvelope` accepts stale/subset envelopes with no revision
   monotonicity, unlike the shed path it claims to mirror byte-for-byte — a replayed
   older host envelope silently un-opens holes on guests (state rollback, hash still valid).
3. The arena-transition rollback path restores the previous thin-metal pointer but neither
   re-attaches its scene root nor removes/disposes the just-created next authority —
   a leaked scene group plus undisposed geometries on every failed arena switch
   (the shed pointer beside it re-adds its root; see F-08).

All three fixes are small (ledger entry; three-line guard + exact panel-set match;
four-line rollback symmetry). Details per finding below.

## Finding list (file:line — why — smallest fix)

### F-01 — stale-envelope replay accepted (multiplayer safety)
`src/thin-metal-perforation.ts:619-635` (`applyAuthoritativeEnvelope`): accepts any
well-shaped, hash-valid, same-arena+epoch envelope, including an OLDER one. The shed
counterpart `src/interactive-world-runtime.ts:687-701` additionally requires
`states.reduce(...revision...) === envelope.revision` AND
`Number(envelope.revision) < worldRevision(...) → false` (monotonicity). Thin-metal has
neither: `revision` is overwritten blindly (`:624`), never compared. Consequence: a
retransmitted or captured older `thin-metal-perforation-state` message (valid hash,
valid shape, same epoch) rolls guest holes backward with return value `true`.
`network.ts:1171` drops guest-*authored* copies at ingress (registration in
`isHostAuthorityMessage`, `src/protocol.ts:1416`, verified present), but replay of a
genuinely host-authored older envelope arrives on the host connection and passes every
check. The test suite pins tamper-rejection (`thin-metal-perforation.test.ts:167-198`)
but never sends an older-valid envelope — the missing test.
Fix: mirror the shed — reject when `Number(value.revision) < this.revision`, and
(optionally, cheap) reject when the per-panel hole/hit content hashes equal but revision
went backward. Add test: apply envelope@rev3, then re-apply envelope@rev1 → `false`,
aperture unchanged.

### F-02 — subset envelope accepted; per-state match fields unchecked
Same function, `:621-623`: builds `known` from local panels and requires
`value.panels.every(known.has(...))` — subset, not equality. An envelope that OMITS a
panel passes validation and leaves that panel's local state stale (holes kept that the
host no longer has, or vice versa), a durable desync the hash cannot catch (hash covers
only what is present). Shed requires `envelope.sheds.length === this.sheds.length`
(`interactive-world-runtime.ts:691-693`) plus per-state `arenaId`/`matchEpoch` equality
(`:696-697`); thin-metal checks neither per-state field.
Fix: require `value.panels.length === this.panels.size` alongside the `every(known.has)`
check (one line), and require each state's holes length ≤ per-panel cap (already enforced
by `isPanelState`, `:295` — keep). Add test: envelope with one panel dropped → `false`.

### F-03 — `nextHoleId` never advances on guest apply (host-succession id reuse)
`src/thin-metal-perforation.ts:571` mints `id: this.nextHoleId++`; guest ingress
(`:619-635`) copies hole objects verbatim but never advances `nextHoleId` (stays 0).
On host succession / role flip (`legacy-main.ts` sets `setHostAuthority(mode !==
'client')` in the shared epoch block, ~line 17562) a promoted guest mints ids 0,1,2…
that already exist in the replicated holes. Functional blast radius today is small
(lookup and presentation are coordinate/index-based, not id-based), but aperture identity
is part of the hashed envelope and any future dedup-by-id inherits duplicates.
Fix: after applying, set `this.nextHoleId = max(existing ids) + 1` (three lines).
Add test: host opens 2 holes → guest applies → guest promoted
(`setHostAuthority(true)`) → next mint id is fresh.

### F-04 — `isStateTrafficMessage` return type omits the new message
`src/protocol.ts:1446-1449`: runtime returns `true` for
`'thin-metal-perforation-state'` (`:1449`) but the declared predicate type is
`message is StateMessage | BotStateMessage | RailgunStateMessage | KillstreakStateMessage
| InteractiveWorldSnapshotMessage | SmokeStateMessage | TimedMapWeaponStateMessage |
FlarePresentationStateMessage` — no `ThinMetalPerforationStateMessage`. The predicate
lies: narrowing callers never see the thin-metal member. No runtime misroute today
(verified: only `network.ts:1171` and the handler consume it), strictly a type-level bug.
Fix: add `| ThinMetalPerforationStateMessage` to the return type (one token).

### F-05 — size ratchet red (+112, no ledger entry)
`src/legacy-main-size-ratchet.test.ts:78`: `LINE_CEILING = 37_365`. Measured
`src/legacy-main.ts` at this commit: **37,477** lines (+112 over ceiling; commit adds
+124/−6 in legacy-main). The ratchet file is untouched by the commit and unlisted in the
lane's gate outputs. This fails one-directionally until the ceiling is raised with a
`CEILING_HISTORY` entry — the test's own documented procedure (`:60-66`).
Fix: add entry `{ date: '2026-09-04', lines: <measured>, note: 'PASS 94 HF-467: +118 net
— worldApertureQuery union, panel routing, thin-metal broadcast/guest handler, epoch +
arena-transition create/commit/rollback/dispose wiring; decisions live in
src/thin-metal-perforation.ts' }` and set `LINE_CEILING` to the measured number.
(Do not game it: the +118 is genuine wiring; extraction is not applicable — every line
touches legacy-main-owned transition/broadcast state.)

### F-06 — presentation: no new deploy-fence pipeline, but unmeasured cold cost
`src/thin-metal-perforation.ts:351-421`: one shared 32×32 RGBA `DataTexture` stencil
(deterministic LCG seed, headless-safe — good), two `MeshStandardMaterial`s
(`thin-metal-hole-rim`, `thin-metal-hole-cutout` w/ `alphaTest: 0.5`), one
`TorusGeometry(1, 0.14, 6, 16)` + one `CircleGeometry(1, 20)`, two `InstancedMesh`
capped at 24. No custom GLSL, no new `compileAsync`/precompile entry, no render-profile
branch — the WebGPU fail-closed / Pass-64-TSL deploy fence is untouched by construction.
Authority is built during `performArenaSelection` (before the whole-scene
`precompileExactScenePass`), so first-deployment precompile covers it; on a LATER arena
switch (no full precompile) the two materials compile on first visible frame — a
bounded hitch risk (2 programs), not a fence risk. `dispose()` (`:458-466`) releases
texture + geometries + materials; commit path disposes the previous authority
(`legacy-main.ts:30400`). No evidence the lane measured program count or switch hitch —
acceptable to ship without, but record it: `snapshot()` material inventory before/after
on nuketown2 is the one-line receipt a follow-up should attach.
Fix (non-blocking): attach that receipt; no code change required.

### F-07 — rollback asymmetry (scene-graph leak)
`src/legacy-main.ts:30417-30426` (catch/rollback): restores
`thinMetalPerforationAuthority = previousThinMetalPerforationAuthority` but, unlike the
shed pointer two lines above (`:30423-30426` re-adds root + visible), never
`scene.add(previous.root)`, and never removes/disposes `nextThinMetalPerforationAuthority`
(which `createThinMetalPerforationAuthority` already `scene.add`ed at creation).
Failed arena switch ⇒ orphaned next group in the scene (2 instanced meshes, stale
matrices) plus undisposed GPU resources; the restored previous authority renders nothing
(invisible: its root was `removeFromParent`ed at the last successful commit, `:30172`-ish).
Compare commit path (`:30169-30175`-ish + `:30399-30400`): symmetric and correct.
Fix: in rollback, after restoring the pointer: `if (thinMetalPerforationAuthority) {
scene.add(thinMetalPerforationAuthority.root);
thinMetalPerforationAuthority.root.visible = true; }`,
`nextThinMetalPerforationAuthority?.root.removeFromParent();
nextThinMetalPerforationAuthority?.dispose();` — mirrors exactly what the shed lines do.

### F-08 — startGame epoch coupling (minor, noted)
`src/legacy-main.ts:~17558-17566`: thin-metal `reset`/`setHostAuthority` is nested inside
`if (interactiveWorldRuntime)`, keyed off the SHED runtime's `priorEpoch`. If the shed
runtime ever were null while a thin-metal authority exists, the thin-metal epoch would go
stale silently. Today both are created together per arena and nuketown2 always has both,
so unreachable — but the nesting is a coupling the next lane should undo (key off
`interactiveWorldMatchEpoch` vs the authority's own epoch, or hoist the block).
Fix (non-blocking): hoist; one-line guard change. Not a ship-blocker.

### F-09 — aperture semantics vs the task premise (implementation is CORRECT)
Task premise says "a hole lets bullets and bot LOS through". The implementation lets
**ballistic traces** through (`worldApertureQuery = shed ∨ thin-metal`,
`legacy-main.ts:4619-4625`, consumed by `traceWeaponPath` at `:4606-4610`) while movement
colliders stay and **bot LOS never consults it** (`botHasLineOfSight`,
`:20558-20572`, reads `activeWorldColliders()` only). That matches the shed `perforate`
class exactly (R3 §2.4: "the panel keeps pushing a `movementCollider` regardless of
aperture count — a bullet hole is not a doorway") and R3 §8 ("deliberately does NOT open
LOS in v1… Do not add a separate bot-only see-through flag"). The lane report's
"Inference (bounded)" section states this correctly. No fix; the premise sentence should
be read as "bullets and bot *shot traces*" (both go through `traceBallisticPath`), not
bot vision.

### F-10 — broadcast cadence asymmetry (minor)
`broadcastThinMetalPerforationState` (`:12597-12611`) rides inside
`broadcastInteractiveWorldState` (same tick cadence, own revision gate — good) but uses
`interactiveWorldTick % 6` gating only implicitly via the caller's early return, sends on
the unreliable lane + reliable only when forced, while the shed path uses
`% 30` + `sendStateCommitReliably` on its own schedule (`:12593`). Net effect: thin-metal
state actually broadcasts MORE eagerly than the shed's — fine for 24-hole state, but every
counted over-budget hit bumps `revision` (`thin-metal-perforation.ts:579`, even when no
hole opens) and therefore broadcasts. Consider bumping revision only when holes change,
or gating broadcast on hole-count change; one-line change, measurable wire saving. Non-blocking.

## Claim-state audit (the five asks)

1. **Multiplayer safety** — guest mint: SAFE (`applyPanelImpact` returns
   `guest-cannot-mint-hole` when `!hostAuthority`, `:538-544`; `isHostAuthorityMessage`
   registration drops guest copies at `network.ts:1171` — byte-comparable with the shed
   registration two lines above). Reset: SAFE (epoch must advance, `:637-640`, same shape
   as shed). Replay/desync: UNSAFE — F-01 (no monotonicity), F-02 (subset), F-03 (id
   reuse). Hash itself: SOUND (`canonicalSha256` over sorted panels, `:600-616`, same
   construction as shed `:669-685`).
2. **Transition symmetry** — create/commit/dispose symmetric with shed (verified
   line-by-line); rollback is NOT (F-07); startGame epoch nesting is coupled (F-08).
3. **Presentation/deploy fence** — no new pipeline or precompile entry (F-06); size
   ratchet RED, lane did not run it (F-05). `wc -l src/legacy-main.ts` = 37,477 vs ceiling
   37,365.
4. **Aperture semantics** — union correct; movement stays; bot LOS untouched — consistent
   with shed `perforate` and R3 §8 (F-09). Bot *shot* traces pass through the same
   `traceBallisticPath` aperture mechanism as bullets (single call site).
5. **Test mapping (six required behaviours)** —
   hole-after-N ✔ (`opens a hole exactly at the authored hit count`);
   aperture-registered ✔ (`lets the canonical trace pass…`, real `traceBallisticPath`);
   budget ✔ (`respects the per-panel and global hole budgets`);
   guest-cannot-mint ✔ (`never lets a guest mint…`);
   shed-unchanged ~WEAK (constants-only: 6 chunks, door id, threshold 21 —
   `leaves the destructible shed contract alone`; behavioural non-regression is covered
   only indirectly by running the 4 shed suites green, which the lane did: 105 passed);
   parity walk-through 0 ✔ (via `collider-visual-parity-gate` suite green, not a
   thin-metal assertion).
   Missing: stale-envelope rejection, subset-envelope rejection, promotion id-freshness,
   rollback/dispose symmetry, ratchet gate itself. None of the five missing has a test.

## Smallest fix list (in order)

1. Ratchet ledger entry + ceiling bump (F-05) — unblocks `npm test`.
2. `applyAuthoritativeEnvelope`: revision-monotonicity guard + exact panel-set length
   match (F-01, F-02) with two new tests.
3. Advance `nextHoleId` past applied holes (F-03) with promotion test.
4. Rollback: re-add previous root + remove/dispose next (F-07).
5. `isStateTrafficMessage` return type + `ThinMetalPerforationStateMessage` (F-04).
6. Non-blocking: wire-revision only on hole change (F-10), hoist epoch block (F-08),
   attach material-inventory receipt (F-06).

## What is good (for the record)

- Sibling-not-fork discipline: reuses `apertureContainsPanelPoint`,
  `SHED_PANEL_COORD_Q`, `BallisticAperture` without touching
  `DestructibleShedDefinition` validation — exactly what R3 §9 prescribed.
- Energy admission uses the trace's per-impact `energyAtEntryQ` (R3 §6 fix shape),
  plus `penetrated` gating — stronger than the muzzle-constant the research flagged.
- `exactKeys` + per-field validators + wire-budget cap on the new message mirror the
  taser-lane template; `messageBelongsToPlayer`/`isGameMessage` registrations complete.
- Registry binds full emitted surface names per handed half with typo-rejecting placement
  derivation and a dedicated test.
