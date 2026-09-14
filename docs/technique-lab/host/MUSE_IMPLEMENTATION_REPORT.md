# Skills Lab worker implementation report — URL mapping, newest-first, Lighting & Environment

- Model / requested route: Meta contributor / `muse-spark-1.3-contributor`, xhigh. Exact no-fallback implementation call.
- Worktree: `C:\Users\david\projects\aa-technique-host-20260912`, branch `contrib/dave-gaming-pc/omp/technique-host-20260912`, starting HEAD `336321811ed66eb4a4e509cf9b30f3816576fd1c`.
- Scope kept: only paths under `src/map3/technique-lab/**` plus this report under `docs/technique-lab/host/**`. No commit, reset, merge, push, or worktree operation performed. `public/assets/skills-lab/source-catalog.json` was read, never edited.

## Shared skills read (exact paths + SHA-256 at time of read)

- `C:\Users\david\.codex\skills\atomic-acres-asset-authoring\SKILL.md` — `57c1bb9e333ad99cd428f5cd03090d997ed0647d7b1be24581cd01b38dfd79c4`
- `C:\Users\david\.codex\skills\visual-web-artifacts\SKILL.md` — `af82c7a5c894abe6ae66709aad617a3c893cd2d2d5f0fb461dd911186b64c657`
- `C:\Users\david\.codex\skills\threejs-game-development\SKILL.md` — `707888880f11fe498e5233417ba0b2a808f943c27954881fa19ca239798e2ce9`
- `C:\Users\david\.codex\skills\visual-gauntlet-loop\SKILL.md` — `6b546fc4d1e367ce1f2d892b874521a4d77484921f3c49a216b19c5774b22434`

Skill application: complete runnable host code over description (visual-web-artifacts); installed `three@0.185.1` source verified before use, single renderer/RAF/dispose ownership kept, no weakened gates (threejs-game-development); bounded preview budget with honest OPEN acceptance (visual-gauntlet-loop); no AI-generated assets needed — all preview geometry is code-authored, so the asset-authoring pipeline section was not exercised.

## Three.js version / source evidence

- `package.json`: `"three": "0.185.1"`; `node_modules/three/package.json`: `"version": "0.185.1"`; `@types/three` `0.185.0`.
- APIs used were grepped in the installed source before use, all present: `class InstancedMesh` + `setColorAt` (`src/objects/InstancedMesh.js`), `class MeshStandardMaterial` + `envMapIntensity` (`src/materials/MeshStandardMaterial.js`), `class HemisphereLight`, `class DirectionalLight`. No API was pasted from another release.

## Files changed

Modified:

- `src/map3/technique-lab/runtime.ts` (+350/−11 in diff stat) — fourth `lighting` tab with shared-stage slot, URL mapping filter, newest-first ordering, same-host target buttons, lighting lifecycle (mount/teardown/dispose), `?tab=lighting` deep link.
- `src/map3/technique-lab/gallery/blender-catalog.ts` (+29) — optional recorded date fields (`createdAt`/`updatedAt`/`generatedAsOf`, tolerant parse, nulls for the two shipped assets) plus `blenderAssetDate()`.
- `src/map3/technique-lab/lab.css` (+13) — class-scoped styles for date labels, the mapping filter, and the lighting layout incl. the narrow-layout media query.

Added:

- `src/map3/technique-lab/gallery/sorting.ts` (79 lines) — `UNKNOWN_DATE_LABEL` (`date unknown`, never a fake date), strict `parseRecordDate` (YYYY-MM-DD + strict ISO-`T` datetimes only), `maxDate`, stable `sortNewestFirst` (dated newest-first, unknowns last in incoming order, no input mutation).
- `src/map3/technique-lab/gallery/url-targets.ts` (65 lines) — `latestEvidenceDate` (newest recorded `inspectedAt`, else null) and `urlTarget` (demo when delivered, else the Blender asset a skill mapping's `sourceReference` names, else null; unmapped rows always null).
- `src/map3/technique-lab/gallery/lighting-preview.ts` (370 lines) — bounded CPU-built grass/road/shed preview (240-blade jittered-grid InstancedMesh with road/shed/slope rejection, terrain-following asphalt ribbon, PBR shed, two preview-owned lights), `morning|noon|dusk` × `clear|overcast` rigs, unsupported `night|rain|storm` named only for disabled UI labels, idempotent dispose via the shared `disposeObject` path.
- `src/map3/technique-lab/host-skills-lab-dates-lighting.test.ts` (299 lines, 18 tests) — pure falsifiers.
- `src/map3/technique-lab/host-skills-lab-tabs.test.ts` (562 lines, 9 tests) — host-level falsifiers through the real host with a bounded fake DOM.

## Behavior implemented

1. URL menu: mapping filter `All rows / Mapped only / Unmapped URLs` next to the search box; count line reports mapped/unmapped totals. Mapped rows with a delivered demo show `Open skill demo #N` (same-host: skills tab + mount); mapped rows whose catalog mapping names a loaded Blender asset show `Open Blender asset <key>` (same-host: blender tab + card load); mapped rows with neither say so in text. External original links remain plain anchors with the existing embed allowlist untouched. Unmapped rows keep their `ingestion needed / experiment needed / blocked` badges and never receive a target button.
2. Newest-first everywhere: skills gallery, URL rows, and Blender cards sort by recorded dates only (catalog evidence `inspectedAt`; Blender lane `createdAt`/`updatedAt`/`generatedAsOf`). Undated records keep their natural order (id / curated rank) after all dated records and are visibly labelled `date unknown`. The strict parser deliberately rejects the catalog-level `2026-09-12 (wave 2)` stamp so it can never become a per-row date.
3. Lighting & Environment tab: CPU-safe preview reusing lab techniques (source-18 jittered-grid grass restated as static instancing — the source's GLSL wind bend is documented as not reproduced; source-48 value discipline without any post chain; source-07 code-only authoring). Controls expose exactly the implemented states; `night`/`rain`/`storm` render disabled with `(unavailable — not implemented)` and their setters reject without state change. One shared renderer/RAF; the preview mounts on tab enter, is disposed (geometries/materials freed, scene-detached) on tab leave, and is torn down exactly once on host dispose. Frame selection includes the preview root. Detail panel states technique provenance, the missing environment map (reflections stay diffuse), and OPEN visual acceptance.

## Tests and outputs

- `npx --no-install vitest run src/map3/technique-lab/host-skills-lab.test.ts src/map3/technique-lab/host-skills-lab-runtime.test.ts src/map3/technique-lab/host-skills-lab-dates-lighting.test.ts src/map3/technique-lab/host-skills-lab-tabs.test.ts` → **4 files, 43 tests, all passed** (16 pre-existing + 27 new).
- `node scripts/technique-lab/host/check.mjs` → all checks passed (no asserted honesty/disposal substring disturbed).
- `npx --no-install tsc -p scripts/technique-lab/host/tsconfig.host.json --noEmit` → clean (covers `runtime.ts` and its transitive gallery imports).
- Full repository suite deliberately not run per the brief.

## Unresolved limitations

- Recorded dates in the real data are nearly uniform (`inspectedAt` is `2026-09-12` almost everywhere, one `2026-09-02`), so newest-first rarely reorders production rows today; the mechanism is proven by fixtures with distinct dates.
- No shipped or lane Blender catalog records any date field, so all Blender cards currently read `date unknown` in curated order — honest, and the lane-reader path is fixture-tested.
- No current catalog skill mapping names a Blender asset, so the `open-blender` path is fixture-tested only; it will activate automatically if the sources lane ever records such a reference.
- Preview grass is static (no wind), the host scene supplies no environment map, and terrain/road/shed are stylised lab forms, not arena geometry.

## Honest visual-acceptance note

**No browser/GPU visual acceptance was run.** Per the brief no browser, GPU, Blender, network, or new dependencies were used. The lighting preview has been proven to build deterministically, apply its states, and dispose exactly once on the CPU only; every UI surface that describes it states visual/FPS acceptance is OPEN. Nothing in this pass claims a successful visual render.
