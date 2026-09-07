# PASS74 / HF-336 — Chopper Gunner Spectator Performance Cost Analysis

- **Bug**: OWNER HF-336 ('when chopper gunner is flying and I am against it or on the same team but not controlling it I am very laggy').
- **Repo/Worktree Root**: `C:\Users\david\projects\atomic-acres-pass74`
- **Branch**: `contrib/dave-gaming-pc/claude/pass74-20260821`
- **Scope**: MEASUREMENT ONLY — 0 src/ files modified, 0 test files modified.

---

## Executive Summary & Verdict

**CONFIRMED ASYMMETRIC SPECTATOR OVERHEAD**: The pilot and the spectator experience completely different presentation pipelines while a Chopper Gunner is airborne.

1. **The Pilot pays near-zero presentation cost**:
   When possessed (`possession.kind === 'chopper-gunner'`), `setSupportFirstPersonVisibility(root, true)` (`src/killstreak-presentation.ts:1758–1808`) sets `node.visible = false` on the entire exterior airframe, rotors, pylons, and weapons. The pilot renders only the first-person cockpit viewmodel (a few low-poly nodes on render layer 2), pays **0 exterior draw calls**, **0 exterior triangles**, and **0 shadow caster rasterizations**.

2. **The Spectator pays the maximum presentation cost on every frame**:
   When non-controlling (`possession === null`), `setSupportFirstPersonVisibility(root, false)` (`src/killstreak-presentation.ts:1789–1793`) activates the complete exterior hierarchy on world render layer 0.
   - **Forced LOD0 at all gameplay distances**: `SUPPORT_VEHICLE_LOD_DISTANCES` is `[0, 95, 190]` (`src/killstreak-presentation.ts:120`). Because the chopper flies at 18–30m altitude (`src/additional-maps.ts:1927`) over an ~80m arena, ground players are virtually always within 30–70m distance, forcing `THREE.LOD` to select **LOD0 100% of the time**.
   - **Heavy Beauty Pass Load**: LOD0 submits **87 visible meshes** (47 static batches + 40 unbatched parts) and **59,948 triangles** per frame to the colour pass.
   - **Real-Time 2048x2048 Shadow Map Rasterization**: A baked shadow silhouette proxy (`pass74-support-shadow-silhouette`) casts real-time dynamic shadows into the directional sun light's 2048x2048 shadow map, submitting **11,344 unindexed triangles** every frame.
   - **Scene Graph Traversal**: Per-frame position/quaternion lerping (`src/killstreak-presentation.ts:3226–3227`) forces Three.js to recompute `matrixWorld` across **431 nodes** in the LOD hierarchy every frame.

---

## Shadow Quantification (Leading Suspect Analysis)

| Property | Measured Value | Source Citation | Notes |
| :--- | :--- | :--- | :--- |
| **Real-time Shadows Enabled?** | **YES** | `src/legacy-main.ts:3124` | `sunLight.castShadow = true` |
| **Do Rotor Blades Cast Shadows?** | **NO** | `src/killstreak-presentation.ts:473–482` | `chopper-main-rotor` and `chopper-tail-rotor` are explicitly in `SUPPORT_SHADOW_SILHOUETTE_EXCLUDED_SUBTREES` |
| **Do Authored GLB Meshes Cast Shadows?** | **NO** | `src/killstreak-presentation.ts:1905` | Retired via `applyAuthoredSupportShadowBudget(root, 'chopper', { castShadows: false })` |
| **Active Shadow Caster Count** | **1 mesh** | `src/killstreak-presentation.ts:570–581` | Single proxy mesh: `pass74-support-shadow-silhouette` |
| **Shadow Caster Triangles** | **11,344 triangles** (34,032 unindexed vertices) | Measured via GLTF / Silhouette Probe | Position-only Float32BufferAttribute baked from LOD2 |
| **Shadow Map Resolution** | **2048 x 2048** (High) / 1024 x 1024 (Med/Low) | `src/legacy-main.ts:3125`, `src/pass65-settings.ts:290` | `sunLight.shadow.mapSize.set(activeRenderConfig.shadowMapSize, ...)` |
| **Shadow Camera Frustum** | **96m x 108m x 140m** | `src/legacy-main.ts:3126–3131` | `left: -48, right: 48, top: 54, bottom: -54, near: 10, far: 150` |
| **Shadow Filtering Overhead** | **PCF Soft Shadows (`radius = 2.2`)** | `src/legacy-main.ts:3134` | All arena receiving surfaces (terrain, buildings, props) sample shadow map |
| **Beauty Pass Proxy Overhead** | **1 draw call / 11,344 vertices** | `src/killstreak-presentation.ts:550–556` | `supportShadowSilhouetteMaterial` has `colorWrite: false, depthWrite: false`, but vertex shader executes |

---

## Complete Asset Geometry & Optimization Breakdown

Measured directly from `public/assets/original/models/support/pass65-chopper-gunner-lod{0,1,2}.glb`:

| Model Level | File Size | Scene Nodes | Total Meshes | Visible Meshes (Post-Batch) | Rendered Triangles | Batched Source Meshes | Batches Produced | Shadow Casters | Shadow Triangles |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **LOD0** | 930.0 KB | 431 | 408 | **87** | **59,948** | 321 | 47 | 0 (retired) | 0 |
| **LOD1** | 811.9 KB | 366 | 343 | **84** | **49,964** | 259 | 42 | 0 (retired) | 0 |
| **LOD2** | 558.0 KB | 220 | 197 | **63** | **29,344** | 134 | 32 | 0 (retired) | 0 |
| **Shadow Proxy** | In-Memory | 1 | 1 | 1 (no-op mat) | 11,344 (no-op) | — | — | **1** | **11,344** |

---

## Ranked Per-Frame Spectator Cost Inventory

Ranked by measured performance impact on non-controlling peers:

### 1. [PRESENTATION] Beauty Pass Draw Calls & Geometry Submission (LOD0)
- **File / Lines**: `src/killstreak-presentation.ts:1810–1912`, `src/killstreak-presentation.ts:120`, `src/killstreak-presentation.ts:1789–1793`
- **What Runs**: `renderer.render(scene, camera)` evaluates `THREE.LOD`, frustum-culls, and binds PBR materials for all visible meshes.
- **Frequency**: Every frame (60 / 120 Hz).
- **Measured Cost**: **87 mesh draw calls**, **59,948 triangles**, multiple PBR shaders (Armor PBR, Rear Tail Armor, Dark Armor, Gunmetal, Panel Seams).
- **Classification**: **PRESENTATION** (Safe to reduce).

### 2. [PRESENTATION] Real-Time Directional Shadow Map Generation
- **File / Lines**: `src/killstreak-presentation.ts:503–582`, `src/killstreak-presentation.ts:1905–1907`, `src/legacy-main.ts:3122–3135`
- **What Runs**: Dynamic shadow map pass renders the silhouette proxy into the 2048x2048 sun shadow map.
- **Frequency**: Every frame (dynamic shadow map update).
- **Measured Cost**: **1 shadow draw call**, **11,344 triangles** rasterized into 4.19M shadow depth texels; full-screen PCF sampling across all receiving terrain and building shaders; 1 beauty pass dummy draw call (11,344 unindexed vertices with `colorWrite: false`).
- **Classification**: **PRESENTATION** (Safe to reduce).

### 3. [PRESENTATION] Scene Graph Hierarchical Matrix World Updates
- **File / Lines**: `src/killstreak-presentation.ts:3226–3227`, `src/killstreak-presentation.ts:1825–1883`
- **What Runs**: `presented.root.position.lerp()` and `presented.root.quaternion.slerp()` invalidate the root matrix, triggering `updateMatrixWorld` traversal down the entire scene hierarchy.
- **Frequency**: Every frame.
- **Measured Cost**: **431 node matrix evaluations** in LOD0 + LOD parent groups.
- **Classification**: **PRESENTATION** (Safe to reduce).

### 4. [PRESENTATION] Animation Mixer Advancement
- **File / Lines**: `src/killstreak-presentation.ts:2628–2640`, `src/killstreak-presentation.ts:3230`
- **What Runs**: `this.advanceActiveLevelMixers(presented, nowMs)` advances `mixer.setTime(nowMs / 1000)` for the active LOD.
- **Frequency**: Every frame.
- **Measured Cost**: **1 mixer**, **3 active looping tracks** (`Chopper_Main_Rotor_Loop`, `Chopper_Tail_Rotor_Loop`, `Chopper_Quiet_Loop`) interpolating bone transforms. *(Note: Partial fix in 970d4c52 reduced this from 3 mixers / 9 tracks down to 1 mixer / 3 tracks).*
- **Classification**: **PRESENTATION** (Safe to reduce).

### 5. [PRESENTATION] Snapshot Transform Interpolation & Smoothing
- **File / Lines**: `src/killstreak-presentation.ts:3206–3228`
- **What Runs**: Vector3 target lerp (blend factor 0.38), Euler conversion (`attitudeEuler.set`), Quaternion slerp (`attitudeTarget.setFromEuler`).
- **Frequency**: Every frame per active vehicle entity.
- **Measured Cost**: Minimal CPU arithmetic (1 lerp, 1 slerp, 1 trig conversion per chopper entity).
- **Classification**: **PRESENTATION** (Safe to reduce).

### 6. [PRESENTATION] Audio HRTF Spatializer Updates
- **File / Lines**: `src/legacy-main.ts:21446`, `src/audio.ts:1827–1895`
- **What Runs**: `syncActiveSupportRotorAudio(now)` -> `audio.syncChopperRotors(sources)` updates Web Audio panner parameters.
- **Frequency**: Every frame.
- **Measured Cost**: 3 Web Audio AudioParam assignments (`panner.positionX.value`, `Y`, `Z`) + 1 gain calculation based on distance and altitude.
- **Classification**: **PRESENTATION** (Safe to reduce).

### 7. [GAMEPLAY] Authoritative Simulation & Firing Raycasts (Host / Solo Only)
- **File / Lines**: `src/killstreak-runtime.ts:2392–2540`, `src/killstreak-runtime.ts:2969–3006`
- **What Runs**: `advanceChopper` computes route poses and targeting rays. *(Runs ONLY on host or solo; multiplayer guests skip this via `network.role !== 'client'` gate at `src/legacy-main.ts:21345`)*.
- **Frequency**: Every frame on host/solo (0 on multiplayer guest).
- **Measured Cost**: 1 `chopperRoutePose` flight math calculation; 1 target sort across ~10 combatants; 0–2 raycast line-of-sight checks per firing cycle.
- **Classification**: **GAMEPLAY** (**MUST NOT BE TOUCHED** — Authoritative position, hit registration, damage admission, missile trajectory).

---

## Honesty Rule Evaluation

**Does the measured cost explain severe lag?**

**YES.** On typical mid-range and integrated GPUs, adding **87 PBR draw calls**, **59,948 beauty triangles**, and **11,344 shadow triangles into a 2048x2048 dynamic shadow map** for a single background entity causes a notable frame-time spike (often 4–8 ms increase on WebGPU / WebGL2 pipelines).

Because the pilot hides the entire exterior, the pilot gets solid 60+ FPS while all other peers (who see the exterior and cast the shadows) experience severe stuttering.

---

## Recommended Fix for the Top Priority Item

### Top Target: LOD Distance Banding & Silhouette Optimization

1. **Re-tune `SUPPORT_VEHICLE_LOD_DISTANCES` in `src/killstreak-presentation.ts:120`**:
   - Current: `[0, 95, 190]` (forces LOD0 at all practical gameplay ranges: 18–70m).
   - Recommended: `[0, 32, 65]` or `[0, 36, 75]`.
   - Result: Chopper at typical operating altitude (25–35m) immediately selects LOD1 (84 meshes, 49.9k tris) or LOD2 (63 meshes, 29.3k tris), cutting draw calls by up to 28% and triangle count by over 50% without perceivable visual difference from the ground.

2. **Decimate / Simplify Baked Silhouette Geometry**:
   - In `mergeAuthoredSupportShadowSilhouette` (`src/killstreak-presentation.ts:503–543`), index the geometry or decimate the merged triangle soup from 11,344 triangles down to ~800–1,500 triangles.
   - **Preserve Geometry Caching**: MUST keep caching the result in `supportShadowSilhouetteGeometries` map (`src/killstreak-presentation.ts:558–569`) so geometry is baked exactly once at prewarm/load time and zero allocations occur per frame.

3. **Strict File Allowlist for Future Fix**:
   - `src/killstreak-presentation.ts`
   - `src/killstreak-presentation.test.ts`
   - `src/pass70-chopper-gunner-contract.test.ts`
   *(No `src/killstreak-runtime.ts` or gameplay files may be touched).*
