# Lane AH artefacts — paths and digests

These artefacts live in the AKP passport and the Obsidian vault, not in this repository.
They are listed here with SHA-256 so a reviewer working only from the repo can confirm they
are reading the same bytes this lane shipped.

| Artefact | Path | SHA-256 |
|---|---|---|
| Skill (new) | `C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\comfyui-3d-native-pipeline\SKILL.md` | `b95258caf3cc35c48e12f2382213e81a335ed23cec90194a254587374f6e6960` |
| Skill (extended) | `C:\Users\david\Documents\desky-bootstrap-clone\Skills\game-development\ai-3d-asset-generation-loop\SKILL.md` | `c411b9d7d50a1dcc4c5e5b41e1f7f9a99558f6f75b208287182b73aaa8c22bc0` |
| Eval record (new) | `C:\Users\david\AppData\Local\hermes\.akephalos\skill-evaluations\comfyui-3d-native-pipeline.json` | `62c872970c9f6bb6cefe2de1ee78a2464c698898ab1843c62c7b3602e495d302` |
| Eval record (updated) | `C:\Users\david\AppData\Local\hermes\.akephalos\skill-evaluations\ai-3d-asset-generation-loop.json` | `139e98727fe5fef7178c4b3a6ebbdf807481abb0126974e0346be91566717904` |
| Canonical register | `C:\Users\david\AppData\Local\hermes\.akephalos\references\ai-3d-technique-register.md` | `7cb7f7479f4e4f0b0a1f659834c26d7c43a3dddbc8690c7a24bc73d289d1415d` |
| Vault note (register) | `C:\Users\david\Documents\desky-bootstrap-clone\Dev-Practices\AI 3D Technique Register.md` | `e42ee7669ea72d323bf3639059e27cc6b41f67665356adb62cd723248b64c27a` |
| Vault note (animation) | `C:\Users\david\Documents\desky-bootstrap-clone\Dev-Practices\Animation Pipeline Options 2026-09.md` | `e881da8d647002478fccc0f7c4985512f4bdad9072043b76753db001427d5bcf` |

## Flat-view distribution

`comfyui-3d-native-pipeline` is discoverable to Claude Code, OMP, Codex, dsh, Continue,
Antigravity (junctions into `~/.agents/skills`, 160/160 verified) and Hermes (nested), plus an
explicit copy at `~/.qoder/skills/comfyui-3d-native-pipeline` because the Qoder root is a real
directory rather than a junction.

## Not in this repository, deliberately

No game source was touched. No asset was generated, so `assets.manifest.json` and
`qa:asset-provenance` are unchanged and no provenance row was added.
