# Muse review — SH-L2 irradiance volume, round 2 (head `aaade3a4`)

Scope: `git log --oneline 2c45818f..HEAD` (3 commits,
`920dacbd` chunked session + comment fix, `46d14ea9` digest cache,
`aaade3a4` off-transition move), i.e. exactly the fix for Finding 1/2 of the
round-1 review (`docs/evidence/pass94/muse-review/sh-l2-irradiance-volume-REVIEW.md`),
plus lane REPORT `docs/evidence/pass96/sh-l2-irradiance-volume/REPORT.md` §8.
Round-1 findings on maths/packing/fallback/evidence stand and were not re-audited;
this round checks only the cold-path fix. No builds, no browser, no GPU. Static only.

## Verdict: SHIP-WITH-FIXES

1. The transition is proven bake-free, not merely claimed so: the cold-path test
   swaps the sync backend for a throwing spy and drives the real transition seam
   (`sh-l2-irradiance-cold-path.test.ts:195`), and a second test scans the
   transition seams' source for any sync-bake call (`:241`). Both pin the contract.
2. The digest binds every bake input (arena id, condition id, grid, full light rig,
   rays/bounces/seed, per-shape geometry+albedo) and a stale cache entry is a
   silent miss, never a throw or a wrong bind (`sh-l2-irradiance-cache.ts:89-139`).
3. The pending fallback is exactly zero, the swap is uniform-only into the same
   textures, `legacy-main.ts` is still exactly 37,100/37,100, `git diff --check`
   is clean, and no existing test was touched — the only required item is cleanup
   of the now-dead sync `bake()` method (F1), which is a regression trap, not a
   behavior bug.

## Check 1 — chunked bake: budget enforced, transition never bakes

Budget is structural. `beginShL2Bake` (`sh-l2-irradiance.ts:655-`) bakes at least
one probe per `step()` then yields at `clock() + budgetMs`; a 128-ray probe
measures ~0.7 ms (provenance, unasserted per the PASS 89 lesson), so a 4 ms slice
(`SH_L2_MENU_SLICE_MS`, `sh-l2-irradiance-runtime.ts:96`) overshoots by at most one
probe. `step(0)` still makes exactly one probe of progress, so a zero budget can
never spin. Production pumps via `scheduleBrowserPreparationIdleTask`
(`:273-281`) at 4 ms. Byte-identity under worst-case chunking is pinned by
`step(0)` one-probe-per-step vs one-shot (`cold-path.test.ts:116`), including
digest, deringed and demoted counts — the RNG is created once and consumed in
probe order, so chunking cannot change bytes.

Transition proof, quoted (`cold-path.test.ts:195-213`):

```ts
it('does not call the whole-volume bake on the transition path', () => {
  const backend = __shL2ColdPathForTests.backend;
  const realBake = backend.bakeVolume;
  const spy = vi.fn((): ShL2Volume => {
    throw new Error('transition must never bake synchronously');
  });
  backend.bakeVolume = spy;
  try {
    const storage = new MemoryStorage();
    const receipt = configureNuketown2ShL2ForArena(
      {} as Group, 'high', 83031, 42, 'authored', 0, storage,
    );
    expect(spy).not.toHaveBeenCalled();
    expect(receipt.pending).toBe(true);
```

The companion test (`:241-253`) slices the source of `configureNuketown2ShL2` and
`configureNuketown2ShL2ForArena` and asserts neither body contains `.bake(` nor
`bakeVolume(`. No wall-clock assertion anywhere in the file — correct per PASS 89.

Menu prewarm hooks both idle chains after first-frame + deployment assets
(`legacy-main.ts:30319`, `:37097`), no-op unless Nuke Town selected with the
feature on, never throws into the menu chain (`runtime.ts:317-328`).

## Check 2 — digest cache: inputs covered, stale entries cannot bind

`shL2Digest` (`sh-l2-irradiance.ts:780-`) hashes: `arenaId`, `conditionId`
(preset + overcast blend 4dp, `runtime.ts:141-144`), grid dims/spacing/origin,
sun direction + sun/zenith/horizon/ground colours (i.e. the full realised light
rig, including lux-derived scales), rays, bounces, shape count, seed,
bounce-albedo mode, and per shape kind/centre/half-extents/yaw/albedo quantised
to 1 mm / 0.001. Second boot with unchanged inputs hits `readyByDigest` or the
persistent key `atomic-acres.sh-l2.v1.<digest>` and binds with `pending: false,
cached: true` without calling `bakeVolume` OR `beginBake` — pinned
(`cold-path.test.ts:215-239`).

Stale-entry safety (`sh-l2-irradiance-cache.ts:89-139`): missing key, null storage,
bad JSON, wrong version, `parsed.digest !== digest`, non-triple dimensions, or a
coefficient payload whose byte length ≠ dims×27×4 all return null; corrupt entries
are removed best-effort. `storeShL2Volume` returns false instead of throwing when
storage is missing/full/private-mode. A changed arena yields a different digest,
hence a different key — a miss, never a wrong bind. Pinned by the round-trip,
never-throws, and wrong-length tests (`cold-path.test.ts:149-187`).

Notes (accepted, not findings): the hash is FNV-1a/32 — fine for a cache key,
worst case a wrong-but-clamped lighting bind; the reader trusts stored
`originM`/`spacingM` without recomputing the digest (F3, advisory only —
same-origin `localStorage`, corruption path is eviction, not tampering).

## Check 3 — L1 → L2 swap: cutover, not crossfade; no pop beyond the point; no NaN

Correction to the brief: **there is no crossfade.** `setBlend()` is an explicit
no-op (`sh-l2-irradiance-node.ts:296-` : "a no-op rather than a half-wired second
texture set"). The REPORT is honest about this — "enabled at the waiter's tier in
one uniform flip, so the swap is at most one frame's cutover" (§8). What ships is
a hard one-frame cut from the zero fallback to the tier strength:

- Pending path parks the shared term at latent strength + `enabled = false`
  (`runtime.ts:368-377`); pump completion runs `adoptBaked` (uploads into the SAME
  texture objects, `enabled: false`) then `setTier(tier)` flips `enabled` in the
  same synchronous pump (`:252-271`). Next rendered frame shows full strength.
- The step is bounded by construction: per-channel `min(..., 0.18)` clamp and the
  `·mul(enabled)` terminal (`-node.ts:259-271`), tier strengths ≤ 0.55. The worst
  case is a ~30/255 lift appearing in one frame on shadowed faces (the REPORT's own
  off→high deltas) — and completion normally lands in menu-idle, before any
  transition. Mid-match completion flashing is the integrator's visual call (U3).
- NaN when absent: `configureNuketown2IndirectTerm` gates `enabled` on
  `Boolean(input.volume)` (`indirect-term.ts:48-58`); `setTier` gates on
  `volume !== null`; textures allocate zero-filled (`Uint16Array` zeros =
  half-float +0.0, `-node.ts:125-145`); the CPU mirror returns `[0,0,0]` when
  disabled (`indirect-term.ts:104-116`). The only new arithmetic on the fallback
  path is multiply-by-zero-uniform; `normalize` touches the shading normal exactly
  as every lit material does — no new NaN source. `setVolume` throws on dimension
  change instead of rebuilding (`-node.ts:284-295`): fail-loud, zero pipeline risk.

## Check 4 — tests, ratchet, hygiene

- No loosening: the 3-commit range touches 7 files and **zero existing tests**;
  the only test file is the new `sh-l2-irradiance-cold-path.test.ts` (6 tests, no
  `skip`/`todo`/`only`). `git diff --check` clean.
- Ratchet exact: `src/legacy-main.ts` is 37,100 lines vs `LINE_CEILING = 37_100`
  (`legacy-main-size-ratchet.test.ts:78`) — the menu hooks rewrite two lines
  in place and extend one import (`legacy-main.ts:116`), zero lines added.
- Stale comment fixed as required: `bakeShL2Volume` header now names the real
  `beginShL2Bake` session + 4 ms budget (`sh-l2-irradiance.ts:722-727`).
- Quota/private-mode degrades to a menu-idle rebake by design (store returns
  false; next boot rebakes). Not asserted in-browser — see U1.

## Check 5 — what remains OPEN for the integrator's browser smoke

U1. Cold-admission smoke: transition performs no bake (frame-time), second boot
   with unchanged inputs binds cached with no session, L1-zero fallback renders
   until ready. REPORT §8 leaves this explicitly `[OPEN]`; no wall-clock value is
   asserted in any test, by design.
U2. Preflight branch-convention: intentional `.../claude/...` prefix / harness
   slug stays `[OPEN]` as a handoff caveat (REPORT §6), unchanged by this fix.
U3. Mid-match cutover acceptance: if the idle pump finishes mid-match, the lift
   appears in one frame (Check 3). Accept, or request a strength ramp over N
   frames — a new feature, not this lane's debt.
U4. Time-of-day rebake between matches (~969 ms menu-idle at LOW) unmeasured
   in-browser; provenance only.

## Findings index

| # | File:line | Why | Smallest fix |
|---|---|---|---|
| F1 (required cleanup) | `src/rendering/lighting/sh-l2-irradiance-runtime.ts:197-216` | `createRuntime().bake()` still calls sync `bakeVolume`; zero production callers, but it contradicts the file's own COLD-PATH CONTRACT header and the seam-scan test covers only the two `configure*` seams — a future caller reintroduces transition bake with no red test | Delete the dead `bake` method (and its `ShL2Runtime` type member); keep `shL2BakeBackend` + spy tests as the tripwire |
| F2 (advisory) | `src/rendering/lighting/sh-l2-irradiance-runtime.ts:252-271` | `pumpPendingShL2Bakes` grants the full 4 ms budget per pending session, so N pending digests cost N×4 ms in one idle callback | Carry one deadline across sessions instead of per-session `step(budgetMs)` |
| F3 (advisory) | `src/rendering/lighting/sh-l2-irradiance-cache.ts:89-139` | Reader checks `parsed.digest === digest` but never recomputes the digest from stored fields, so a hand-edited entry could keep the digest string while changing `originM`/`spacingM` (which drive the sample transform) | Re-validate stored origin/spacing/dims against the expected grid, or recompute `shL2Digest` over the stored inputs |

## UNFINISHED

- [ ] F1 dead-sync-`bake()` removal (required before candidate 9).
- [ ] U1 cold-admission browser smoke (bake off transition, second boot free,
      L1 fallback until ready).
- [ ] U2 preflight branch-convention caveat acknowledged at integration.
- [ ] U3 mid-match one-frame cutover accepted or a strength-ramp follow-up filed.
