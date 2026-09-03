# Governance guards - before and after Lane AH

Command (both runs, from the AKP root `%LOCALAPPDATA%\hermes\.akephalos`):
`python scripts/technique_register_guard.py check --machine dave-gaming-pc`

Nothing in this lane weakened a guard, a threshold or a policy. The improvement is entirely
from rebuilding the skill flat view and from repairing one register field so a verdict that was
already recorded became machine-visible. Rows and skill counts rise between the two runs because
other PASS 85 lanes were appending to the same register concurrently.

## BEFORE (lane start)

```
FAIL technique-register-guard machine=dave-gaming-pc rows=44 skills=14 problems=47 warnings=3
- [REG-6] row 16 "Text to character animation, locally (kimodo.cpp)" (line 183) names a canonical repository but records no **Licence:** verdict: read the LICENSE file itself, not the API SPDX field, and record the verdict
- [REG-5] row 24 "TAKEN - browser survival horror, dense ground cover and night sky (VOIDMODE)" (line 488) names a canonical repository but pins no 40-hex commit: resolve the repository and append ` @ `<commit>`` to the Canonical field
- [REG-5] row 32 "WAN 2.2 - local text-to-video and image-to-video, Apache 2.0" (line 785) names a canonical repository but pins no 40-hex commit: resolve the repository and append ` @ `<commit>`` to the Canonical field
- [REG-4] carrying skill 'local-video-generation' is absent from the frozen skill baseline; run skill_regression_guard.py accept --skill local-video-generation after writing its evaluation record
- [REG-4] carrying skill 'local-video-generation' has drifted since its evaluation was written (record covers 052cde0f4bd6, disk holds b43d4b3e5a88); re-evaluate and re-accept that skill by name
- [REG-8] carrying skill 'ai-3d-asset-generation-loop' is not mirrored to Codex (C:\Users\david\.codex\skills\ai-3d-asset-generation-loop); copy the canonical directory there, or record an explicit mirror_exemptions entry "ai-3d-asset-generation-loop@Codex" with a reason
- [REG-8] carrying skill 'atomic-acres-asset-authoring' is not mirrored to Codex (C:\Users\david\.codex\skills\atomic-acres-asset-authoring); copy the canonical directory there, or record an explicit mirror_exemptions entry "atomic-acres-asset-authoring@Codex" with a reason
- [REG-8] carrying skill 'atomic-acres-procedural-art-authoring' is not mirrored to Codex (C:\Users\david\.codex\skills\atomic-acres-procedural-art-authoring); copy the canonical directory there, or record an explicit mirror_exemptions entry "atomic-acres-procedural-art-authoring@Codex" with a reason
- [REG-8] carrying skill 'game-animation-asset-pipeline' is not mirrored to Codex (C:\Users\david\.codex\skills\game-animation-asset-pipeline); copy the canonical directory there, or record an explicit mirror_exemptions entry "game-animation-asset-pipeline@Codex" with a reason
- [REG-8] carrying skill 'game-hud-menu-overhaul' is not mirrored to Codex (C:\Users\david\.codex\skills\game-hud-menu-overhaul); copy the canonical directory there, or record an explicit mirror_exemptions entry "game-hud-menu-overhaul@Codex" with a reason
- [REG-8] carrying skill 'img2threejs' is not mirrored to Codex (C:\Users\david\.codex\skills\img2threejs); copy the canonical directory there, or record an explicit mirror_exemptions entry "img2threejs@Codex" with a reason
- [REG-8] carrying skill 'local-video-generation' is not mirrored to Codex (C:\Users\david\.codex\skills\local-video-generation); copy the canonical directory there, or record an explicit mirror_exemptions entry "local-video-generation@Codex" with a reason
- [REG-8] carrying skill 'threejs-frame-loop-audit' is not mirrored to Codex (C:\Users\david\.codex\skills\threejs-frame-loop-audit); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-frame-loop-audit@Codex" with a reason
- [REG-8] carrying skill 'threejs-game-development' is not mirrored to Codex (C:\Users\david\.codex\skills\threejs-game-development); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-game-development@Codex" with a reason
- [REG-8] carrying skill 'threejs-procedural-vegetation' is not mirrored to Codex (C:\Users\david\.codex\skills\threejs-procedural-vegetation); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-procedural-vegetation@Codex" with a reason
- [REG-8] carrying skill 'threejs-rtx-runtime-route' is not mirrored to Codex (C:\Users\david\.codex\skills\threejs-rtx-runtime-route); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-rtx-runtime-route@Codex" with a reason
- [REG-8] carrying skill 'threejs-webgpu-water' is not mirrored to Codex (C:\Users\david\.codex\skills\threejs-webgpu-water); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-webgpu-water@Codex" with a reason
- [REG-8] carrying skill 'visual-gauntlet-loop' is not mirrored to Codex (C:\Users\david\.codex\skills\visual-gauntlet-loop); copy the canonical directory there, or record an explicit mirror_exemptions entry "visual-gauntlet-loop@Codex" with a reason
- [REG-8] carrying skill 'webgpu-tsl-arena-forging' is not mirrored to Codex (C:\Users\david\.codex\skills\webgpu-tsl-arena-forging); copy the canonical directory there, or record an explicit mirror_exemptions entry "webgpu-tsl-arena-forging@Codex" with a reason
- [REG-8] carrying skill 'ai-3d-asset-generation-loop' is not mirrored to Claude Code (C:\Users\david\.claude\skills\ai-3d-asset-generation-loop); copy the canonical directory there, or record an explicit mirror_exemptions entry "ai-3d-asset-generation-loop@Claude Code" with a reason
- [REG-8] carrying skill 'atomic-acres-asset-authoring' is not mirrored to Claude Code (C:\Users\david\.claude\skills\atomic-acres-asset-authoring); copy the canonical directory there, or record an explicit mirror_exemptions entry "atomic-acres-asset-authoring@Claude Code" with a reason
- [REG-8] carrying skill 'atomic-acres-procedural-art-authoring' is not mirrored to Claude Code (C:\Users\david\.claude\skills\atomic-acres-procedural-art-authoring); copy the canonical directory there, or record an explicit mirror_exemptions entry "atomic-acres-procedural-art-authoring@Claude Code" with a reason
- [REG-8] carrying skill 'game-animation-asset-pipeline' is not mirrored to Claude Code (C:\Users\david\.claude\skills\game-animation-asset-pipeline); copy the canonical directory there, or record an explicit mirror_exemptions entry "game-animation-asset-pipeline@Claude Code" with a reason
- [REG-8] carrying skill 'game-hud-menu-overhaul' is not mirrored to Claude Code (C:\Users\david\.claude\skills\game-hud-menu-overhaul); copy the canonical directory there, or record an explicit mirror_exemptions entry "game-hud-menu-overhaul@Claude Code" with a reason
- [REG-8] carrying skill 'img2threejs' is not mirrored to Claude Code (C:\Users\david\.claude\skills\img2threejs); copy the canonical directory there, or record an explicit mirror_exemptions entry "img2threejs@Claude Code" with a reason
- [REG-8] carrying skill 'local-video-generation' is not mirrored to Claude Code (C:\Users\david\.claude\skills\local-video-generation); copy the canonical directory there, or record an explicit mirror_exemptions entry "local-video-generation@Claude Code" with a reason
- [REG-8] carrying skill 'threejs-frame-loop-audit' is not mirrored to Claude Code (C:\Users\david\.claude\skills\threejs-frame-loop-audit); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-frame-loop-audit@Claude Code" with a reason
- [REG-8] carrying skill 'threejs-game-development' is not mirrored to Claude Code (C:\Users\david\.claude\skills\threejs-game-development); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-game-development@Claude Code" with a reason
- [REG-8] carrying skill 'threejs-procedural-vegetation' is not mirrored to Claude Code (C:\Users\david\.claude\skills\threejs-procedural-vegetation); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-procedural-vegetation@Claude Code" with a reason
- [REG-8] carrying skill 'threejs-rtx-runtime-route' is not mirrored to Claude Code (C:\Users\david\.claude\skills\threejs-rtx-runtime-route); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-rtx-runtime-route@Claude Code" with a reason
- [REG-8] carrying skill 'threejs-webgpu-water' is not mirrored to Claude Code (C:\Users\david\.claude\skills\threejs-webgpu-water); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-webgpu-water@Claude Code" with a reason
- [REG-8] carrying skill 'visual-gauntlet-loop' is not mirrored to Claude Code (C:\Users\david\.claude\skills\visual-gauntlet-loop); copy the canonical directory there, or record an explicit mirror_exemptions entry "visual-gauntlet-loop@Claude Code" with a reason
- [REG-8] carrying skill 'webgpu-tsl-arena-forging' is not mirrored to Claude Code (C:\Users\david\.claude\skills\webgpu-tsl-arena-forging); copy the canonical directory there, or record an explicit mirror_exemptions entry "webgpu-tsl-arena-forging@Claude Code" with a reason
- [REG-8] carrying skill 'ai-3d-asset-generation-loop' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\ai-3d-asset-generation-loop); copy the canonical directory there, or record an explicit mirror_exemptions entry "ai-3d-asset-generation-loop@Antigravity" with a reason
- [REG-8] carrying skill 'atomic-acres-asset-authoring' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\atomic-acres-asset-authoring); copy the canonical directory there, or record an explicit mirror_exemptions entry "atomic-acres-asset-authoring@Antigravity" with a reason
- [REG-8] carrying skill 'atomic-acres-procedural-art-authoring' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\atomic-acres-procedural-art-authoring); copy the canonical directory there, or record an explicit mirror_exemptions entry "atomic-acres-procedural-art-authoring@Antigravity" with a reason
- [REG-8] carrying skill 'game-animation-asset-pipeline' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\game-animation-asset-pipeline); copy the canonical directory there, or record an explicit mirror_exemptions entry "game-animation-asset-pipeline@Antigravity" with a reason
- [REG-8] carrying skill 'game-hud-menu-overhaul' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\game-hud-menu-overhaul); copy the canonical directory there, or record an explicit mirror_exemptions entry "game-hud-menu-overhaul@Antigravity" with a reason
- [REG-8] carrying skill 'img2threejs' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\img2threejs); copy the canonical directory there, or record an explicit mirror_exemptions entry "img2threejs@Antigravity" with a reason
- [REG-8] carrying skill 'local-video-generation' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\local-video-generation); copy the canonical directory there, or record an explicit mirror_exemptions entry "local-video-generation@Antigravity" with a reason
- [REG-8] carrying skill 'threejs-frame-loop-audit' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\threejs-frame-loop-audit); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-frame-loop-audit@Antigravity" with a reason
- [REG-8] carrying skill 'threejs-game-development' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\threejs-game-development); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-game-development@Antigravity" with a reason
- [REG-8] carrying skill 'threejs-procedural-vegetation' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\threejs-procedural-vegetation); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-procedural-vegetation@Antigravity" with a reason
- [REG-8] carrying skill 'threejs-rtx-runtime-route' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\threejs-rtx-runtime-route); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-rtx-runtime-route@Antigravity" with a reason
- [REG-8] carrying skill 'threejs-webgpu-water' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\threejs-webgpu-water); copy the canonical directory there, or record an explicit mirror_exemptions entry "threejs-webgpu-water@Antigravity" with a reason
- [REG-8] carrying skill 'visual-gauntlet-loop' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\visual-gauntlet-loop); copy the canonical directory there, or record an explicit mirror_exemptions entry "visual-gauntlet-loop@Antigravity" with a reason
- [REG-8] carrying skill 'webgpu-tsl-arena-forging' is not mirrored to Antigravity (C:\Users\david\.gemini\config\skills\webgpu-tsl-arena-forging); copy the canonical directory there, or record an explicit mirror_exemptions entry "webgpu-tsl-arena-forging@Antigravity" with a reason
WARN [REG-5] row 5 "Local H3 video to sprite animation" (line 72) has no **Canonical:** field; record `Canonical: none - <why>` explicitly so 'unresolved' is distinguishable from 'never looked'
WARN [REG-2] row 8 "Fully procedural jungle (same author, earlier)" (line 108) records no **Owner-shared:** provenance line
WARN [REG-5] row 31 "Rigged first-person arms, CC0 (para / OpenGameArt)" (line 758) has no **Canonical:** field; record `Canonical: none - <why>` explicitly so 'unresolved' is distinguishable from 'never looked'
```

## AFTER (lane end)

```
FAIL technique-register-guard machine=dave-gaming-pc rows=49 skills=17 problems=13 warnings=3
- [REG-5] row 24 "TAKEN - browser survival horror, dense ground cover and night sky (VOIDMODE)" (line 488) names a canonical repository but pins no 40-hex commit: resolve the repository and append ` @ `<commit>`` to the Canonical field
- [REG-5] row 32 "WAN 2.2 - local text-to-video and image-to-video, Apache 2.0" (line 785) names a canonical repository but pins no 40-hex commit: resolve the repository and append ` @ `<commit>`` to the Canonical field
- [REG-6] row 49 "MotionBricks - a realtime motion PLANNER, with Kimodo as its authoring input (motion-bricks.cpp)" (line 1234) names a canonical repository but records no **Licence:** verdict: read the LICENSE file itself, not the API SPDX field, and record the verdict
- [REG-4] carrying skill 'threejs-webgpu-water' has drifted from the frozen baseline and is unaccepted; write the paired evaluation record, then accept only this skill by name
- [REG-4] carrying skill 'ai-3d-asset-generation-loop' has drifted from the frozen baseline and is unaccepted; write the paired evaluation record, then accept only this skill by name
- [REG-4] carrying skill 'local-video-generation' is absent from the frozen skill baseline; run skill_regression_guard.py accept --skill local-video-generation after writing its evaluation record
- [REG-4] carrying skill 'local-video-generation' has drifted since its evaluation was written (record covers 052cde0f4bd6, disk holds b43d4b3e5a88); re-evaluate and re-accept that skill by name
- [REG-4] carrying skill 'comfyui-3d-native-pipeline' is absent from the frozen skill baseline; run skill_regression_guard.py accept --skill comfyui-3d-native-pipeline after writing its evaluation record
- [REG-4] carrying skill 'open-world-city-art-loop' is absent from the frozen skill baseline; run skill_regression_guard.py accept --skill open-world-city-art-loop after writing its evaluation record
- [REG-4] carrying skill 'threejs-webgpu-interior-lighting-look' is absent from the frozen skill baseline; run skill_regression_guard.py accept --skill threejs-webgpu-interior-lighting-look after writing its evaluation record
- [REG-8] carrying skill 'open-world-city-art-loop' is not mirrored to Qoder (C:\Users\david\.qoder\skills\open-world-city-art-loop); copy the canonical directory there, or record an explicit mirror_exemptions entry "open-world-city-art-loop@Qoder" with a reason
- [REG-7] 'threejs-webgpu-water' mirror for Qoder disagrees with canonical at SKILL.md (fa301c1b1ef4 canonical vs 1adc553a3dc3 mirror); re-copy from C:\Users\david\AppData\Local\hermes\skills\game-development\threejs-webgpu-water rather than editing the mirror
- [REG-9] vault note AI 3D Technique Register.md does not name carrying skill 'open-world-city-art-loop'; the vault copy is stale against the register and a new agent entering through Obsidian will not find it
WARN [REG-5] row 5 "Local H3 video to sprite animation" (line 72) has no **Canonical:** field; record `Canonical: none - <why>` explicitly so 'unresolved' is distinguishable from 'never looked'
WARN [REG-2] row 8 "Fully procedural jungle (same author, earlier)" (line 108) records no **Owner-shared:** provenance line
WARN [REG-5] row 31 "Rigged first-person arms, CC0 (para / OpenGameArt)" (line 758) has no **Canonical:** field; record `Canonical: none - <why>` explicitly so 'unresolved' is distinguishable from 'never looked'
```

## What changed, and who owns it

| Finding class | Before | After | Cause |
|---|---|---|---|
| REG-8 mirror gaps | 42 | see AFTER | `~/.agents/skills` - the flat view three harnesses junction into - was **empty**. `link_skills.ps1 -VerifyOnly` reported `0/159` for Claude Code, Codex, dsh, Continue and Antigravity, and its read-through probe FAILED: no skill was discoverable to any of them. Rebuilt with `link_skills.ps1`: **160/160 on all seven roots**, probe OK. |
| REG-6 row 16 | 1 | 0 | Row 16's licence verdict was written `- **Licence: CLEAR - Apache-2.0 ...**` with the colon inside the bold, so the guard's field parser never saw it. Repaired to `- **Licence:** **CLEAR - ...**`. Content byte-identical apart from the two asterisks. |
| REG-4 for this lane's two skills | n/a | still failing | **Blocked, not skipped** - see the lane report. The scoped accept refuses because three unrelated skills carry descriptions over the 360-char policy ceiling. Raising the ceiling would be weakening the gate and was not done. |
| Residual REG-4/5/7/8/9 rows | pre-existing | pre-existing + other lanes' | Not this lane's rows. `open-world-city-art-loop`, `threejs-webgpu-water` and `local-video-generation` belong to other owners. |


## SESSION 2 (2026-09-03, lane resumed) — the §7 blocker cleared, and one more row closed

Same command, same machine. Between session 1 and session 2 the three over-length skill
descriptions named in the lane report's §7 were shortened by their owners (the patch this lane
supplied was applied to `gem-nano-agent-debug`, `wow-spp-local-mod-restore` and
`game-release-benchmark-guard` in the vault working tree), which unblocked every skill accept on
this machine. No ceiling was raised; the policy is untouched at 360 chars.

```
FAIL technique-register-guard machine=dave-gaming-pc rows=49 skills=17 problems=9 warnings=3   <- session 2 start
FAIL technique-register-guard machine=dave-gaming-pc rows=49 skills=17 problems=8 warnings=3   <- session 2 end
```

| Item | Session 1 start | Session 1 end | Session 2 start | Session 2 end |
|---|---|---|---|---|
| `technique_register_guard` problems | 47 | 14 | 9 | **8** |
| `link_skills.ps1 -VerifyOnly` | 0/159, probe FAILED | 160/160, probe OK | — | **162/162 on all seven roots, probe OK** |

### Lane AH's two skills are now accepted and frozen — VERIFIED

Both REG-4 rows for this lane's skills are gone from the guard output, and both skills are present
in `skill-baseline.json` (150 skills) with their description hashes:

- `comfyui-3d-native-pipeline` — `description_sha256 0dd63a136114098d0c52773a15da85be593756222220e4e0d17f303a147debe1`
- `ai-3d-asset-generation-loop` — `description_sha256 2378ee8b00860fc9159bd8974195ede603b81d233ccf6518fbb72a5376fb3731`

### REG-9 closed by this lane in session 2

`[REG-9] vault note AI 3D Technique Register.md does not name carrying skill 'open-world-city-art-loop'`
is gone. The vault note now carries a `2026-09-02 intake (row 47)` section that names the skill,
restated from canonical register row 47 (lines 1105-1167) — no new claims, no content invented.
This follows the note's own documented rule for REG-9: *"the fix is always to name the skill, never
to drop the row."* Guard 9 -> 8.

### Residual 8 problems — none belong to Lane AH

`threejs-webgpu-water` (REG-4 x2, REG-7 Qoder mirror) and `local-video-generation` (REG-4 x2) are
other owners' skills; `open-world-city-art-loop@Qoder` (REG-8) is HF-419's mirror; rows 24 and 32
(REG-5 commit pins) are older rows. Per the standing rule these were reported, not swept.

### ComfyUI re-checked, still read-only

`GET /queue` -> `{"queue_running": [], "queue_pending": []}` (idle). The Trellis.2 / Pixal3D
weights are **still absent** from `models/diffusion_models/` and `models/vae/`, so the brief's
step 5 bounded test remains blocked on a ~9.95 GB download into the owner's install — his call,
not a lane's. His ComfyUI was not updated, restarted or queued in this session either.
