# Atomic Acres — Sanctified Frag Blender/MCP Integration

**Date:** 2026-07-15
**Branch:** `overhaul/house-loot-grenade-pass-22`
**Status:** locally integrated and verified; public deployment intentionally gated on visual approval

## Overview

Replace the original primitive frag presentation with an original ceremonial grenade authored locally in Blender. Preserve the existing Atomic Acres throw, collision, bounce, fuse, damage, explosion, networking, reticle, movement, and multiplayer behavior.

The result is the **Sanctified Frag**: a gold orb with antique bands and crown, an ivory cross, steel safety lever/pin ring, and ruby fuse detail. It uses the broad comedy-fantasy ceremonial-grenade theme requested by the owner without downloading, extracting, or reproducing a commercial game model.

## Requirements

- **R1:** Use locally authored project geometry, not a downloaded Worms asset.
- **R2:** Retain an editable Blender source and deterministic creation script.
- **R3:** Export a self-contained browser-ready GLB with no external texture dependencies.
- **R4:** Load the model once and clone it per throw.
- **R5:** Keep presentation meshes out of gameplay raycasts.
- **R6:** Preserve the existing 13-unit forward impulse, 5.2-unit upward impulse, gravity, collision sweep, bounce response, 2,300 ms fuse, damage, and explosion path.
- **R7:** Provide an original fallback when the GLB cannot load.
- **R8:** Prove load, throw, authored-clone use, explosion cleanup, release-tree safety, browser stability, performance, and multiplayer regression safety.

## Authored Asset

| Item | Value |
|---|---|
| Creation script | `scripts/blender/create-holy-hand-frag.py` |
| Editable source | `source-assets/blender/holy-hand-frag.blend` |
| Runtime GLB | `public/assets/original/models/holy-hand-frag.glb` |
| Review render | `artifacts/holy-hand-frag/holy-hand-frag-preview.png` |
| In-game review | `artifacts/holy-hand-frag/holy-hand-frag-ingame.png` |
| Blender | 4.0.2 |
| GLB size | 249,140 bytes |
| Nodes | 19 |
| Meshes | 18 |
| Materials | 6 |
| Triangles | 6,584 |
| Embedded/external images | 0 / 0 |
| GLB SHA-256 | `892a7e0fe08d24e3d743843b3642c2453715f69875af1bcad6a098c59fdba80c` |
| Blend SHA-256 | `2312c8a20e7f9ec5227127dc3775f727bed263c157bc13e2bc48a8f592023e48` |

Named GLB parts include `HHG_Body`, `HHG_EquatorBand`, `HHG_CrownCollar`, `HHG_CrossStem`, `HHG_CrossArm`, `HHG_SafetyLever`, `HHG_PinRing`, and `HHG_RubyJewel`.

## Runtime Integration

`src/grenade-presentation.ts` owns the presentation contract:

1. `loadGrenadePresentation()` preloads the GLB once during application bootstrap.
2. `createGrenadePresentation()` clones the loaded scene and normalizes it to a maximum gameplay dimension of `0.46` units.
3. Every presentation node is marked `presentationOnly`; raycasting is disabled.
4. The authored template shares geometry and materials across transient clones. Per-throw disposal removes the clone without disposing shared source resources.
5. A small gold-and-ivory original primitive fallback remains available if loading fails.
6. Telemetry exposes load state, source mesh count/dimensions, asset path, and active authored-clone state.
7. The thrown model receives visual angular velocity only. Gameplay throw and explosion values remain unchanged.

`src/main.ts` now uses that presentation object in the existing `GrenadeEntity`. The original physics and damage code remains authoritative.

## Blender MCP Setup Used

The official Hermes skill was installed without upgrading Hermes:

```bash
hermes skills install official/creative/blender-mcp --yes
apt-get install -y blender netcat-openbsd xvfb python3-numpy
```

The Blender addon from `ahujasid/blender-mcp` was pinned to commit:

```text
6641189231caf3752302ae20591bc87fda85fc4e
```

Audited addon SHA-256:

```text
bba60831f5f89a74deda0294b131668a086cf46eb35a6a01abbd0d21d9e92630
```

Installed path:

```text
/root/.config/blender/4.0/scripts/addons/blender_mcp_addon.py
```

Preferences used:

- local socket host: `localhost`
- port: `9876`
- telemetry: disabled
- Poly Haven: disabled
- Hyper3D: disabled
- Hunyuan3D: disabled
- Sketchfab: disabled
- auto-start server: enabled when Blender starts

The controlled headless launch was:

```bash
xvfb-run -a blender
nc -z -w2 127.0.0.1 9876
```

A `get_scene_info` smoke test succeeded, followed by an MCP `execute_code` call containing the deterministic creation script. The Blender process is not required to play the game; it is an authoring tool only.

## Verification Evidence

`npm run verify` completed successfully:

- TypeScript: passed
- Vitest: **170/170 passed** across 33 files
- Production build: passed
- Release-tree verifier: `releaseTree=ok`, 28 files, 0 rejected-candidate files, 0 oversized files
- Chromium: **26/26 passed**
- Authored frag E2E: GLB state `ready`, 18 source meshes, one authored clone after throw, explosion and cleanup complete, frame loop continues
- Existing reticle/ADS centre-ray E2E: passed
- Performance and quality browser budgets: passed

Multiplayer verifier against the exact local build:

```text
errors=[]
stanceReplicated=true
windowReplicated=true
scavengeReplicated=true
pickupReplicated=true
host remotes=1
guest remotes=1
```

Controlled visual review confirmed the projectile is visible on the throw path at gameplay scale, correctly Y-up, with readable gold/ivory/steel silhouette and no clipping, HUD overlap, or viewmodel regression.

## Gotcha

**Symptom →** Blender MCP executes the creation script, but GLB export fails with `ModuleNotFoundError: No module named 'numpy'` from Blender's glTF exporter.
**Cause →** Ubuntu's Blender 4.0.2 package can be installed without the distro `python3-numpy` package that its bundled glTF exporter expects.
**Correction →** Install `python3-numpy`, restart the Blender process to clear the failed module state, and rerun the same export.
**Verify →** MCP `execute_code` returns success; `file` identifies the output as glTF binary version 2; the manifest checksum test and browser GLTFLoader telemetry both pass.

## Release Boundary

No push or Pages deployment is included in this integration pass yet. The locally tested source and controlled gameplay screenshot are ready for owner visual approval first.
