# Technique Lab HOST — handoff report (contrib/dave-gaming-pc/omp/technique-host-20260912)

Owner scope: standalone Three.js host UI only (`src/map3/technique-lab/`),
plus focused checks/receipts under `scripts/technique-lab/host/`.
The 50 technique demos are NOT built here.

## What was delivered

- `src/map3/technique-lab/runtime.ts` — `mountTechniqueLab(container)`
  returning `{ dispose() }`. One `THREE.WebGPURenderer`, one RAF (clamped
  delta, bounded pixel ratio 2), ResizeObserver + window-resize fallback,
  host-owned lights disposed on teardown, generation guards on renderer
  init / group-load / dispose races.
- `src/map3/technique-lab/types.ts` — frozen demo factory contract.
- `src/map3/technique-lab/manifest.ts` — 50 numbered public records, all
  `Pending / Not yet delivered`; row 21 aliases row 19 (no 50-distinct claim).
- `src/map3/technique-lab/lab.css` — scoped `.tl-*` styles, 1280 desktop
  3-column / 390 mobile stacked, keyboard-focusable controls.
- `scripts/technique-lab/host/check.mjs` — pure node checks (no GPU/browser).
- `scripts/technique-lab/host/tsconfig.host.json` — focused typecheck config.
- `scripts/technique-lab/host/skill-use.json` — skill coverage receipt.
- `scripts/technique-lab/host/handoff-report.md` — this file.

## Honesty posture (do not regress)

- Manifest/URL association ⇒ only `Link saved`. `Source inspected`,
  `Technique extracted`, `Result tested` stay open (no evidence pipeline).
- Mounted factory ⇒ implementation loaded only; never research/quality/testing.
- No factory ⇒ `Missing / not delivered`, never placeholder geometry or
  wrong-index fallback. No payload fetched from source URLs (links only,
  http/https validated, `rel="noopener noreferrer"`, `textContent` only).
- Backend label read from live renderer flags: WebGPU / WebGL fallback /
  unknown. Renderer failure stays visible; update throws stop that demo only.

## Validation (exact commands, repo root)

1. `npx tsc --noEmit -p scripts/technique-lab/host/tsconfig.host.json`
   → clean (0 errors). Covers only owned modules + vite-env; full-repo tsc
   errors outside scope were ignored per brief, never fixed.
2. `node scripts/technique-lab/host/check.mjs`
   → "All technique-lab host checks passed." (50 records, alias, contract,
   single renderer, disposal pieces, scoped responsive CSS).
3. `npm run pipeline:preflight -- --machine dave-gaming-pc --harness omp
   --project atomic-acres-browser-arena --lane technique-host-20260912`
   → see commit message / final handoff note for result.

No browser/GPU job was run (owner ban): no mount/switch/unmount pixels, no
FPS numbers. Root tests actual mount/switch/unmount after integration.

## Visual / FPS acceptance: OPEN

Not self-certified. Pending root integration + real-browser review at 1280
and 390 widths.

## Integration note for root (not done here)

- Cherry-pick demo groups to `src/map3/technique-lab/demos/group-*/index.ts`
  exporting `{ manifest }`; wire this module + `lab.css` into `map3.html`.
  Empty glob match is a normal pending state, never a build error.
- Fixed demo seed: `LAB_SEED = 20260912`.

## Residual unknowns

- `WebGPURenderer` constructor `canvas` param + `renderer.dispose()` /
  `Light.dispose()` typings verified against installed three 0.185.1 runtime
  source; behaviour on real WebGPU hardware untested (no GPU job allowed).
- `#source-N` hash sync uses `history.replaceState` in try/catch; exotic
  embed contexts may ignore it — selection state always lives in the host.
