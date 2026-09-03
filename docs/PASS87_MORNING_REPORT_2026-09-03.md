# Morning report — 2026-09-03 (Claude Code, Fable 5.1 orchestrating; every worker Opus 5.1)

DRAFT written 03:10 BST; the PASS 87 section is completed at the cut. Live state
and every ledger row are in `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`.

## What is live and what to try first
- **PASS 86 (live since 00:50)**: NUKE TOWN REBUILD · PREVIEW card (host it with
  friends; the shipped Nuke Town is untouched), MAP 3 · EXPLORE card (walk eight
  corridors; the showcase page is at `channels/pass8N/map3.html`, linked from
  the menu), the first-person rig fitted inside the body, drop shots (hold
  crouch while firing), the Firing Range netting floor, arms/knife in frame.
- **PASS 87**: see the section at the end (filled at the cut).

## The night, honestly
- Three publishes: PASS 85 20:12, PASS 86 00:50 (the 22:20 job never fired:
  scheduled jobs do not fire in this session; from then on timers were used),
  PASS 87 at the end of this file.
- A usage limit at ~22:05 killed most running agents; everything was relaunched
  from journals and worktrees after 22:10. Machine care: commit charge hit
  100 GB at 02:45 (orphaned preview servers and the known service-host leak),
  cleaned back to 84 GB; your ComfyUI/ollama/llama.cpp were never touched.

## Owner asks from 2026-09-02, by state
| Row | Ask | State |
|---|---|---|
| HF-395/396/397/398/401/402/403/406 | clip residue, rails, pullback, EBR, chopper lag, spawns, lobby, badge | shipped PASS 84 |
| HF-399 | Quality-profile fps | partial in 84; residual attributed (viewmodel solver, minimap) → Lane T held, AR carries minimap 30 Hz |
| HF-404 | smooth in Chrome/Edge/Firefox | headless gate exists; Firefox needs your manual check (`docs/HF404_FIREFOX_MANUAL_CHECK.md`) |
| HF-405/409 | Map 3 registered / explore showcase | shipped PASS 86 (explore kind, honest HUD, in-channel page, warmup deadlock fixed) |
| HF-407 | Nuke Town rebuild to the BO2 flow | shipped PASS 86 as PREVIEW (bus on the origin, 2x core on its roof, sheds, rare gun, back-yard spawns) |
| HF-408 | Raid layout rethink | Lane AQ built `raid2` (measured: sightlines 9.97 → 13.62 m, masses 59 → 34, roofed 36.7% → 21.9%); PASS 87 if integrated green — see below |
| HF-410 | viewmodel rework | shipped PASS 86 (near plane 0.02 m on measured evidence) |
| HF-411/412/413 | grating, drop shots, arms | shipped PASS 85 (arms partial: 2 honest left-sleeve reds remain) |
| HF-414/415/418 | graphics profiles clarity, DLSS research, Balanced + RTX explainer | Lane AI done: Balanced profile, RTX explainer modal, 5×3 ladder measured; PASS 87 if merged |
| HF-416 | brief-with-rules skill + Map 3 corridor | the GTA-art trial exercised the method in Map 3; the full AJ corridor lane is daytime work |
| HF-417 | Gun Range unreachable by map switch | root cause found (fence-exceed class on switch); Lane H's fix regressed first loads and was held; Lane H2 running |
| HF-419..422 | GTA art, water everywhere, subway lighting, Motion bricks | four skills authored in the vault + register rows; Map 3 trials — see below |
| HF-423 | Farcrysis sorted | merged for PASS 87 as PREVIEW (admission 1.28× the Nuke Town control; combat frame time 1.34–1.89× is the next lever) |

## Decisions that are yours
1. Promote NUKE TOWN REBUILD, RAID REBUILD and FARCRYSIS out of PREVIEW after you play them.
2. BALANCED as the auto-selected default on mid-range machines (currently Quality at 8+ cores / 8+ GB).
3. Chopper ghost-culling gate assertion (activeModelLayers vs submittedModelLayers); HF-334 flamethrower grant.
4. Meta's SAM licence forbids gun-related use: the ComfyUI video-mocap chain (SAM3D body) is therefore NOT to be used for this game unless you decide otherwise; Trellis.2/Pixal3D themselves are MIT.
5. Raid Rebuild's art pass (Lane L is shelved at your word; the rebuild is flat untextured albedo).

## Your manual checks
- Firefox: `docs/HF404_FIREFOX_MANUAL_CHECK.md`.
- Phone: Lane AE's checklist (path filled at the cut).

## Skills and techniques added tonight (vault store + AKP register)
- `open-world-city-art-loop` (GTA-style street art: street-cell decomposition, screen-area ordering, originality boundary; the reference itself runs at 18–20 fps).
- `threejs-webgpu-water` (extended: multi-cascade FFT, Beer-Lambert colour, bubble backscatter, breaking foam, per-arena water rosters).
- `threejs-webgpu-interior-lighting-look` (subway look without GI: emissive fixtures, value composition, fog falloff, grime decals, filmic post).
- Motion bricks: `motion-bricks.cpp` (GGML port of NVIDIA's motion model) vs our Komodo route — see the animation trial.
- `comfyui-3d-native-pipeline` (ComfyUI 0.34.0 already has native Trellis.2/Pixal3D; weights ~10–15 GB not installed; licence findings recorded).
- Skill discovery had been dead machine-wide (0/159 in every harness but Hermes) and was restored (160/160).

## PASS 87 — filled at the cut
(merge set, gates, publish receipt, live check, what was held and why, next-work options with ETAs)
