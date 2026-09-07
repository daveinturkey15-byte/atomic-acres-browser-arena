# w5-300: nuketown2 breakable windows — evidence report

Lane: `contrib/dave-gaming-pc/claude/nuketown2-breakable-windows`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` @ `3e2fd273`
Brief: `w5-300-build-windows-breakable.md` (owner HITL 2, ledger HF-464/HF-467)

## Outcome

All 8 nuketown2 house panes (2 ground-front + upper-front + upper-back per
house, mirrored north/south through `pair()`) are breakable glass on the
shipped `shatter` path. This lane adds one acceptance test pinning the
brief's contract; production diff is zero by design (see §3).

## Claim-states

- VERIFIED — every house pane upstairs and downstairs is rated `shatter`:
  `src/nuketown2-breakable-windows.test.ts` builds `buildNuketown2` and
  asserts 8 panes / 4 authored bodies each with `:north`+`:south` halves, 4
  upstairs panes by name, and one explicit `glass` ballistic surface per pane
  with `BALLISTIC_MATERIAL_CLASS[glass] === 'shatter'`. Gate quoted §5.
- VERIFIED — one admitted bullet hit removes the pane and opens a real
  aperture: `admitGlassImpact(..., 'bullet')` → `breached`, projection
  `apertureOpen/paneVisible:false/ballisticSolid:false/movementSolid:false/
  aiLineOfSightSolid:false`, `deriveGlassDynamicColliders` drops exactly that
  pane, and a `traceBallisticPath` over the remaining surfaces (the same
  removal `activeBallisticSurfaces()` performs in `src/legacy-main.ts:4548`)
  crosses with zero impacts and `reachedDistance: true`. Gate quoted §5.
- VERIFIED — one admitted melee hit opens the same aperture (`knife`
  `damageQ 1000` ≥ breach threshold). Gate quoted §5.
- VERIFIED — guests mint nothing: `admitGlassImpact(isHost:false)` →
  `accepted:false, reason:'not-host'`, state unchanged; `window-break`
  without `hostAuthority` is not `isHostAuthorityMessage`, with it is —
  so `network.ts` drops guest-minted breaks at ingress, mirroring the
  `thin-metal-perforation-state` guarantee. The thin-metal module was read
  via `git show origin/contrib/dave-gaming-pc/claude/thin-metal-perforation:
  src/thin-metal-perforation.ts` and NOT merged. Gate quoted §5.
- VERIFIED — parity walk-through budget nuketown2 stays 0: no window-bound
  surface is `fallback`; `collider-visual-parity-gate.test.ts` green (zero
  invisible colliders, no walk-through beyond the ledger, which names no
  nuketown2 row). Fidelity, coplanar (0 FINDINGS) and size ratchet
  (37231 ≤ 37396) green. Gates quoted §5.
- DESIGNED (needs capture) — cheap shard burst reuses the existing
  catalogue, no new pipeline: on breach `breakHouseWindow`
  (`src/legacy-main.ts:15931`) calls `spawnPersistentWindowDebris` (pooled
  instanced shards), `spawnImpactFlash(point, 'glass')` and
  `audio.impact('glass')`. The inputs that path reads —
  `paneVisible:false` + `apertureOpen:true` — are asserted in this lane's
  test. Visual confirmation needs a headed capture (no browser/GPU in this
  lane by owner constraint): OPEN.
- OPEN — two-peer live replication of a window break and headed visual of
  the shard burst; blocked by the lane's no-browser/no-GPU constraint, not
  by the code (host/guest ingress guards cited above).

## Why zero production diff

The base already ships the full mechanism (ledger HF-464 state VERIFIED
2026-09-04 lane I1; HF-467 rates glass `shatter`): `pair()` mints unique
`:north`/`:south` ids (`src/nuketown2-arena.ts:927`), `breakHouseWindow`
drives the shipped `admitGlassImpact` phase machine for bullet/melee/
crossbow/explosive hits, replicates over the validated `window-break`
message (host-canonicalized via `canonicalHostWindowBreak`, guest ingress
via `acceptRemoteWindowBreak`), and `activeBallisticSurfaces()` +
`deriveGlassDynamicColliders()` open the aperture for bullets, players and
bots together. Re-rating, re-messaging, or re-emitting the panes would
duplicate that authority against the brief's own "reuse, never duplicate"
and the ledger's "no protocol change — rides window-break". The lane's
addition is the missing mechanical falsifier for the brief's exact wording.

No render/material change: no per-instance values touched, no new pipeline,
cold-session precompile reach untouched. `src/legacy-main.ts` untouched.

## Gates (quoted)

```
TSC_EXIT:0
```

`npx tsc --noEmit` → clean, exit 0 (run 20:38, after the new test file).

```
 Test Files  5 passed (5)
      Tests  84 passed (84)
```

`npx vitest run src/ballistics.test.ts src/nuketown2-fidelity.test.ts
src/collider-visual-parity-gate.test.ts src/legacy-main-size-ratchet.test.ts
src/nuketown2-breakable-windows.test.ts` → 5 files / 84 tests passed
(run 20:38). New file: 5/5 passed first run.

```
# boxes=819 · pairs<=0.03m: 191 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 165 · SAME-MATERIAL (benign): 26
```

`npx tsx scripts/qa/find-coplanar-pairs.ts` → 0 FINDINGS.

Size ratchet: `src/legacy-main.ts` 37231 lines ≤ ceiling 37396, untouched.

## Files

- `src/nuketown2-breakable-windows.test.ts` (new, only change)
- `docs/evidence/pass95/nuketown2-breakable-windows/REPORT.md` (this file)

## Luna review follow-ups

- TODO (owner evidence): run a two-peer host/guest break and replay the same
  nonce to prove the live replicated pane state converges; the static ingress
  path is verified, but this review intentionally ran no browser or network.
- TODO (owner evidence): capture the actual shard burst and aperture in the
  headed visual review; source wiring to the existing pooled debris/flash/audio
  catalogue is verified, but rendered output is not claimed here.
