# PASS 95 — FARCRYSIS slice 2

**Lane:** FARCRYSIS (implementation). **Agent:** Muse Spark 1.3 (OMP, dave-gaming-pc).
**Worktree:** `C:/Users/david/projects/aa-muse-farcrysis` (new, isolated).
**Branch:** `contrib/dave-gaming-pc/claude/farcrysis-slice-2`, cut from
`origin/contrib/dave-gaming-pc/claude/farcrysis-rework` @ `d9395579` (slice-1 head).
**Plan:** `docs/research/2026-09-04/FARCRYSIS-rework-plan.md` on
`origin/contrib/dave-gaming-pc/claude/research-2026-09-04` (read in full via
`git show`; 505 lines). **Brief:** frozen at `docs/farcrysis-rework/BRIEF.md` (untouched).
**Commit:** `19d6f2cf` (explicit paths only, pushed to origin).

**Card state: PARKED.** `selectable: false` untouched. Nothing here admits the card.

**Claim-state key.** `VERIFIED` = ran the command or read the file in this session and
quote what it said. `DESIGNED` = true by construction, needs a pixel capture to promote.
`OPEN` = named as unknown.

## 1. Slice-2 scope note (honest ambiguity, then the bounded cut)

The task brief says "implement the plan's slice 2 exactly as written". The plan itself
names no "slice 2" (grep for `slice` in both the FARCRYSIS and RAID plans returns zero
hits — `VERIFIED`). Slice 1 (on this branch, `87acde4f` + `d9395579`) landed Phase-2
lever 1 as a collapse pass (198→168) plus the detail-rock vertex-color family (−10), and
its REPORT §5.1 names the next structural mass: 65 `farcrysis-vege-*` layers plus 83 node
materials, closable "with per-instance tint on a shared family material". The full
vegetation share needs pixel captures this lane is forbidden (no browsers, no GPU — owner
running ComfyUI). So slice 2 takes the same idiom slice 1 proved, applied to the one
family that is exactly tint-only and CPU-verifiable: the three art boulder scatters.

## 2. What changed (2 files, nothing else)

- `src/farcrysis-art.ts` — the three boulder sets (`farcrysis-cliff-rocks` 28,
  `farcrysis-interior-boulders` 12, `farcrysis-shore-boulders` 8; tints `0x716b60` /
  `0x7a7268` / `0x6d655c`, roughness 0.92, metalness 0.04, same `terrain` ground maps)
  now share ONE white `vertexColors: true` representative; each set's tint is baked into
  its own cloned geometry (`tintedBoulderGeometry(hex)`). Shade lift never matched these
  names (emissive `000000` on all three — `VERIFIED` by dump and by reading
  `applyFarcrysisShadeLift`), the ground maps classify identically, and `vertexColors`
  Standard is already in the coverage draw via the slice-1 detail rocks — **no new
  pipeline**. Counts unchanged, so prop ceilings hold.
- `src/farcrysis-material-vocabulary.test.ts` — ratchet `168 → 166` with a
  `CEILING_HISTORY` entry. Growth reds it; removal never fails.

Explicitly untouched: `src/legacy-main.ts` (size ratchet), every `nuketown2`/`raid2` file,
all 25 pre-existing farcrysis tests (none weakened, none deleted), the publish script.

## 3. Gates (quoted)

| # | Gate | Result |
|---|---|---|
| G1 | `npx tsc --noEmit` | `TSC_EXIT:0`, no output — **VERIFIED** |
| G2 | farcrysis unit set + parity + graphics profile | `Test Files 28 passed (28)` / `Tests 196 passed (196)` — **VERIFIED** (includes `mkdir -p artifacts` first for the two pre-existing `artifacts/`-writing diagnostics noted in the slice-1 report) |
| G3 | `src/farcrysis-webgpu-pipeline-budget.test.ts` (unchanged) | green inside `Test Files 3 passed (3)` / `Tests 12 passed (12)` with vocabulary + legacy-main ratchet — **VERIFIED** |
| G4 | `src/farcrysis-material-vocabulary.test.ts` | same 3-file run green at ceiling 166 — **VERIFIED** |
| G5 | `src/farcrysis-boot-cost.test.ts` | green inside the 28-file run (digests unchanged — no boot change) — **VERIFIED** |
| coplanar | `npx tsx scripts/qa/find-coplanar-pairs.ts \| grep -ci farcrysis` | `0` — **VERIFIED** (only `FENCED` nuketown2 decal rows; exit 0) |
| census | `farcrysisMaterialCensus` over `buildFarcrysis` | tsx env `{"meshes":989,"materials":165,"standardMaterials":64,"nodeMaterials":83,"otherMaterials":18}`; second collapse pass `collapsed=0` (fixed point) — **VERIFIED**; vitest env 166 (ratchet green at 166) |
| three | `package.json` | `0.185.1`, matches `AGENTS.md` — **VERIFIED**. No upstream API adopted, so points 1–3 of the source-priority rule required no lookup; no recipe owed. |

## 4. Claim states

- **VERIFIED:** −2 material objects (167→165 tsx / 168→166 unit), zero behavior change by
  construction (white × old tint == old tint; `new THREE.Color(hex)` is already linear),
  fixed-point collapse, all CPU gates green, branch pushed, tree clean.
- **DESIGNED (needs a capture):** pixel identity of the three boulder sets. The math is
  exact, but no headless capture was taken (task forbids browsers/GPU while ComfyUI runs).
- **OPEN:** the 110 parity target (166 today); G6 frame time, G7 admission evidence, G9
  stock-flags boot, G10 solo 60 s, G11 traversal/eye, G14 critic, G15 readability, G16
  cross-arena diff, G17 HITL — none run this slice per the no-GPU rule; the vegetation
  share (65 layers + 83 node materials) remains the next slice.

## 5. Reproduce

```
cd C:\Users\david\projects\aa-muse-farcrysis
npx tsc --noEmit
mkdir -p artifacts
npx vitest run src/farcrysis*.test.ts src/collider-visual-parity-gate.test.ts src/graphics-profile-contract.test.ts
npx vitest run src/farcrysis-material-vocabulary.test.ts src/farcrysis-webgpu-pipeline-budget.test.ts src/legacy-main-size-ratchet.test.ts
npx tsx scripts/qa/find-coplanar-pairs.ts
git status -sb
```

## Luna review TODOs

- TODO: resolve the standing material rule before shipment. The new boulder
  tint is carried by cloned geometry vertex-color attributes, not explicit
  uniforms; either use the repository-approved uniform route or obtain a
  written exception tied to this exact consolidation.
- TODO: rerun the complete named gate set from a stable, uncontended worktree;
  this review's typecheck and expanded Vitest runs exceeded their bounded
  windows under machine contention. No product failure is inferred from the
  timeouts.
- TODO: capture exact-SHA WebGPU boulder parity/frame evidence when the
  no-browser/no-GPU review restriction is lifted.

## Blocking findings fixed (Luna review response, 2026-09-04)

**Claim-state key.** Same as §1: `VERIFIED` = ran the command or read the file in this
session and quote what it said. `OPEN` = named as unknown.

- **BLOCKING 1 — boulder tint off geometry attributes, onto the approved per-instance
  path: FIXED — VERIFIED.** `src/farcrysis-art.ts`: the three boulder sets
  (`farcrysis-cliff-rocks` 28 / `farcrysis-interior-boulders` 12 / `farcrysis-shore-boulders` 8)
  now share ONE boulder geometry and ONE white `MeshStandardMaterial`
  (`vertexColors: false`, roughness 0.92, metalness 0.04, same `terrain` ground maps); each set's
  tint (`0x716b60` / `0x7a7268` / `0x6d655c`) is written per instance with `setColorAt` — the
  `varyInstanceColors` / grass-tint idiom, i.e. the "one material per family with per-instance
  tint" reauthoring `src/farcrysis-material-vocabulary.ts` names. No cloned geometries, no `color`
  attributes. White x old tint == old tint (`new THREE.Color(hex)` already holds linear values).
  Standard+instanceColor is already in the coverage draw via the palms/vegetation — no new
  pipeline. Counts unchanged: tsx census `{"meshes":989,"materials":165,"standardMaterials":64,
  "nodeMaterials":83,"otherMaterials":18}`, second collapse `collapsed=0` (fixed point holds).
  Regression pin added in `src/farcrysis-square-shore.test.ts` (one shared material, one shared
  geometry, `vertexColors === false`, no `color` attribute, per-instance tint values per set).
  `CEILING_HISTORY` latest entry reworded to the instanceColor mechanism; ceiling stays 166
  (number untouched — no threshold weakened, no assertion deleted).
- **OPEN 2 — gates not independently completed: CLOSED — VERIFIED.** Re-ran every named gate
  from this worktree with explicit file lists (the quoted `"src/farcrysis*.test.ts"` glob expands
  to 2 files / 20 tests on Windows/Vitest — reproduced here, so the full set is passed
  explicitly): `npx tsc --noEmit` → `TSC_EXIT:0`, no output; explicit 28-file Vitest set →
  `Test Files 28 passed (28)` / `Tests 197 passed (197)` (196 + the new pin); budget + boot +
  legacy-main ratchet 3-file run → `Test Files 3 passed (3)` / `Tests 9 passed (9)`;
  `npx tsx scripts/qa/find-coplanar-pairs.ts | grep -ci farcrysis` → `0` (no farcrysis pairs;
  grep exits 1 on zero matches — the count is the result); `git status -sb` clean except the
  three intent files below.
- **OPEN 3 — visual/runtime evidence absent: still OPEN (no-browser/no-GPU rule in force).**
  Pixel identity of the three boulder sets remains `DESIGNED` (exact by construction: white
  material x per-instance old tint == old per-set draw); exact-SHA WebGPU parity/frame evidence
  still TODO when the restriction lifts — see the Luna TODOs above, unchanged.
