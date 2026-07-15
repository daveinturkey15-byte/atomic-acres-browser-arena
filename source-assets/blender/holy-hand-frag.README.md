# Sanctified Frag — Original Blender Source

This directory contains the editable source for Atomic Acres' **Sanctified Frag**, an original ceremonial grenade authored for the project on 2026-07-15.

## Provenance

- **Authoring method:** deterministic Blender Python geometry executed through the locally installed Blender MCP addon.
- **Creation script:** `scripts/blender/create-holy-hand-frag.py`
- **Blender version:** 4.0.2
- **MCP addon:** `ahujasid/blender-mcp`, pinned to commit `6641189231caf3752302ae20591bc87fda85fc4e` for the setup used during authoring.
- **Commercial assets:** none.
- **Downloaded model or texture inputs:** none.
- **External image textures:** none. All six materials are procedural Principled BSDF values embedded in the GLB.
- **Creative scope:** an original gold-and-ivory comedy-fantasy ceremonial grenade. It uses the broad requested theme without extracting or reproducing a Worms model.

## Files

- `holy-hand-frag.blend` — editable Blender source.
- `../../public/assets/original/models/holy-hand-frag.glb` — game-ready glTF 2.0 binary.
- `../../scripts/blender/create-holy-hand-frag.py` — deterministic construction/export script.
- `../../artifacts/holy-hand-frag/holy-hand-frag-preview.png` — local review render; artifacts are not part of the deploy tree.
- `../../artifacts/holy-hand-frag/holy-hand-frag-ingame.png` — local controlled gameplay capture; artifacts are not part of the deploy tree.

## Checksums

```text
a6d09d628cd4f5cef0b973a357cde65a40e4df08cd9a492ceb77ccce31e8a678  scripts/blender/create-holy-hand-frag.py
892a7e0fe08d24e3d743843b3642c2453715f69875af1bcad6a098c59fdba80c  public/assets/original/models/holy-hand-frag.glb
2312c8a20e7f9ec5227127dc3775f727bed263c157bc13e2bc48a8f592023e48  source-assets/blender/holy-hand-frag.blend
```

## Rebuild

From the repository root, either run the script directly through Blender:

```bash
blender --background --python scripts/blender/create-holy-hand-frag.py
```

or send the exact script text to the local Blender MCP `execute_code` operation on `127.0.0.1:9876`.

The Ubuntu Blender 4.0.2 glTF exporter requires the distro package `python3-numpy`; without it export fails with `ModuleNotFoundError: No module named 'numpy'`.

## Runtime Contract

`src/grenade-presentation.ts` preloads the GLB once and clones its scene for each throw. The model is presentation-only and cannot intercept gameplay raycasts. Atomic Acres continues to own the authoritative throw velocity, gravity, collision sweep, bounce response, 2,300 ms fuse, damage, and explosion effects. If the GLB cannot load, an original primitive fallback is used instead.
