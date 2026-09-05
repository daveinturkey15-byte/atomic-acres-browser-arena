# Muse review — SH-L2 irradiance volume (pass95, head `2c45818f`)

Scope: `git log --oneline origin/contrib/dave-gaming-pc/claude/pass93-candidate..HEAD`
(13 commits, `777ab6d5`–`2c45818f`), full diff over `src`/`scripts`
(25 files, +2948/−53), lane REPORT
`docs/evidence/pass96/sh-l2-irradiance-volume/REPORT.md`.
No builds, no browser, no GPU. Static review only.

## Verdict: SHIP-WITH-FIXES

1. The maths is right and the safety properties hold: SH constants match the
   real basis, packing round-trips channel-major into the TSL node, the
   unbound/disabled term is exactly zero behind the frozen indirect path, all
   24 factories route through the choke point, pipelines stay at 7+0, and the
   capture pair is a genuine off/high comparison with matching receipts.
2. The cold path pays a synchronous ~2.4 s bake on the Nuke Town transition,
   cached only in memory per arena root, with no digest-guarded skip — on a
   candidate already red at 24 s against a 10 s cold budget. Load-time cost,
   not combat risk, but it must move off the transition before merge.
3. Everything else asked for checks out: no loosened/skipped tests, ratchet
   exact at 37,100/37,100, proxy normal fix is correct with the mirror path
   still green, and the stale "chunked driver" comment needs one correction.

Cold-path cost: ~2452 ms at src/legacy-main.ts:4424 (via src/rendering/lighting/sh-l2-irradiance-runtime.ts:112-118).

## Check 1 — bake placement and pipeline tripwire

CPU-side confirmed. `bakeShL2Volume` (`src/rendering/lighting/sh-l2-irradiance.ts:635`)
is pure CPU: `Float32Array` coefficients, `intersectScene`/`occluded` raycasts
against the analytic proxy, deterministic seeded RNG. No GPU allocation in the
bake; GPU upload is the separate `uploadShL2Volume` into preallocated RGBA16F
`Data3DTexture`s (`src/rendering/lighting/sh-l2-irradiance-node.ts:155-172`).

Tripwire 0 confirmed. The pipeline-budget test pins 7 pre-existing pipelines
plus zero from the shared entry and the feature row
(`src/rendering/lighting/nuketown2-sh-l2-pipeline-budget.test.ts:8-22`), and
the shared graph is a zero-pipeline traversal entry
(`src/rendering/lighting/indirect-term.test.ts:44-54`). The off switch is two
uniform writes (`setEnabled`/`setStrength`,
`src/rendering/lighting/sh-l2-irradiance-node.ts:276-283`); `setVolume`
re-uploads into the same texture objects and throws on dimension change rather
than rebuilding (`:284-295`).

FINDING 1 (the required fix) — synchronous bake on the cold transition.
`src/legacy-main.ts:4424`, inside `configurePlayableArenaVisuals`:

```ts
if (arenaId === NUKETOWN2_ARENA_ID) configureNuketown2ShL2ForArena(root, ...);
```

That calls `runtime.bake(input)` →
`bakeShL2Volume({..., raysPerProbe: 128, bounces: 1, ...})`
(`src/rendering/lighting/sh-l2-irradiance-runtime.ts:107-122`), single-shot
synchronous. The REPORT's own table gives 969 ms at 48 rays / 2452 ms at 128
rays; the runtime always takes the 128-ray path, so the first cold transition
pays ~2.4 s. The only skip is in-memory
(`!volume || lastCondition !== nextCondition`, `:107`) behind a per-root
`WeakMap` (`:99`); there is no persistent digest-guarded cache, so a cold
start never skips. The header comment on `bakeShL2Volume`
(`src/rendering/lighting/sh-l2-irradiance.ts:630-634`) claims "the chunked,
budgeted driver … lives in `sh-l2-irradiance-runtime.ts`, which calls
`bakeShL2Probe` directly" — the runtime actually calls the whole-volume
`bakeShL2Volume`. Stale comment, and it matters: a reader believes the fence
is chunked when it is single-shot.

Smallest fix (either; do not do both silently): (a) move the bake to menu-time
or a background chunked driver that resumes per `bakeShL2Probe`
(`src/rendering/lighting/sh-l2-irradiance.ts:690`) across frames behind the
existing loading fence, keyed on the existing `shL2Digest` so an unchanged
condition skips the bake; or (b) run the transition bake at the measured LOW
preset (48 rays, ~969 ms) and reserve 128-ray HIGH for a menu-time upgrade.
Also correct the `:630-634` comment to describe what the runtime does today.

## Check 2 — 24-factory fallback

24 conversions, zero remaining direct constructions in the four modules:
`git diff` adds `createNuketown2IndirectMaterial({` 24 times across facade (3),
interior (8), street (4), vehicle (9); `grep "new MeshStandardNodeMaterial"`
in those four files returns nothing. The structural test derives the roster
from source and asserts all 24 bodies contain the shared constructor and no
direct construction
(`src/rendering/lighting/indirect-term.test.ts:26-42`).

Fallback is exactly zero behind the frozen path. The node starts
`enabled = uniform(0)`, `strength = uniform(0)`, `bound = null`
(`src/rendering/lighting/sh-l2-irradiance-node.ts:216-219`), and the term ends
`.mul(enabled)` after a per-channel `min(..., maximumAdditive)` clamp
(`:268-271`), so unbound/disabled contributes nothing. The subclass calls
`super.indirectDiffuse(builder)` first, then `addAssign`s the SH term
(`src/rendering/lighting/indirect-term.ts:73-89`); controllers gate enable on
`Boolean(input.volume)` / `hasVolume` (`:57`, `:64`). CPU mirror agrees:
`evaluateIndirectTerm` returns `[0,0,0]` when disabled (`:103-115`). No NaN
path introduced: the only new arithmetic on the fallback path is multiply by
the zero uniform; `normalize` operates on the shading normal exactly as any
lit material does. No black risk beyond the pre-existing L1-clamp semantics,
which the dering guarantee preserves by construction (relative bar, §Check 3).

No finding. The "degrades to the L1 path" wording is loose in one respect:
disabled output is the frozen `PhysicalLightingModel` + `scene.environment`
path, i.e. what shipped before the lane, which is the correct fallback; L1
compatibility is a bake-level property (zeroed band 2 reconstructs L1
bit-for-bit, pinned at `src/rendering/lighting/sh-l2-irradiance.ts:833-853`),
not a runtime branch. That matches the REPORT's claim-state and is fine.

## Check 3 — SH constants, basis, packing

Quoted from source:

- L1 (unchanged, `src/rendering/lighting/baked-indirect.ts:262-266`):
  `SH_Y00 = 0.282095`, `SH_Y1 = 0.488603`, `SH_A0 = 3.141593` (= π),
  `SH_A1 = 2.094395` (= 2π/3). Standard.
- L2 (`src/rendering/lighting/sh-l2-irradiance.ts:124-137`):
  `SH_A2 = 0.785398` (= π/4, Ramamoorthi & Hanrahan), `SH_Y2_XY = 1.092548`,
  `SH_Y2_YZ = 1.092548`, `SH_Y2_ZZ = 0.315392`, `SH_Y2_XZ = 1.092548`,
  `SH_Y2_XXYY = 0.546274`. All match the standard real-SH constants
  (1.0925484306, 0.315391565, 0.546274215).
- Basis (`:168-179`): `(xy, yz, 3z²−1, xz, x²−y²)` with the above folds —
  correct real L2 ordering for the `(c4..c8)` slots.
- Evaluate (`:200-221`): `SH_A0·Y00·c0 + SH_A1·Y1·(y·c1 + z·c2 + x·c3) +
  SH_A2·Σbasis·c4..8`, all over π, `max(0,·)` at the clamped entry —
  identical convention to `evaluateShL1`, so zeroed band 2 is bit-compatible.
- Packing (`:775-803`) vs TSL read
  (`src/rendering/lighting/sh-l2-irradiance-node.ts:259-264`): fifteen L2
  floats channel-major across planes 3–6 plus one literal-zero pad; red reads
  `(p3.x,p3.y,p3.z,p3.w,p4.x)`, green `(p4.y,p4.z,p4.w,p5.x,p5.y)`, blue
  `(p5.z,p5.w,p6.x,p6.y,p6.z)` — exact match to the pack order, and
  `unpackShL2Probe` (`:806-826`) inverts it. The L1 planes stay
  `(L0,L1y,L1z,L1x)` per channel, byte-identical to the L1 lane's layout.

No finding on the maths. Dering guarantee is the sane relative bar (never more
negative than the same probe's unwindowed L1, any direction/channel), measured
0 demotions on the real bake; the absolute-non-negativity history is recorded
honestly in REPORT §2 rather than hidden.

## Check 4 — tests, fixtures, ratchet

- No skips/loosening found: regex scan of the `src`/`scripts` diff for
  `describe/it/test … skip|todo|only` returns zero hits;
  `git diff --check` is clean.
- `src/graphics-profile-contract.test.ts`: four control-set hashes
  re-fingerprinted (performance/balanced/high/max). Expected — a new control
  changes the set hash — and the hunk cites the tripwire procedure. Not a
  loosening.
- `src/graphics-settings-registry.test.ts` + `src/graphics-settings-registry.ts`:
  additive only — new `shL2Irradiance` select control (`applyMode: 'live'`,
  consumer `sh-l2-irradiance`), profile matrix Off/Low/Low/High, registry
  assertions extended. Not a loosening.
- `src/rendering/raytracing/analytic-proxy-scene.ts`: shared box intersector
  now publishes outward geometric normals; the diffuse consumer defensively
  accepts either convention
  (`src/rendering/lighting/sh-l2-irradiance.ts:607-615`), and the mirror
  reflection suite (`whitted-tracer.test.ts`, 65/65 per REPORT) stays green
  because reflection is sign-symmetric. Correct fix direction; the silent
  pure-sky failure mode it replaces is documented as a gotcha in REPORT §5.
- Ratchet respected: `LINE_CEILING = 37_100`
  (`src/legacy-main-size-ratchet.test.ts:78`), current
  `src/legacy-main.ts` newline count exactly 37,100. The presentation-branch
  move into `updateNuketown2Presentation` (`src/legacy-main.ts:31265`) plus the
  two-line bake/tier hook is what keeps it exact.
- Preflight stays `[OPEN]` for branch-convention reasons (uppercase harness
  slug; intentional `.../claude/...` prefix), recorded as handoff caveat, not
  claimed. Correct to leave open.

FINDING 2 (minor, docs): fix the stale chunked-driver comment at
`src/rendering/lighting/sh-l2-irradiance.ts:630-634` as part of Finding 1 —
it currently describes a per-probe driver the runtime does not implement.

## Check 5 — capture evidence

Real files, and they support the claim. `capture-2026-09-05/manifest.json`
(schema `sh-l2-review-capture/1`) records installed-Chrome headless,
`PASS73_NATIVE_WEBGPU=1`, route quality/`blender`, displayed `high`, fixed
`42000 ms`, seed `83031`, active-match receipts per shot, and the same volume
digest `9ef414ef` at strength `0.000` (off) vs `0.550` (high) for both scenes;
all four PNGs exist on disk. The REPORT's deltas (interior 32.97/255,
exterior 29.34/255, warmer/brighter room response, lifted occluded faces with
sun contrast preserved) are plausible for an additive clamped bounce term and
are explicitly diagnostic, not visual acceptance. The older
`capture-2026-09-04/` pair is correctly retained as failure evidence only
(pre-repair `mul is not a function`, both states resolving to Low) with its
deltas disclaimed. No borrowed or fabricated asset.

## Findings index

| # | File:line | Why | Smallest fix |
|---|---|---|---|
| 1 | `src/legacy-main.ts:4424` via `src/rendering/lighting/sh-l2-irradiance-runtime.ts:107-122` | Synchronous 128-ray (~2.4 s) bake on the Nuke Town cold transition, memory-only cache; candidate already 24 s vs 10 s budget | Bake menu-time/background chunked per `bakeShL2Probe` with digest skip, or transition at 48-ray LOW; fix stale comment at `src/rendering/lighting/sh-l2-irradiance.ts:630-634` |
| 2 | `src/rendering/lighting/sh-l2-irradiance.ts:630-634` | Comment claims a chunked driver calling `bakeShL2Probe`; runtime calls single-shot `bakeShL2Volume` | Reword to current behavior when fixing #1 |

No other findings. SHIP-WITH-FIXES on the strength of correct maths, safe
fallback, zero pipeline delta, exact ratchet, and honest evidence — held only
by the cold-transition bake placement.
