# Atomic Acres PASS 94 candidate 7 morning report

Date: 2026-09-05 (06:00 integration window)
Runtime candidate SHA: `ae79572410f02639bb189622d34703b42425ce4d`
Branch: `contrib/dave-gaming-pc/claude/pass93-candidate`
Served: `http://127.0.0.1:4300/` from the gated `dist` for the owner test

Claim-state convention: `[VERIFIED]` means this integrator ran the check and
read its output; `[CLAIMED]` is lane evidence not rerun here; `[OPEN]` remains
unresolved. This is a candidate only. Nothing was published.

## Merge set

| Lane / branch head | Verdict and candidate-7 decision |
|---|---|
| `capture-harness-warmup` / `b3d2e5c8` | `[SHIP-WITH-FIXES]` lane review, but left out: its 11-line debug registry hook broke the unchanged `legacy-main.ts` size ratchet. The original capture runner remains available; final captures used the existing runner. |
| `mp-audit-hf504` / `16ad7ad0` | `[VERIFIED]` already present at HITL 6 head. |
| `mp-audit-todos` / `04bed66f` | `[VERIFIED]` already present at HITL 6 head. |
| `mp-rejoin` / `17ea58dd` | `[SHIP-WITH-FIXES]` lane report, then excluded: full-suite integration failed the teleport integration and size ratchet; its soak rejoin rows also remained red. Revert `2ad55e89`. |
| `mp-soak-gate` / `19744f1a` | `[VERIFIED]` already present and rerun below; required soak remains red on replication, rejoin damage, and stair fire. |
| `mp-desync-hf499` / `3e2fd273` | `[OPEN]` no usable contribution; killed/no commits. |
| `mp-diagnostics-overlay` / `7922e444` | `[SHIP-WITH-FIXES]` merged as `d00d963a`; diagnostics evidence and tests are in the candidate. |
| `gamepad-support` / `3374c50e` | `[SHIP-WITH-FIXES]` merged as `83a57a1d`; gamepad module/test evidence retained. |
| `nuketown2-breakable-windows` / `318ae345` | `[SHIP-WITH-FIXES]` merged as `f01fa5ca`; tests/docs only. |
| `taa-resolve` / `1f847b4b` | `[SHIP-WITH-FIXES]` lane report, but excluded: integration produced 16 full-Vitest failures including stale profile fingerprints/inventory, prewarm, renderer capability, and ratchet contracts. Revert `f597c6b6`. The +1.0 ms falsifier was not tripped lane-locally, but that does not override candidate integration failure. |
| `blind-ab-critic` / `a404ae2a` | `[SHIP-WITH-FIXES]` process/docs integrated separately as `f3e0c3bd`; no runtime TAA/CSM prototype was taken. |
| `mp-lobby-overhaul` / `8d8d1ef7` | `[SHIP-WITH-FIXES]` left out: old inline-renderer conflict with current authority-view implementation. |
| `mp-weapon-pickup` / `be991f8d` | `[DO-NOT-SHIP]` newest VERIFY; left out. |
| `nuketown2-accuracy-3` / `3a18728a` | `[SHIP-WITH-FIXES]` tried, then excluded: cold admission 44,816.7 ms plus fatal `THREE.AttributeNode: Vertex attribute "position" not found on geometry`; +12.703 s versus candidate 6. Revert `83188dda`. |
| `nuketown2-interiors-accuracy` / `e4ba6832` | `[SHIP-WITH-FIXES]` tried, then excluded: fatal `AttributeNode` cold path at 33,043.7 ms. Revert `a753a0d3`. |
| `perf-hitl5` / `7a888d6d` | `[VERIFIED]` already present at HITL 6 head; final candidate spawn/street rung rerun below. |
| `materials-albedo-variation` / `5db92f9e` | `[SHIP]` lane report, left out: fixed-harness captures showed global mean absolute delta about `60.867/255` at all 17 stations, global brightness/asphalt/vehicle shift rather than local 2–6% albedo variation. |
| `sh-l2-irradiance-volume` / `2c45818f` | `[OPEN]` no explicit newest SHIP/SHIP-WITH-FIXES verdict; not eligible. |
| `nuketown2-yardprops-graph-sharing` / `3ca7c70e` | `[SHIP-WITH-FIXES]` tried, then excluded: cold transition 29,250.1 ms, combined 29,875.2 ms, degraded admission and fatal `AttributeNode`; revert `7f45ee14`. |
| `load-time-remerge` / `0c28ad0e` | `[SHIP-WITH-FIXES]` tried, then excluded: cold transition 38,039.3 ms, combined 38,585.5 ms, degraded admission and fatal `AttributeNode`; revert `1b834f28`. |
| `skyline-ground-projected-env` / `f24a2565` | `[SHIP-WITH-FIXES]` left out: older renderer-control surface conflicts with the integrated authority controls; no safe lane-owned forward port in this window. |
| `raid2-slice-2` / `1c62b74f` | `[SHIP-WITH-FIXES]` left out: older large arena/release base and renderer/geometry ownership require a forward port plus a fresh cold budget measurement; not silently merged. |
| `farcrysis-slice-2` / `eabb24c0` | `[SHIP-WITH-FIXES]` left out for the same older-base/runtime-forward-port and cold-budget reason. |
| `ssr-temporal-denoise` / `90da85f0` | `[SHIP-WITH-FIXES]` left out: conflicts with current TAA/clustered profile authority; no safe resolution without dropping controls. |
| `volume-fire-emitters` / `dc2a3e7f` | `[SHIP-WITH-FIXES]` left out: older renderer-control surface; requires forward port and cold measurement. |
| `raid2-generator-building-detail` / `0226edfa` | `[SHIP-WITH-FIXES]` left out: large older-base geometry lane; requires forward port and cold measurement. |
| `transmission-glass-windows` / `827b5a04` | `[SHIP-WITH-FIXES]` left out: older Nuketown material-budget ownership; requires forward port and cold measurement. |
| `nuketown2-interior-look` / `5d66c200` | `[SHIP-WITH-FIXES]` left out: runtime visual lane requires forward port and cold measurement. |
| `skyline-terminal-look` / `2adf60a5` | `[SHIP-WITH-FIXES]` tried, then excluded: cold transition 37,618.2 ms, combined 38,130 ms, degraded admission and fatal `AttributeNode`; revert `60b2eba8`. |
| `all-arenas-air-and-coplanar` / `96819787` | `[OPEN]` no explicit newest SHIP/SHIP-WITH-FIXES verdict; not eligible. |
| `thin-metal-perforation` / `df1326dd` | `[OPEN]` no review verdict/report; left out. |
| `clustered-lighting` / `34de42da` | `[VERIFIED]` already present at HITL 6 head. |
| `lobby-countdown` / `91693326` | `[SHIP-WITH-FIXES]` left out: old inline-renderer conflict. |

The real Muse A/B note was also checked before look decisions: candidate 5
had the north-yard flatter-light regression, and both builds were faulted for
black asphalt/off-white vehicles. The albedo lane worsened exactly that global
relationship and was excluded; clustered lighting remains the candidate-6
baseline, while SH-L2 and the later look lanes were not safely integrated.

## Gates

`[VERIFIED]` `npx tsc --noEmit`: exit 0, no output.

`[VERIFIED]` `npx tsx scripts/qa/find-coplanar-pairs.ts --out artifacts/qa/candidate7-coplanar-final.txt`:

```text
HOUSE-INTERIOR pairs<=0.03m: 0
STREET pairs<=0.03m: 0
HF-497 SAME-MATERIAL-VISIBLE FINDINGS: 0
FINDINGS (different materials, no offset): 0
FENCED: 274 · CONTACT: 4 · SAME-MATERIAL (benign): 10
boxes=950 · pairs<=0.03m: 288
```

`[VERIFIED]` full `npx vitest run`:

```text
Test Files  621 passed | 1 skipped (622)
Tests       6243 passed | 2 skipped (6245)
Duration    121.22s
```

`[VERIFIED]` `npm run build` and the build inside `npm run qa:mp-soak` both
completed successfully. The final build transformed 568 modules and emitted
the `legacy-main-CO_TtT3v.js` bundle. `[VERIFIED]` identity guard:
`RELEASE IDENTITY OK: dist calls itself PASS 94, opens its notes on Pass 94,
ships no HITL string`.

`[VERIFIED]` stock boot, `PASS73_NATIVE_WEBGPU=1`, installed Chrome headless,
workers=1, unchanged stock flags: the first four-test chain passed launch,
WebGPU device, Raid2, and then Nuke Town retry passed in isolation. The first
chain was `3 passed, 1 failed`: Nuke Town reached the live-card path but hit
the preserved 12,002 ms queue fence (`687 fenced draws`); Raid2 passed. The
isolated Nuke Town retry was `1 passed` in 1.2 minutes. This is the known cold
fence condition, not a widened threshold.

`[VERIFIED]` bot probe on `:4189`, `probe-candidate7.json`: Nuke Town deployed
in 42,499 ms with requested/target/active bots `4/4/4`, first alive at 84 ms;
Skyline Terminal deployed in 46,152 ms with `1/1/1`, first alive at 77 ms;
both had zero page errors. The only warning was Chrome's informational
`powerPreference option is currently ignored ... on Windows`.

`[VERIFIED]` final cold admission (`PASS73_NATIVE_WEBGPU=1`):

```text
FAIL: cold transition 24065.5ms exceeded 10000ms
combined cold preparation work 24603.9ms exceeded preserved 10000ms budget
foreground admission degraded; no browser/GPU error
```

Candidate 6 measured 32,113.5 ms, so this is an improvement but remains a
publish blocker. No fence, timeout, budget, or assertion was changed.

`[VERIFIED]` `npm run qa:mp-soak` (ports 4194/4195; three headless peers; the
preserved 180 s duration, 120 ms RTT, 1% loss, 1.5 m bound and one-RTT damage
bound):

| Soak row | Result |
|---|---|
| duration | PASS, 180058 ms / 180000 required |
| replication | FAIL, 179 samples and 606 divergences |
| rejoin damage | FAIL, rejoin observed but `seenByEveryoneAfter=false`, latency null |
| reload after death | PASS |
| respawn reset | PASS |
| stair fire | FAIL, guestA false and guestB false |
| console clean | PASS, total 0 |
| scoreboard | PASS, agreement true |

The soak contract passed before the real run. The real soak is a release
blocker and the desync/rejoin findings remain OPEN.

`[VERIFIED]` perf rung at 2560x1440, installed Chrome/native WebGPU, high
profile, baseline, no pipeline creation in the sample:

| Build / pose | FPS | p50 ms | p95 ms | p99 ms | draws | triangles | JS busy ms/frame |
|---|---:|---:|---:|---:|---:|---:|---:|
| candidate 7 / spawn | 79.8 | 11.5 | 21.3 | 31.4 | 167.3 | 341,694 | 10.29 |
| candidate 7 / street | 98.6 | 9.4 | 14.4 | 17.0 | 115.1 | 309,117 | 8.12 |
| candidate 6 / spawn | 57.6 | 17.2 | 31.4 | 33.2 | 171.4 | 339,218 | 14.45 |
| candidate 6 / street | 60.3 | 16.1 | 31.0 | 33.0 | 131.3 | 325,911 | 13.63 |
| PASS 93 | `[CLAIMED]` 67–79 | `[CLAIMED]` 12.3–13.8 | `[CLAIMED]` 15.5–22.9 | `[CLAIMED]` 29–38 | `[CLAIMED]` 125 | `[CLAIMED]` 271k | — |

## Captures and blind A/B

`[VERIFIED]` Native-WebGPU capture manifests from the served candidate:

- Nuke Town: 18/18 passed (`nuketown2`, including the 12 authored review
  stations, `nuke-street`, and five vehicle stations), 117,418 ms.
- Raid2: 3/3 passed, 55,166 ms.
- Skyline Terminal: 3/3 passed, 66,118 ms.
- Fresh minimap clip: PASS, WebGPU, bounding box `{x:1044.169,y:12.134,
  width:220,height:285.000}`.

The authored capture time is fixed at 63,000 ms, so the review set includes
the deterministic dusk/time-of-day projection; there is no separate runtime
night/dusk station in the catalog. Clustered lighting was already in the
HITL-6 baseline. This limitation is OPEN rather than invented evidence.

`[VERIFIED]` `node scripts/loop/blind-ab.mjs` via OMP/Muse on the six stations
common to candidate 6 and candidate 7 (the candidate-6 directory has six
persisted stations):

```text
| Candidate | Wins | Ties | Invalid | Win rate (decisive, n=5) | Win rate (ties as half, n=6) |
| A: candidate6 | 2 | 1 | 0 | 40% | 41.7% |
| B: candidate7 | 3 | 1 | 0 | 60% | 58.3% |
```

Wilson 95% intervals were `11.8%–76.9%` for candidate 6 and
`23.1%–88.2%` for candidate 7; both include 50%, so this is VERIFIED but
underpowered for a decisive visual claim. All six probes matched; mean Muse
confidence was 0.8933.

## Morning recommendation

`[VERIFIED]` The owner should test the served :4300 candidate first in Nuke
Town solo: spawn, north yard, street, garage, the minimap, and one vehicle;
then test a three-peer multiplayer room specifically for replication after a
rejoin, post-rejoin damage visibility, weapon swap replication, and stair fire.
The soak table above is already red on those paths.

`[OPEN]` Do not publish PASS 95 tonight. The preserved cold-admission fence is
red at 24.0655 s, and the real soak has replication, rejoin-damage, and
stair-fire failures. The candidate is served for owner testing only.

