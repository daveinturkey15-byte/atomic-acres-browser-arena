# Atomic Acres Blender Render Profile — Pass 23

Date: 2026-07-16
Branch: `overhaul/blender-render-profile-pass-23`
Status: local candidate; not deployed

## Intent

Add a player-selectable third graphics profile, **Blender Render**, without deleting Performance or Quality and without exposing the diagnostic Compatibility profile in the menu.

The visual direction is an original early-2010s near-future military/agricultural test suburb: weathered concrete, tactical industrial silhouettes, strong lane readability, faction colour accents and compact two-house combat flow. No commercial map geometry, meshes, textures, logos, UI, names, audio or extracted assets are copied.

## Authority boundary

Blender Render replaces the complete static arena presentation only. TypeScript remains authoritative for:

- Rapier collision and ramp movement;
- bullet/knife raycasts and reticle alignment;
- breakable-window state and admission;
- death drops and scavenging;
- bot navigation and LOS;
- multiplayer state and anti-spoof checks;
- gameplay layout, spawns and bounds.

This separation is deliberate: an art-profile selection must never change where a bullet lands, whether a ramp works, or whether a remote state transition is admissible.

Approved dynamic assets remain intact in this pass, notably the scoped sniper and Blender-authored Sanctified Frag. The HUD is DOM/CSS presentation and is not a map mesh.

## Profile contract

`RenderProfile` now admits:

| Internal value | Player selectable | Representation | Static material mode | AA | Shadows | DPR cap |
|---|---:|---|---|---:|---|---:|
| `performance` | yes | responsive | unlit | no | off | 0.75 |
| `quality` | yes | full | responsive | yes | static | 1.0 |
| `blender` | yes, **BLENDER RENDER** | blender | preserve | yes | static 2048 | 1.0 |
| `compat` | query only | compat | unlit | no | off | 0.2 |

Blender and Quality use the `[0.65, 0.75, 0.85, 1]` adaptive DPR ladder. Authored shadows are disabled below `0.85` DPR.

## Deterministic authoring pipeline

The authoritative layout is exported from current TypeScript declarations rather than copied by hand:

```bash
npx vite-node scripts/blender/export-atomic-acres-arena-spec.ts \
  source-assets/blender/atomic-acres-arena-spec.json
```

The arena is then regenerated from a clean Blender 4.0.2 factory scene:

```bash
PYTHONHASHSEED=0 blender --background --factory-startup \
  --python scripts/blender/create-atomic-acres-blender-arena.py
```

Or as one command:

```bash
npm run author:blender-arena
```

Artifacts:

- `source-assets/blender/atomic-acres-arena-spec.json`
- `source-assets/blender/atomic-acres-blender-arena.blend`
- `source-assets/blender/atomic-acres-blender-arena.provenance.json`
- `public/assets/original/models/atomic-acres-blender-arena.glb`
- `artifacts/blender-render/atomic-acres-blender-arena-preview.png`

The GLB was rebuilt twice from clean factory startup and compared byte-for-byte.

## Asset inventory

The self-contained GLB includes:

- 86 × 98 m terrain;
- central asphalt road, curbs, pavements, lane marks and crossings;
- both exact 20.2 × 16.4 m house shells from 118 authoritative solid declarations;
- mirrored interior and exterior physical ramp presentations;
- six semantic breakable windows;
- garages and tactical lane structures;
- aqua coach and coral utility vehicle;
- hydroponics racks and solar/service canopy;
- barriers, crates and cover groups;
- boundary concrete/fence architecture;
- trees, lamps, terminals, vents, signs and central beacon.

Runtime audit:

| Metric | Value |
|---|---:|
| GLB bytes | 1,513,360 |
| Mesh nodes | 24 |
| Materials | 18 |
| Triangles | 18,872 |
| Semantic windows | 6 |
| Image dependencies | 0 |
| External URIs | 0 |

Checksums:

- GLB: `e7a393a8e912ea2423c052e3734b70fbc9326190103927ecea4fe6a6fb8792b3`
- current editable Blend: `555113932189b2edee15ecc4f7a063d70ee9f5c3155eeb4fff35b1093d224639`
- authoritative spec: `239c91038d234f77b2678fab6513b4cf5eced563e6fcb3f3d62573f32d2218f1`

The GLB is the deterministic reproducibility target. The `.blend` remains checksum-tracked for this revision, but Blender source binaries are not assumed portable across Blender releases.

## Runtime integration

`src/blender-environment.ts`:

1. loads the GLB with `GLTFLoader`;
2. audits mesh/material/triangle/window counts;
3. rejects a partial asset if any of the six semantic panes are missing;
4. binds imported pane meshes to the existing breakable-window objects;
5. keeps hidden TypeScript-authored raycast/collision proxies authoritative;
6. hides the procedural arena only after the complete GLB succeeds;
7. falls back to the existing authored arena if loading or binding fails;
8. exposes loader/binding telemetry through the debug snapshot.

## Multiplayer QA hardening

The verifier now supports:

- `QA_RENDER_MODE=blender`
- `QA_RENDER_MODE=host-blender`
- `QA_RENDER_MODE=guest-blender`
- optional local deterministic signaling through `QA_PEER_PORT`

The browser accepts the localhost PeerServer override only when:

- `multiplayerQa=1`;
- hostname is `127.0.0.1` or `localhost`;
- the supplied port is an integer in `1024..65535`.

Local QA uses `iceServers: []` to force direct host candidates. Public production networking remains unchanged.

## Verification

Green retained gates:

- TypeScript/lint: pass;
- deterministic tests: 180/180 after profile/asset changes (a later manifest checksum update was rechecked in the focused manifest suite);
- focused profile/asset/provenance suites: pass;
- Chromium scenarios: 28/28 passed in bounded groups;
- focused Blender scenario: GLB ready, 24 meshes, 18 materials, 18,872 triangles, six panes bound, procedural presentation hidden;
- ADS bullet broke an imported Blender pane and its presentation became invisible;
- Blender active gameplay budget: ≤90 calls and ≤100,000 scene triangles;
- Performance and Quality rendering budgets: pass;
- production build: pass;
- release-tree audit: pass, 30 files, zero rejected-candidate files, zero oversized files;
- dependency audit: zero vulnerabilities before the local PeerServer development dependency; npm reported zero vulnerabilities while installing it;
- local deterministic Performance multiplayer control: pass with `errors: []`, stance/window/scavenge/pickup replication all true and opposing teams.

### Headless mixed-profile limitation

A Performance-host → Blender-guest run joined and proved:

- stance replication;
- remote semantic window break on the Blender presentation;
- remote death and drop replication.

The run later missed the scavenging timing gate under shared software-WebGL load. Other mixed/dual-Blender runs intermittently starved the shared headless Chromium GPU during ADS/first-shot interaction. The same Blender window path passes in the dedicated single-page Chromium scenario, and the full deterministic network control passes with Performance clients.

This candidate therefore does **not** claim a complete dual-Blender headless multiplayer pass. Real-browser/public review remains a separate release gate.

## Release boundary

No source branch or Pages artifact was pushed during this task. Canonical live remains the approved Pass 22/ramp release. Publish only to isolated review after explicit approval and a fresh exact-build public verification.
