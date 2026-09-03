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


## Session 2 (2026-09-03) — changed artefact

| Artefact | Path | SHA-256 before | SHA-256 after |
|---|---|---|---|
| Vault note (register) | `C:\Users\david\Documents\desky-bootstrap-clone\Dev-Practices\AI 3D Technique Register.md` | `2eaa4e789b118d657b4fcbf9c7df0c8c740f86c1ba511eea7289831a9319205e` | `c57edcd92927e10db94457c6c82043e8f76d66dc8ad41a535218e54380eb255a` |

The only change is an inserted `## 2026-09-02 intake (row 47)` section naming the carrying skill
`open-world-city-art-loop`, which closes REG-9. Written with `newline=''` and asserted free of
CRLF before and after; the file is LF on disk, 667 -> 709 lines.

**This file is committed nowhere yet, and deliberately so.** `git diff` on it shows **505
uncommitted insertions across ten `##` sections** dating back to the 2026-08-24 intake — the work
of many sessions, including this lane's own row 45 section, none of it committed. Committing the
path would publish nine other owners' prose under this lane's authorship, so it was not done. The
vault working tree *is* the Obsidian vault every agent reads, so the discovery fix is live
regardless; only the git history is outstanding, and the vault remote refuses writes anyway
(HTTP 403, pre-existing). Exact command for whoever owns the reconciliation:

```
cd C:/Users/david/Documents/desky-bootstrap-clone
git add "Dev-Practices/AI 3D Technique Register.md"
git commit -m "Vault register note: intake sections for rows 34-49 (multi-lane, PASS 85-87)"
```

The two skills and the animation note this lane authored **are** committed, at vault `7508f67`.
