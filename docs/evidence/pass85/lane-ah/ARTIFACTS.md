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
| Vault note (animation) | `C:\Users\david\Documents\desky-bootstrap-clone\Dev-Practices\Animation Pipeline Options 2026-09.md` | ~~`e881da8d647002478fccc0f7c4985512f4bdad9072043b76753db001427d5bcf`~~ **WRONG — see the corrected table below** |

> **The session-1 table above is superseded.** One digest in it (the animation note) never matched
> the artefact it named, and two more have legitimately moved since. Use the re-measured table in
> the *Session 3* section at the foot of this file; every row there is checkable against git, not
> only against a working tree the reviewer cannot see.

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


## Session 3 (2026-09-03, skeptic repair) — every digest re-measured, and checkable against git

A skeptic pass found the animation-note digest above did not match its artefact. It was not
drift: the file is clean in vault git, was committed once at `7508f67`, and `git show HEAD:<path>`
hashes identically to disk. No representation of the file — as-is, CRLF-normalised (`a38e2367…`)
or trailing-newline-stripped (`b1e8c722…`) — produces `e881da8d…`, so that value was never
measured against the artefact. Full account in `CORRECTIONS.md` §C2.

Every row below was hashed this session. **Two columns**, because both vault and AKP set
`core.autocrlf=true`: the working tree can be CRLF while the committed blob is LF, and a reviewer
checking with `git show <ref>:<path> | sha256sum` needs the blob column. Where the two agree the
file is LF on disk.

| Artefact | Path | Disk bytes (SHA-256) | Committed blob (SHA-256) | Commit |
|---|---|---|---|---|
| Skill (new, **updated this session**) | vault `Skills\game-development\comfyui-3d-native-pipeline\SKILL.md` | `61202ad0e934552e86c435213da16490015a77ef9497225eabfdb66b2c53f52a` | same | vault `fd7149d` |
| Skill (extended) | vault `Skills\game-development\ai-3d-asset-generation-loop\SKILL.md` | `c411b9d7d50a1dcc4c5e5b41e1f7f9a99558f6f75b208287182b73aaa8c22bc0` | same | vault `7508f67` |
| Vault note (animation) | vault `Dev-Practices\Animation Pipeline Options 2026-09.md` | `b62eb7167ed0bfc7919915a6bef166ff2f6d0a10225c565ee64c2d9bb5fc49ca` | same | vault `7508f67` |
| Eval record (**rewritten this session**) | AKP `skill-evaluations\comfyui-3d-native-pipeline.json` | `36b7979f525d0b24e14db8e7facdbd4f4ad3dd15a5e78a764a8d034456f6d5f2` | same | AKP `de10716` |
| Eval record (updated) | AKP `skill-evaluations\ai-3d-asset-generation-loop.json` | `139e98727fe5fef7178c4b3a6ebbdf807481abb0126974e0346be91566717904` | same | AKP `2644cdb` |
| Canonical register (**row 45 amended this session**) | AKP `references\ai-3d-technique-register.md` | `c25a65253ec3bdc5150e3f4514c8c748f4a877758bfdebfe2e70f7f3fe2956cf` (CRLF) | `0cd8b4f427bbdef04c6824e2754a84685705f5639226fdd56cda29c856eec2b0` (LF) | AKP `de10716` |
| Vault note (register) | vault `Dev-Practices\AI 3D Technique Register.md` | `9e0b719b5fc9759e5f25e203fe80978b2e56a4203aee1edd714c8233ad528e04` (CRLF) | — **uncommitted** | — |

Two rows moved for reasons that are not this lane's doing and are worth naming:

- The **canonical register** is a shared append-only file that several PASS 85–87 lanes write. Its
  digest has changed repeatedly since session 1 (`7cb7f747…` then) and will change again. Pin a
  digest on a shared reference only alongside the commit; the commit is the durable identity.
- The **vault register note** likewise: `2eaa4e78…` → `c57edcd9…` (this lane's session-2 edit) →
  `9e0b719b…` now, other owners having appended since. It remains uncommitted at 505 insertions /
  14 deletions across ten owners' sections — a multi-owner reconciliation, not this lane's to land.

### Row 45's provenance, corrected

`2644cdb`'s subject says "register row 45", but `git show 2644cdb --name-only` lists only the two
eval records. `git log -S "45. Trellis.2 and Pixal3D as CORE ComfyUI nodes"` shows the row's bytes
were introduced by **`8414b3b`** (HF-419's row-47 commit, 2m23s earlier), which swept rows 45–48
together. Content is correct and on `origin/main`; the narrative was not. Corrected forward in AKP
gotcha `c73b7c8`, not by rewriting pushed history. See `CORRECTIONS.md` §C1.

### Line endings, stated correctly

Session 1 asserted "the vault note edit preserved LF". Measured now: that file is **766 CRLF / 0
bare LF on disk**, while its `HEAD` blob is **275 LF / 0 CRLF**. Both repositories set
`core.autocrlf=true`, so the correct form of the claim is *LF in the committed blob, CRLF in the
working tree*. This session's AKP register edit preserved the file's existing convention exactly:
`git diff --stat` reported `2 insertions(+)`, `0 deletions(-)` — no whole-file rewrite.

### Vault push — now VERIFIED, not claimed

`git push --dry-run origin master` (ref advertisement only; no pack sent, nothing written):

```
remote: Write access to repository not granted.
fatal: ... The requested URL returned error: 403
```

Pre-existing credential state on the vault remote, unrelated to this lane. AKP pushes fine —
`git rev-list --left-right --count origin/main...main` = `0 0` after `de10716` and `c73b7c8`.

### Mirror hygiene

Editing the skill made this lane's **own** Qoder mirror stale (REG-7, `61202ad0` canonical vs
`b95258ca` mirror). Repaired by hand-copying the single file **from** canonical —
never `sync_skill_mirrors.py --apply`, which resolves through two junctions and is
newest-wins-by-mtime with write-through (AKP gotcha `8dc73d0`). Register guard 6 → 7 → 6.
