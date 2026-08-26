# OpenGameArt CC0 FPS Arms — Atomic Acres Pass 19

## Source

- **Asset:** `fps arms (rigged only)`
- **Creator:** para
- **Source page:** https://opengameart.org/content/fps-arms-rigged-only
- **Original archive:** https://opengameart.org/sites/default/files/fps%20arms.7z
- **Retrieved:** 2026-07-14
- **Licence:** CC0 1.0 / Public Domain Dedication

## Source integrity

- Original archive SHA-256: `31f6c7bd5caea8856c4aafca8461f38a3c8bfdd3d8f05c898e403b9475e54562`
- Extracted FBX SHA-256: `8aeb5a2e5ee6277ecc40e99a6dc5034b0fff321ef6d86f53e10b3461fdbae35b`
- Extracted source diffuse SHA-256: `f7a67f1c8f72294dc54ddea96253522dabdee99838746d6fb695eeef46120b63`

The original archive also contains Blender source and a test-animation FBX. Atomic Acres ships only the static rig FBX and source diffuse needed for provenance and deterministic texture generation. No scripts or executables were present.

## Static technical audit

- FBX 7.4 binary
- one skinned mesh
- 4,103 vertices / 16,304 polygon indices / 4,076 polygons
- both upper-arm, forearm, hand, palm, thumb, and three-joint finger chains
- 50 skin clusters plus one skin deformer
- one UV set and one material slot
- no animation stacks
- no embedded Texture/Video object and no external texture filename reference
- one 1024×1024 source diffuse supplied beside the FBX

## Atomic Acres modifications

`FPS_ARMS_RIG_1.fbx` is preserved unchanged. `scripts/generate-pass19-viewmodel-textures.py` labels the disconnected UV components and deterministically replaces the old photographic skin diffuse with:

- navy textile sleeves;
- dark tactical gloves;
- a separate roughness map;
- an audit contact sheet.

Generated runtime albedo: `new_diff.png`. The FBX does not reference a texture filename, so Atomic Acres must assign this albedo and `atomic_arms_roughness.png` explicitly at runtime.

The asset is a **candidate foundation**, not automatically approved production art. It must pass the in-engine first-person framing, deformation, grip-contact, action-pose, and owner A/B gates before replacing the procedural fallback.
