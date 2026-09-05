# PASS 94 HITL 6 candidate6 integration report

Measured 2026-09-05 on `dave-gaming-pc`, branch `contrib/dave-gaming-pc/claude/pass93-candidate`.

Claim-state convention: `[VERIFIED]` is directly observed in this run; `[CLAIMED]` is lane or owner evidence not re-run here; `[OPEN]` is unresolved.

## Outcome

- `[VERIFIED]` Started from the existing PASS 94 candidate head `465ae6b7` and did not re-roll the pass stamp. Runtime evidence was built from the integrated source committed at `97de2ecd`; the report/manifest pin is then amended only for provenance bookkeeping.
- `[VERIFIED]` PASS 94 remains unpublished. No publish command or Pages mutation was run.
- `[OPEN]` Candidate6 is not release-ready: the required multiplayer soak script is absent, the extended audit still reports critical/high multiplayer defects, full Vitest has three failures, the stock boot aggregate has one timeout, and the bot probe launcher returned exit `124`.
- `[VERIFIED]` The existing HITL5 server remains on `:4300`, PID `1608`. It was not stopped or replaced because the candidate was not gated and ready.
- `[VERIFIED]` The candidate preview used for perf and captures was isolated on `:4189`; it was stopped after evidence collection. No ComfyUI (`:8188`), Ollama, cockpit, or lane worktree process was touched.

## Integrated lane heads

`git fetch origin --prune` was run before the final ledger refresh.

| Lane | Remote head | Decision |
| --- | --- | --- |
| mp-bugs-hf498 | `833a693f6bf9b84c0a0409bda2c76ac3813f8f99` | `[VERIFIED]` merged first |
| mp-audit-hf504 | `16ad7ad0d8d620e80931ec04016f2ee6bc26904b` | `[VERIFIED]` merged immediately after mp-bugs; both reload/idempotency paths retained |
| mp-desync-hf499 | no remote ref | `[OPEN]` not pushed; its `qa:mp-soak` contribution was unavailable |
| hud-chat-hf500 | `8f0af40d728eda4829b83cbdafdbfc5f52dfaad0` | `[VERIFIED]` merged |
| perf-hitl5 | `7a888d6d272f46c87cc2961b84efe63812cf1aeb` | `[VERIFIED]` merged; small certain integration fixes retained |
| nuketown2-geometry-2 | `7a3ad7e0ef9c0ee21b5ff589dc8811365c8bccde` | `[VERIFIED]` merged as the requested superset |
| bots-hitl5 | `fd273881f6b120f4872410c42682f304397ed833` | `[VERIFIED]` merged with Muse corrections |
| nuke-event | `e34624289661e9d1eb8cc554163919bce02f3b69` | `[VERIFIED]` merged with Muse corrections |
| sound-design | `0b51c87da108239a1bab2baaee08effcdddf59f3` | `[VERIFIED]` merged with Muse corrections |
| vehicle-forge-2 | `8ba6afbe0cdea3c2b136ddbd7506e1c2a1812792` | `[VERIFIED]` merged |
| clustered-lighting | `34de42da80d31acf5499f6b5e288ac3b5a19ab01` | `[VERIFIED]` merged |
| gameplay-feel | `8b0b2db64149df5d6675f833ead4aa422cff97e8` | `[VERIFIED]` merged after its reported green gates |

`[VERIFIED]` The separate z-fight head `1458d039...`, turning-head head `0e393367...`, and rooflines head `a01c3494...` were not merged separately because geometry2 is the reviewed superset containing those changes. The layout fallback was not needed. `[OPEN]` thin-metal-perforation `df1326dd...` was left out due to the remaining gates and time box.

## Static and contract gates

`[OPEN]` Required `npm run pipeline:preflight -- --machine dave-gaming-pc --harness ...` could not produce a pass: the literal required harness value `Codex` failed harness validation, while lowercase `codex` failed the repository's pinned branch-name validation. No bypass or branch rewrite was used.

### TypeScript and coplanar audit

`[VERIFIED]` `npx tsc --noEmit` exited `0` with no diagnostics.

`[VERIFIED]` `npx tsx scripts/qa/find-coplanar-pairs.ts` emitted the required rows:

```text
# HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
# STREET pairs<=0.03m (offsets ignored): 0
# HF-497 SAME-MATERIAL-VISIBLE FINDINGS (both rendered, race visible, no offset): 0
# head 22955d49 · generated 2026-09-04T23:51:08.326Z
# boxes=950 · pairs<=0.03m: 288 · FINDINGS (different materials, no offset): 0 · FENCED (material offset): 274 · SAME-MATERIAL-VISIBLE: 0 · CONTACT: 4 · SAME-MATERIAL (benign): 10
```

The audit also reported 4 authored contact pairs, 4 collision-only slopes, and 101 unaudited non-box/instanced meshes; these are not required finding rows and were not relabelled.

### Vitest

`[VERIFIED]` Full `npx vitest run`:

```text
Test Files  3 failed | 612 passed | 1 skipped (616)
Tests       3 failed | 6143 passed | 2 skipped (6148)
Duration    82.31s
```

The three failures were:

- `[OPEN]` `src/gameplay-contract.test.ts` — checked pre-HITL candidate snapshot differs from the intentional gameplay-feel changes.
- `[OPEN]` `src/legacy-main-size-ratchet.test.ts` — `37630` lines exceeds the hard `37396` ceiling; the threshold was not raised.
- `[OPEN]` `src/pass65-release-foundation-evidence.test.ts` — exact released Pass 64 source `5075a52d80c6db69a97ed53acc2df5368728371` is not an ancestor of this pre-existing candidate history; no rebase/reroll was performed.

`[VERIFIED]` The focused post-fix contract run passed 9 files / 76 tests, including ballistics, walkable parity, pipeline budget, review cameras, screen topology, renderer inventory, settings inventory, weapon display names, and audio rotation. The required audio-only rerun also passed:

```text
Test Files  1 passed (1)
Tests       9 passed (9)
Duration    16.81s
```

## Browser gates

All browser runs used installed Chrome headless with `PASS73_NATIVE_WEBGPU=1` where applicable and were preceded by an RTX 5080 `nvidia-smi` sample.

`[OPEN]` Stock boot command `PASS73_NATIVE_WEBGPU=1 npm run qa:stock-boot` equivalent on `:4189` produced:

```text
Running 4 tests
ok launch args
ok WebGPU device
x nuketown2 live frame (2.2m): TimeoutError page.waitForFunction 120000ms
ok raid2 live frame (1.4m)
1 failed, 3 passed (4.0m)
```

`[VERIFIED]` Isolated cold Nuketown2 smoke then passed:

```text
Running 1 test
ok nuketown2 boots clean visible solo match (1.1m)
1 passed (1.2m)
```

The first card therefore booted arena id `nuketown2`; the additional arena exercised was `raid2`.

`[OPEN]` Bot presence probe on the candidate's own `:4189` returned shell exit `124` at its 180-second bound with no stdout. The refreshed evidence artifact contains `ok: true` rows for Nuketown2 (`4/4` active) and Raid2 (`2/2` active), but that artifact does not override the failed launcher result.

## Multiplayer headline

`[OPEN]` Required `npm run qa:mp-soak` could not execute:

```text
npm error Missing script: "qa:mp-soak"
```

The required `scripts/qa/mp-soak-gate.mjs` was not present because `mp-desync-hf499` had no remote ref. Consequently, the soak table has no executed assertions and cannot be called green.

`[VERIFIED]` The available unextended three-peer audit ran host + two guests on WebGPU at ports `4198/4199` and completed with 15 findings (12 high, 3 critical); its state diff had one position divergence in 12 samples.

`[VERIFIED]` The audit driver was minimally extended and rerun as `node scripts/qa/mp-audit.mjs --dist dist --port 4198 --peer-port 4199 --label hitl6-extended`. Its exact summary was:

```text
label=hitl6-extended arena=nuketown2 impairment=0ms/0ms completed=true
findings: 16 (high=13 critical=3)
state-diff divergences by field: {}
artifact: C:\Users\david\projects\aa-claude-hitl\artifacts\qa\mp-audit\hitl6-extended-audit.json
```

The extended assertions were:

| Assertion | Guest A | Guest B | Verdict |
| --- | --- | --- | --- |
| Post-death reload | `1 -> 30`, host `30` | `1 -> 30`, host `30` | `[VERIFIED]` pass for both |
| Host-rejected pickup observed | `hostRejected=true` | `hostRejected=true` | `[VERIFIED]` rejection observed, but pickup remained no-effect |
| Slow primary -> fast sidearm -> fire | `m14-ebr -> pistol`, ammo `15 -> 15` | `m14-ebr -> pistol`, ammo `15 -> 15` | `[OPEN]` failed for both; `SWAP-THEN-FIRE-NO-EFFECT` |
| Rejoin registration | failed | failed | `[OPEN]` `REJOIN-NOT-REGISTERED` |
| Cross-peer state diff | clean in extended run | clean in extended run | `[VERIFIED]` no field divergence in this run |

The five named fixes are therefore not all proven fixed: R-1 passed the explicit post-death reload check; W-1 remained red; P-1 only showed a rejection and no successful recovery proof; L-5/L-6 remained red through lobby/rejoin findings. The extended run’s other findings were `LOBBY-START-EARLY`, two critical `PICKUP-NO-EFFECT` rows, repeated `SWAP-NOT-REPLICATED` rows, and two `RELAY-GAP` rows.

## Perf rung

`[VERIFIED]` `scripts/qa/perf-hitl5-bisect-cdp.mjs --dist dist --port 4189` ran at 2560×1440 with installed Chrome headless, native WebGPU, and a real NVIDIA adapter at both requested poses. Each row reported `pipes+0` in the sampled window.

| Build / pose | FPS | p50 ms | p95 ms | p99 ms | draws | triangles | JS busy ms/frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| candidate6 spawn baseline | 57.6 | 17.2 | 31.4 | 33.2 | 171.4 | 339,218 | 14.45 |
| candidate6 street baseline | 60.3 | 16.1 | 31.0 | 33.0 | 131.3 | 325,911 | 13.63 |
| CLAIMED candidate5 spawn baseline | 51.0 | 18.9 | 38.2 | 44.3 | 228.6 | 392k | 15.51 |
| CLAIMED PASS 93 live | 67–79 | 12.3–13.8 | 15.5–22.9 | 29–38 | 125 | 271k | — |

`[OPEN]` The spawn `baseline-again` drift rung was an observed outlier at 14.2 FPS / p50 18.6 ms / p95 28.2 ms / p99 33.0 ms with 113.4 draws; it is retained in the perf JSON rather than hidden or used as a favorable average.

## Visual evidence

`[VERIFIED]` The six-station Nuketown2 capture command passed:

```text
[viewpoint-capture] backend=webgpu renderer=webgpu adapter={"gpu":true,"adapter":true,"device":true,"vendor":"nvidia","architecture":"blackwell"}
[viewpoint-capture] nuketown2          OK 6/6 (subset) shots 71052 ms
```

Stations were `nuketown2-overhead`, `nuketown2-north-yard`, `nuketown2-garage`, `nuketown2-nuke-street` (nuke-cloud station), `nuketown2-vehicle-near` (vehicles station), and `nuketown2-street-centre`. Their PNGs and manifest are under `docs/evidence/pass94/candidate6/nuketown2/nuketown2/`.

`[VERIFIED]` The minimap retry used a direct animated-canvas bounding-box clip and passed:

```text
{"verdict":"PASS","backend":"webgpu","arena":"nuketown2","minimapBox":{"x":1055.024658203125,"y":25.625473022460938,"width":198,"height":198},"output":"docs/evidence/pass94/candidate6/nuketown2/minimap-solo-nuketown2.png"}
```

The first locator-screenshot attempt timed out waiting for the live canvas to stabilize; the retry is the valid capture evidence.

## Left out / release handling

- `[OPEN]` `mp-desync-hf499` and its soak gate were unavailable because the branch was not pushed.
- `[VERIFIED]` Geometry2 was used instead of separately merging z-fight, turning-head, rooflines, or the layout fallback; it is the reviewed superset selected by the routing instruction.
- `[OPEN]` Thin-metal-perforation was not taken because the multiplayer/static/browser gates were already red and the time box was reached.
- `[VERIFIED]` No threshold, fence, timeout, size ceiling, or pipeline budget was widened. The 12-second WebGPU fence and zero in-combat pipeline tripwire remain unchanged.
- `[OPEN]` No candidate6 service was installed on `:4300`; PID `1608` still serves HITL5. PASS 95 publication remains pending owner play/HITL and the new multiplayer soak gate.
