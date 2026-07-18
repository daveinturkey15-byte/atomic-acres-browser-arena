# Pass 29 — Dawnfield Public Test Release

Date: 2026-07-18
Status: approved for public testing by Dave
Source branch: `overhaul/pass27-world-identity`
Baseline: `18cbe5791a6fd6bef3fe30a3518dbe4e5e66f512`
Public route: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/>

## Release contents

- Original early-morning sky, warm low sun, cool fill, fog and restrained sky-integrated rays.
- Bounded route, street and interior practical illumination with visible source fixtures.
- Structural room ceilings and improved combat-space readability.
- Deterministic instanced three-blade grass tufts with shader wind and cosmetic local-player bending.
- Performance, Blender and Compatibility profile budgets, bypasses and telemetry.
- Deterministic Pass 29 browser capture, luminance and environment verification tools.
- No gameplay, collision, replay, networking or authoritative RNG role for vegetation or presentation effects.

## Verified release gates

- TypeScript: passed.
- Vitest: 238/238 passed across 51 files.
- Gameplay contract and golden replay: passed; the only approved baseline delta is under rendering lighting fields.
- Production build and release-tree scan: passed.
- Dependency audit: zero vulnerabilities.
- Pass 29 browser matrix: ordinary Blender software bypass, forced Performance wind/interaction, and Compatibility bypass all passed.
- Real two-peer Performance multiplayer: host/join, opposing teams, stance, breakables, combat/death drops, scavenging and weapon pickup replication passed with zero page errors.
- Multiplayer lifecycle: three consecutive create/join/leave cycles passed; a longer local run is not used as a Blender performance claim on the low-spec WSL host.
- Exact final visual evidence is retained locally under ignored `artifacts/pass29/`.

## Hardware interpretation

The Jigglyclaw WSL machine is a low-spec SwiftShader validation host. It is authoritative for builds, deterministic tests, software fallback and compatibility behavior, but not for Blender Render frame-rate acceptance. Dave tests Blender mode on the separate gaming PC.

## Preservation

The release preserves Atomic Signal's linear-HDR → local ACES → one sRGB transfer contract, software bypass, context restoration, FPS safe area, gameplay authority, replay determinism, multiplayer protocol and all existing `review/*` archives.
