# Pass 75 — High Seas gauntlet ledger

Status: active local contribution audit
Branch: `contrib/dave-gaming-pc/codex/pass75-hijacked-yacht`
Initial Claude snapshot: `0d2010fda01331a95817ef25a135c3f319498764`
Exact rebased Claude Pass 74 base: `071468d2cbdf28a44e367b8b50b12b2a456896da`
Retained Pass 62 benchmark source: `249a7ee77dce761eb237f3eb0e0d0ea1d0356317`

This ledger separates inherited evidence, Pass 75 gains, regressions, unknowns,
and owner-only acceptance. A green assertion requires the recorded command or
artifact; prose and agent reports are not substitutes.

## Frozen loop

At most six propose → falsify → verify rounds or 180 wall-clock minutes,
whichever comes first. Each round owns one causal concern and reruns its focused
discriminator before broader retained gates. Thresholds, baselines, timeouts,
and release topology may not be weakened. The unapproved regression budget is
zero.

## Inherited baseline

| Gate | Exact command | Result | Interpretation |
| --- | --- | --- | --- |
| Focused integration baseline | `npx --yes npm@10.9.8 exec -- vitest run src/vertical-navigation.test.ts src/map-selection.test.ts src/rendering/arena-visual-definition.test.ts src/spawn-safety.test.ts src/private-match.test.ts src/last-multiplayer-diagnostic.test.ts src/ui/pass64-shell.test.ts src/ui/menu-preview-camera.test.ts src/ui/menu-preview-video.test.ts --reporter=dot` | 85/85 passed | Frozen before Pass 75 code integration. |
| Full unit baseline | `npx --yes npm@10.9.8 test -- --reporter=dot` | 2,858 passed, 2 skipped across 393 files | Frozen before Pass 75 code integration. Expected negative-path stderr occurred inside passing tests. |
| Retained Pass 65 preview production gate | `npx --yes npm@10.9.8 run qa:pass65:menu-previews` | Failed with 9 issues | Pre-existing Pass 74 evidence debt: Farcrysis changed the canonical/choreography dependency roster without regenerated immutable capture/provenance. Pass 75 must not weaken or misreport this gate. |

## Round ledger

| Round | Highest-severity conjecture | Falsifier | Change | Focused evidence | Retained regression evidence | State |
| ---: | --- | --- | --- | --- | --- | --- |
| 0 | Raised decks and a third elevation cannot work under hard-coded ground spawn probes and the retained two-band bot planner. | A raised spawn is rejected against ground-only cover; an engine bot cannot select engine→main→upper adjacent routes; overlapping stacked platforms snap to the wrong height. | Freeze `y=0/3.2/6.2`, isolate generic raised-spawn correction, and replace the binary planner with an authored level graph while preserving Skyline tiers. | After latest-base rebase and geometry integration, `src/high-seas.test.ts` + `src/vertical-navigation.test.ts`: 19/19 passed; TypeScript passed. | Full retained rerun pending systems integration. | Focused pass |
| 1 | Yacht presentation can disagree with movement, physics, shot, and portal authority, or a tapered-deck gap can expose the rectangular fail-safe floor. | Any substantial visible solid lacks matching authority; a declared portal intersects an opaque/shot/movement blocker; ordinary movement escapes onto unsupported water; or underwater movement crosses the world boundary. | Integrated an original procedural arena with aligned movement/physics/raycast/ballistic surfaces and explicit portal audits; replaced the implicit `y=0` global floor with an authored engine floor, lowered the High Seas fail-safe to `y=-6`, and extended world bounds beneath it. A guest-authority falsifier rejected client-only overboard death; visible 1.04 m rails now contain real controller sprint-jumps without invisible extensions. | 133 collider/physics authorities, 134 raycast/ballistic surfaces with one named floor exception, 16 zero-blocker portals, six bidirectional Rapier-verified vertical links, exact Rapier bow/underwater repros, and 12/12 High Seas containment tests passed. Broader physics/navigation/map/spawn set passed 72/72 with TypeScript green. | Host authority remains unchanged; no client-only death path or invisible tall barrier was retained. | Focused pass |
| 2 | Canonical map identity can be lost in lobby, persistence, diagnostics, or interactive-world envelopes. | `high-seas` is coerced to another arena, rejected on an authorized protocol path, or accepted by the Worker but rejected by the applied D1 table constraint. | Added a dependency-light six-ID authority and propagated it through selection, private lobby, interactive-world state, last diagnostics, and shared upload validation. Red team found the applied four-ID D1 `CHECK`; forward-only migration `0005` now rebuilds the table, preserves rows, and recreates indexes without editing `0004`. | Combined focused integration: 19 files / 162 tests passed and root TypeScript passed. Real `node:sqlite` migration test passed for retained rows, both indexes, all six canonical inserts, High Seas insert, and invalid-ID rejection; diagnostics suite 43/43, root TypeScript and Worker TypeScript passed. | Full retained rerun pending final containment/media integration. | Focused pass |
| 3 | Shared ocean, atmosphere, audio, support flight, or visual streaming can retain a stale arena or duplicate presentation root. | Wrong water body/emitters remain, stale generation attaches, or active roots exceed one after rapid switching. | Integrated selected-only High Seas visual streaming, an exclusive shared ocean at `y=-2.2` with a bounded theoretical wave envelope, arena-generation audio, atmosphere/graphics/flight definitions, raised spawn probes, and height-filtered bot collision views. Rebase resolution retains Claude's frozen CPU/GPU ocean spectrum, scales graphics overrides per body, disposes root and horizon resources on swaps, prevents duplicate Farcrysis presentation, and keeps its CPU swim authority. | Post-rebase water/TSL/grade union passed 36/36, sound union passed 109/109, and TypeScript passed at exact ancestry-corrected source. | Native WebGPU switching, stale-generation, audio disposal, and measured residency probes pending. | Focused pass |
| 4 | A selector card can exist without honest distinct local preview media or usable responsive controls. | Standby/borrowed/missing media is called complete, browsing constructs gameplay, or six-card controls clip at target viewports. | Added High Seas as the sixth canonical card with dynamic theatre-count copy and an explicit no-network `PREVIEW STANDBY` state. A separate Pass 75 choreography fragment exists; retained v15 media and the Pass 65 finalizer/verifier remain untouched while an additive capture lane is built. | Menu selection, shell, camera and video tests are included in the 19-file / 162-test combined pass; retained `qa:pass65:menu-rotor` remains green. | Genuine High Seas webm/mp4/poster bytes, Pass 75 provenance verifier, and responsive browser screenshots pending. | Honest standby |
| 5 | Unit-green code can still fail native WebGPU pixels, real traversal, multiplayer, lifecycle, or performance. | Software/WebGL evidence is called WebGPU, debug teleport replaces input traversal, errors occur, host/guest IDs diverge, or budgets fail. | Pending deterministic camera corpus, installed-Chrome route run, multiplayer smoke, and measured budget receipt. | Pending. | Pending. | Pending |

## Owner boundary

No acceptance manifest may state that Dave inspected an immutable preview until
that actually occurs. This task may prepare and push a contribution branch and
open a PR, but it does not merge, publish Pages, or run the protected production
workflow.
