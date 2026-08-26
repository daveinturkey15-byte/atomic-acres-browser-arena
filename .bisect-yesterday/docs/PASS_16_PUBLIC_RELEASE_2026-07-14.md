# Atomic Acres Pass 16 — Public Release Evidence

Date: 2026-07-14
Status: Published immutable review

## Revisions

- Gameplay source: `293d15d5fffd1a3b80e7abf19e55f66665230411`
- Source branch: `overhaul/refinement-pass-16`
- GitHub Pages release: `b6f1510`
- URL: `https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass16/?release=293d15d`
- Canonical root: unchanged (Pass 12)
- Prior review directories: unchanged

## Final local gates

- `npm run lint`: PASS
- `npm test -- --run`: PASS, 28 files / 126 tests
- `npm run build`: PASS
- Chromium E2E: PASS, 18/18
- Bundle warning remains non-blocking: app 930.02 kB (254.75 kB gzip), Rapier 2,234.73 kB (841.70 kB gzip)

## Public verification

Public HTTP returned `200` after GitHub Pages propagation.

Browser runtime:

- graphics selector: exactly Performance and Quality
- weapon ready: true
- first-person model kind: `licensed-imported`
- Rifle GLB: 7 meshes, 3 clips
- socket contract: ready
- muzzle forward dot: 0.994735
- sight forward dot: 1.0
- arms visible: true, 14 meshes
- operator: CC0 Quaternius SWAT, 5 skinned meshes, 24 clips
- Performance workload: 83 calls, 53,832 triangles

Public WebRTC verifier:

- host/client connected reciprocally
- room code length: 36
- no browser errors
- stance replication: PASS
- spawn separation: 65 m
- explicit opposing squads: host 0 / guest 1

## QA verifier correction

The multiplayer QA script initially tried to read `snapshot.player.team`, but the debug snapshot intentionally omits local and remote team fields. The verifier now explicitly chooses Coral for the guest before deployment and records that UI selection. This changes QA only; it does not change the published runtime.
