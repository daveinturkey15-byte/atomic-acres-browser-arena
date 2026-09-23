# Lane I — the approved-look question (brief "Decision rule" + Job 2)

The lane's other document answers the owner's stated invariant, "map 1 must
light like map 2", by comparing the two **load paths**. This one answers the
brief's second question, which path parity cannot touch:

> compare against the approved PASS 81 art captures where they exist
> (`artifacts/qa/artstyle-overhaul/` …) … Where an arena's luminance moved more
> than ~1% from its approved look, re-tune that arena's grade/metalness
> constants … until it is back, with the before/after numbers.

After the 2026-08-31 environment fix **both** load paths sit at the same value,
so "the two paths agree" says nothing about whether that value is the one the
owner approved. This is the separate check.

**Answer: no arena moved off its approved look, and that is now shown rather
than asserted.** The build the owner approved as PASS 81 already contained the
environment fix, and no authored grade or environment constant changed between
that head and PASS 84's. The re-tune list Job 2 asks for is empty for a
checkable reason, not for want of looking. Everything below carries its
claim-state.

## 1. The comparison the brief names is not available (VERIFIED)

- **`artifacts/qa/artstyle-overhaul/` does not exist in this worktree.**
  `artifacts/qa/` here holds only `ibl/`. The only copies on this machine are
  `C:\Users\david\projects\atomic-acres-highseas\artifacts\qa\artstyle-overhaul`
  (a worktree the PASS 84 takeover record says not to revive) and a
  2026-08-23 backup tree. Both are the **same 2026-08-23 Lane L artstyle
  overhaul** captures, not PASS 81: `capture-artstyle.mjs` boots each arena
  solo and screenshots the live frame at the spawn view — no authored review
  camera, no pinned visual clock, no seed, and farcrysis timed out
  (`before/capture-receipt.json`). Four "after" PNGs, nine passes older than
  PASS 81. Nothing there can resolve a ±1% luminance question.
- **The live `pass81` channel is gone.** Checked 2026-09-02 on
  `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/…`:
  `pass81 → 404`, `pass82 → 404`, `recent-stable → 404`, `the-big-one → 404`,
  `pass72-retained → 404`; `pass83 → 200`, `pass84 → 200`. That is the PASS 84
  publish at 15:16 BST doing exactly what the owner's HF-400 two-channel policy
  told it to. So the approved build cannot be re-rendered from the live site,
  and `pass83` is not a substitute: it already contains the fix (see below).

## 2. PASS 81 shipped *with* the environment fix (VERIFIED)

The write-up's warning — "turning it on is a visual change to eight
owner-approved arenas" — was written on 2026-08-31 **before** the fix landed
that same day, and it is about the arenas as approved at that moment. What
happened next settles the question:

| fact | evidence |
|---|---|
| the environment fix is commit `02d9058f` | `2026-08-31 12:56:22 +0100`, "fix: environment lighting never worked …"; `git log -S'applyArenaEnvironment('` on `src/rendering/pass64-tsl-scene.ts` returns exactly this commit |
| PASS 81's head `b138b9c0` **contains** it | `git merge-base --is-ancestor 02d9058f b138b9c0` → true; `b138b9c0` is `2026-08-31 19:13:19 +0100`, six hours later |
| so does PASS 83's head `e046c130` and PASS 84's base `75a4e508` | same check, both true |

So every build the owner has played since the evening of 2026-08-31 — PASS 81,
82, 83 and 84 — rendered with the environment applied. The brightened look
*is* the approved look, on three days of play and eighteen owner-feedback rows
(HF-395…HF-413), none of which says the game got brighter.

## 3. Nothing moved between PASS 81's head and PASS 84's base (VERIFIED)

`git diff b138b9c0 75a4e508` over the files Job 2 names:

| file | change |
|---|---|
| `src/rendering/art-direction.ts` | +50 lines, **additive**: one new `'map3'` entry. No existing arena's CDL, saturation, contrast, split tone, vignette, bloom or atmosphere colours touched. |
| `src/graphics-refinement.ts` | +7 lines, **additive**: `map3` shadow volume and `map3: 0.18` in `ARENA_ENVIRONMENT_SCALES`. Every other arena's environment scale unchanged. |
| `src/rendering/pass64-tsl-scene.ts` | +8 lines, **additive**: `map3` atmosphere layout. |
| `src/test-maps-art.ts` | **not in the diff at all** — the `metalness` constants the write-up flagged as the blocking coupling are byte-identical to PASS 81's. |
| `src/rendering/arena-environment-ibl.ts` | **not in the diff at all.** |

Scope of this claim, stated precisely: it covers the authored grade and
environment constants, not the whole tree. Two render-adjacent files did move
and neither changes an arena's authored colour — `src/farcrysis-art.ts` (+9/−4,
swapping `new THREE.InstancedMesh` for Lane C's `farcrysisInstancedMesh`
helper, no colour or material value changed; farcrysis is hidden) and
`src/particles/particle-catalog.ts` / `src/arena-ambient-events.ts` /
`src/rendering/arena-visual-stream.ts` (+24 lines total, map3 registrations).

## 4. What the environment is worth today, per arena (VERIFIED, measured)

Job 2 wants numbers, so here are the ones that matter if the owner ever *does*
ask for the pre-fix look back: what each arena would have to give back.

Method: on the shipped build, on the same parked frame, `scene.environment` is
set to `null` and `environmentIntensity` to `1` — **exactly** the state every
arena presented before 2026-08-31 (null on the first arena of a page; non-null
but carrying no light on later arenas, because the PMREM was built with the
WebGL generator against a `WebGPURenderer`: driving intensity to 20 moved mean
luminance by 0.0000). Camera, visual clock, seed, exposure, grade, geometry and
materials are all held, so the difference **is** the environment. Suppression
and restore are both read back off the scene, not assumed.

Run: `scripts/qa/probe-ibl-environment-contribution.mjs`, headless installed
Chrome, hardware WebGPU, 1280×720, seed `iblparity`, `previewTime=0`, viewmodel
hidden, bots frozen before the settle, ComfyUI idle/absent and 12.4–14.8 GB GPU
free, git sha `bf92195d` (runtime-identical to base `75a4e508`: this branch
changes no build input). Reports:
`environment-contribution-pass85e-{a,b,c}.json`. No arena was invalidated.

| arena | review camera | suppressed (pre-fix look) | shipped | delta | luminance floor | pixels moved | pixels floor | environment |
|---|---|---|---|---|---|---|---|---|
| atomic-acres | nuke-town-overview | 0.172 | 0.179 | +4.07% | 0.01% | 20.7% | 1.2% | atomic-acres-256 @0.24 |
| atomic-acres | nuke-town-plan | 0.1176 | 0.1245 | +5.85% | 0.01% | 20.8% | 0.6% | atomic-acres-256 @0.24 |
| skyline-terminal | terminal-overview | 0.2926 | 0.2966 | +1.38% | 0% | 9.4% | 0% | skyline-terminal-256 @0.22 |
| skyline-terminal | terminal-cabin-ceiling | 0.1095 | 0.1744 | **+59.32%** | 0.01% | 94.3% | 0% | skyline-terminal-256 @0.22 |
| rustworks-1v1 | rustrig-overview | 0.0423 | 0.0425 | +0.44% | 0.01% | 0% | 0% | rustworks-1v1-256 @0.14 |
| rustworks-1v1 | rustrig-tower-support | 0.044 | 0.0442 | +0.4% | 0.02% | 0.1% | 0% | rustworks-1v1-256 @0.14 |
| gun-range | gun-range-overview | 0.0726 | 0.0673 | −7.36% | 2.24% | 11.3% | 5.2% | gun-range-256 @0.1 |
| gun-range | gun-range-armory-support | 0.0626 | 0.0693 | +10.65% | 6.56% | 13.6% | 10.1% | gun-range-256 @0.1 |
| high-seas | high-seas-starboard-overview | 0.3219 | 0.3373 | +4.79% | 0.01% | 33.4% | 0% | high-seas-256 @0.2 |
| high-seas | high-seas-stern-main-deck | 0.2871 | 0.333 | +16.01% | 0.01% | 75.5% | 0% | high-seas-256 @0.2 |
| test1 | test1-tower-overview | 0.236 | 0.2464 | +4.44% | 0.01% | 38.7% | 0.1% | test1-256 @0.16 |
| test1 | test1-firing-line | 0.1964 | 0.2056 | +4.72% | 0.01% | 38.8% | 0% | test1-256 @0.16 |
| test2 | test2-estate-overview | 0.2236 | 0.2457 | +9.89% | 0.01% | 56.8% | 0% | test2-256 @0.22 |
| test2 | test2-pool-lane | 0.2956 | 0.322 | +8.93% | 0.01% | 67.5% | 0% | test2-256 @0.22 |
| map3 | map3-hub-vista | 0.2727 | 0.2791 | +2.36% | 0.01% | 20.8% | 0% | map3-256 @0.18 |
| map3 | map3-bay-nature | 0.1858 | 0.1924 | +3.56% | 0% | 17.6% | 0% | map3-256 @0.18 |
| farcrysis | farcrysis-beach-golden | 0.2859 | 0.2943 | +2.93% | 0.01% | 33.5% | 0% | farcrysis-256 @0.18 |
| farcrysis | farcrysis-jungle-dapple | 0.1619 | 0.1717 | +6.06% | 0.01% | 47.2% | 0% | farcrysis-256 @0.18 |

Frames, halved: `atomic-acres-nuke-town-overview-shipped.png` against
`…-environment-suppressed.png`, and the strongest case,
`skyline-terminal-cabin-ceiling-shipped.png` against its suppressed pair.

Three things worth reading off this table:

- **It reproduces the 2026-08-31 headed measurement on a different day, a
  different seed and a headless browser.** atomic-acres +4.24%/+6.03% then,
  +4.07%/+5.85% now; high-seas starboard +4.78% then, +4.79% now; test1
  +4.38…+5.63% then, +4.44%/+4.72% now; test2 +7.04…+8.90% then,
  +9.89%/+8.93% now. Two independent probes, same answer.
- **Interiors are where the environment does the work.** The terminal cabin
  ceiling is +59% and 94% of its pixels; the high-seas stern deck +16%. An
  enclosed volume has almost no other indirect light, which is precisely why
  the null-environment build read as "underlit" and started this bug.
- **gun-range is the one arena this method cannot resolve.** Its own temporal
  floors are 2.24%/5.2% and 6.56%/10.1% — the range is full of moving targets —
  so a −7.36% and a +10.65% on the same arena are inside the noise. gun-range
  needs a pinned review clock before any sub-10% claim about it means anything.
  (Note this is its **first-load** path, which works: the map-switch failure
  recorded in `README.md` does not block this measurement.)

## 5. Claim-states

| claim | state | why |
|---|---|---|
| The named `artifacts/qa/artstyle-overhaul/` comparison cannot be made in this worktree, and the live pass81 channel is 404 | **VERIFIED** | directory listing; HTTP status of all seven channel roots |
| PASS 81's shipped head contains the environment fix, so the approved look is the post-fix look | **VERIFIED** | `git merge-base --is-ancestor 02d9058f b138b9c0` |
| No existing arena's authored grade, environment scale, shadow volume or test-map metalness changed between PASS 81's head and PASS 84's base | **VERIFIED** | `git diff b138b9c0 75a4e508` over those files: additive map3 rows only |
| Brief Job 2's re-tune list is therefore empty | **VERIFIED** (follows from the two above) | no arena moved off approved, so nothing is >1% from it |
| The environment contributes +0.4% to +59% mean luminance depending on arena and camera | **VERIFIED** | the table above, per-camera floors, no invalidation |
| gun-range's contribution number | **OPEN** | inside its own 2.2–6.6% temporal floor; needs a pinned review clock |
| Owner 17:05 "lighting … feels a bit off" | **OPEN, not this lane's** | both load paths are identical and the arenas are at their PASS 81 look, so this is an art-direction judgement (HF-407/408), not a regression. What this lane can now hand the art lanes is the cost of a rollback, per arena, in the table above. This lane did not act on it. |
