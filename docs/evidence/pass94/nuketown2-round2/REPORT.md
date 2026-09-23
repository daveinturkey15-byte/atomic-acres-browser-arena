# Pass 94 Nuke Town Rebuild — owner round 2

Date: 2026-09-04 (Europe/London)

## Scope and source

`VERIFIED` Work stayed in `C:\Users\david\projects\aa-claude-round2` on `contrib/dave-gaming-pc/claude/nuketown2-owner-round2`. The two implementation commits are:

- `716067e6` — `fix(nuketown2): owner round 2 - repair street surfaces and upper glass`
- `0aca54b1` — `fix(nuketown2): owner round 2 - park original arena in derived rosters`

`VERIFIED` The release identity and changelog were not changed. `src/legacy-main.ts` was not rewritten.

## Owner feedback disposition

### HF-461 — orientation and colour mirror check

`VERIFIED` The requested `docs/evidence/pass90/` and `docs/evidence/pass9*/nuketown2-research*` paths are absent in this checkout. The repository's first-party `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md` does establish the world frame: x runs along the street, z runs across it, and the two house/garage compositions are exact 180-degree rotations. The current Rebuild follows that rule: the north garage is on +x and the south garage on -x; from the corresponding back-yard spawns, both garages occupy the same relative side of the road-facing view.

`OPEN` The schematic records the blue/yellow palette but does not prove the absolute team-to-colour assignment. The current source is north blue and south yellow. No mirror correction was made; absolute colour assignment remains for the Opus accuracy lane.

### HF-463 — carriageway Z tearing

`VERIFIED` `NUKETOWN2_CARRIAGEWAY_FOOTPRINTS` is shared by the road builder, the ground-cut builder and `find-coplanar-pairs.ts`. The outdoor slab is cut out under the street and turning head. Asphalt is real solid geometry; centre dashes are 0.04 m-thick real solids with a 0.04 m air gap above the road. No street surface fix relies on polygon offsets.

`VERIFIED` The final coplanar run reports `HOUSE-INTERIOR ...: 0`, `STREET ...: 0`, `FINDINGS ...: 0`, and 16 unaudited meshes, unchanged from the pre-change 16. The new street class ignores offsets and fails the run if any pair within 0.03 m overlaps a carriageway footprint.

`VERIFIED` The two low grazing captures are native-WebGPU frames at y=0.4 m, z=0, looking along the street in opposite directions:

- [west to east](street-graze-west-to-east.png) — SHA-256 `95F8F524040B7D981669AF80011304FA4B8A66B844DD0FC8251F9C7464F7B144`
- [east to west](street-graze-east-to-west.png) — SHA-256 `E6382AF449B3AD309B9233370051F79C54123701E5813CF77E0095DCA4DDEBEB`

### HF-464 — upstairs breakable glass

`VERIFIED` The existing ground-floor glass path was reused. Upper front and upper back panes now carry side-specific `breakableWindowId` records and `ballisticMaterial: 'glass'`; the built Rebuild contains eight registered breakable panes and eight derived intact dynamic glass colliders.

`VERIFIED` The shared glass authority, window-break, main integration and world-perception tests pass. The fidelity test confirms the static upstairs drop-out openings remain clear; breaking the dynamic pane therefore removes the live obstruction without restoring a static blocker. Shards, sound and post-break visibility use the shipped shared lifecycle.

### HF-466 — park the original Nuketown

`VERIFIED` The parked arena is `atomic-acres`, the original Nuke Town registry id. It remains registered, builds normally, decodes normally, and is excluded only from `SELECTABLE_ARENAS`. `nuketown2` remains selectable. The stock-flags control case now uses selectable `skyline-terminal`.

`VERIFIED` Roster-derived floors now reflect 11 registered ids and 9 selectable ids. Parked ids are derived from registry flags; no release identity or changelog entry changed.

## Requested gates, quoted verbatim

```text
npx tsc --noEmit;
npx vitest run src/nuketown2-fidelity.test.ts src/collider-visual-parity-gate.test.ts src/map-selection.test.ts src/arena-factory-registry.test.ts src/arena-switch-matrix-roster.test.ts src/destructible-shed-registry.test.ts src/legacy-main-size-ratchet.test.ts plus every test you touched;
npx tsx scripts/qa/find-coplanar-pairs.ts (FINDINGS 0, house-interior 0, street 0, UNAUDITED not grown);
then npm run build, your own npx vite preview --outDir dist --host 127.0.0.1 --port 4299 --strictPort (record PID, stop at the end);
QA_EXTERNAL_PREVIEW=1 QA_PREVIEW_PORT=4299 BASE_URL=http://127.0.0.1:4299 npm run qa:stock-boot (4 passed);
the nuketown2 boot smoke (PASS73_NATIVE_WEBGPU=1 QA_EXTERNAL_PREVIEW=1 QA_PREVIEW_PORT=4299 BASE_URL=http://127.0.0.1:4299 npx playwright test tests/e2e/pass74-arena-boot-smoke.spec.ts --project=chromium --workers=1 --retries=0 -g nuketown2);
the captures. Delete test-results, playwright-report and any artifacts/**/*.json your runs created.
```

## Gate results

`VERIFIED` `npx tsc --noEmit` exited 0.

`VERIFIED` The requested Vitest files plus touched/related TypeScript tests passed: 13 files, 98 tests. This included the glass authority, main integration, world-perception, window-break, selectability and menu-shell tests. No full Vitest suite was run.

`VERIFIED` `npx tsx scripts/qa/find-coplanar-pairs.ts` exited 0:

```text
HOUSE-INTERIOR pairs<=0.03m (offsets ignored): 0
STREET pairs<=0.03m (offsets ignored): 0
FINDINGS (different materials, no offset): 0
UNAUDITED meshes: 16
```

`VERIFIED` `npm run build` transformed 514 modules and exited 0. Vite emitted its existing large-chunk advisory only.

`VERIFIED` The requested preview was started hidden with launcher PID 9724, served on port 4299, and was stopped after browser evidence. Port 4299 has zero listeners.

`VERIFIED` `QA_EXTERNAL_PREVIEW=1 QA_PREVIEW_PORT=4299 BASE_URL=http://127.0.0.1:4299 npm run qa:stock-boot` passed 4/4 in 1.8 minutes: Nuke Town Rebuild and skyline-terminal both reached live frames with zero pipeline errors.

`VERIFIED` The requested native-WebGPU Nuke smoke passed 1/1 in 38.6 seconds.

`VERIFIED` The two requested grazing captures passed in one headless Chrome run. Both reported backend `webgpu`, arena `nuketown2`, fixed visual time 0, seed 9402, HUD hidden, and committed capture-camera revisions.

`VERIFIED` Before each browser run, the queue had zero running and zero pending jobs, GPU free memory was at least 14,499 MiB, and no headless Chrome process was running. Only the browser processes launched by these checks were closed.

`VERIFIED` Cleanup removed the run-created `playwright-report/`, `artifacts/pipeline/20260904T095026831Z-contribute.json`, and `artifacts/pass25a/playwright-results/.last-run.json`. `test-results/` was absent. Pre-existing evidence was preserved.

## Contract OPEN items

`OPEN` The user-requested Codex preflight cannot accept this mandated branch namespace: `--harness Codex` is rejected because the harness slug is not lowercase; `--harness codex` is rejected because the branch is `contrib/dave-gaming-pc/claude/...`. The same preflight passed cleanly with `--harness claude` after the two code commits, proving the repository state is clean and contains `origin/main`.

`OPEN` The separately run `node --test scripts/qa/arena-roster-contract.test.mjs` has one unrelated pre-existing detector failure for five bounded QA subset scripts (`capture-lane-ab-time-of-day.mjs`, `hf410-near-plane-ab-diff.mjs`, `publish-lane-ab-frames.mjs`, `raid2-layout-metrics.ts`, and `scan-lane-ab-band-readability.mjs`). Its registry floor and HF-466 roster assertions pass; those unrelated allowances were not changed in this owner-fix lane.

## What the owner should see

`VERIFIED` The menu no longer offers the original `atomic-acres` Nuke Town card, while `Nuke Town Rebuild` remains available. In the Rebuild, the two low street-centre frames show the asphalt and centre markings from opposite grazing directions without the old carriageway seam. Upstairs glass is registered as breakable on both paired houses, and the lower drop-out openings remain usable after the pane lifecycle changes.

No production publication is claimed from this feature worktree.
