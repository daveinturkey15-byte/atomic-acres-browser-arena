# Morning report — 2026-09-03 (Claude Code, Fable 5.1 orchestrating; every worker Opus 5.1)

Written 04:45 BST, updated 05:05 after PASS 88. Live state and every ledger row are in
`docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`; cut reports in
`docs/PASS86_CUT_REPORT_2026-09-02.md` and `docs/PASS87_CUT_REPORT_2026-09-03.md`.

## Play this first (PASS 88, live since 04:59; PASS 87 is the safe backup)
- **PASS 88 (04:59)** adds Lane H2 on top of PASS 87: every one of the 56 in-session arena switches stays inside the compile fence (the HF-417 class), and a cold first load of Gun Range or High Seas is back to its PASS 86 time - the first attempt at this fix had made them up to half slower and was held. Match admission (the 14-20 s from deploy to playing) is now attributed step by step for the next cut. Paired whole-switch time is ~0.5 s slower at the median; that residual is next.
- **RAID REBUILD · PREVIEW** — the layout answer to "loads of walls": the
  shipped Raid had the shortest sightlines of any combat arena (mean open line
  9.97 m) because its cover was 59 small masses; the rebuild has 34 bigger ones,
  mean open line 13.62 m, a 25.65 m long-axis median, 22% roofed ground instead
  of 37%, all four upper rooms reachable, and cover you can actually see. Flat
  first-pass style; the art pass is yours to schedule (Lane L stays shelved).
- **FARCRYSIS · PREVIEW** — back on the menu: spawns solved on the terrain, a
  ground you can shoot over (56% of shots used to die at the muzzle), admission
  measured at 1.3x Nuke Town's. In-combat frame time is 1.3-1.9x Nuke Town's;
  the lever (224 vs 110 distinct materials) is the next job.
- **NUKE TOWN REBUILD · PREVIEW** (PASS 86) — built to the Black Ops 2 flow:
  back-yard spawns, the bus on the origin with the 2x core on its roof (now
  needs a real line of sight, not a height window), open trucks and closed cars
  as cover, the sheds, the rare gun in the front upper rooms. Host it with
  friends.
- **MAP 3 · EXPLORE** (PASS 86) — eight showcase corridors incl. the Rapier
  physics playground, an honest HUD (no clock, ESC to menu), and the showcase
  page inside the channel (`channels/pass87/map3.html`, linked from the menu).
  A P0 was found and fixed on the way: the arena sat frozen in warmup forever.
- Also since last night: the first-person rig inside the body (no gun through
  walls, near plane 0.02 m on measured evidence), drop shots (hold crouch while
  firing), Firing Range netting floor, arms and knife in frame, the crowded menu
  fixed for eleven cards, bots that crouch under fire and go prone when hurt,
  minimap at 30 Hz, the mobile PAUSE tap fixed, the collapsed Advanced Graphics
  panel no longer laying out over the Options below it.

## Three publishes, honestly
| Pass | Live | Contents | Backup |
|---|---|---|---|
| 85 | 20:12 | drop shots, netting floor, arms/knife | 84 |
| 86 | 00:50 (the 22:20 job never fired; cut by hand) | Nuke Town Rebuild, Map 3 explore, viewmodel fit, eye clearance, QA corpus, IBL | 85 |
| 87 | 04:35 | Raid Rebuild, Farcrysis, residuals, mobile, release CI | 86 |
| 88 | 04:59 | H2 load-time second pass (switch fence fixed, first loads restored) | 87 |

Gates on every cut: tsc, the full vitest suite (5419 tests at PASS 88), the
release contracts, the identity check, a headless Chrome boot smoke of every
arena (13/13 on PASS 87 and again on PASS 88, eleven arenas), and for Farcrysis a
new admission-evidence guard the publish script enforces (receipt ratio 1.30
and 1.37 against the Nuke Town control). Not run tonight: the cross-browser
smoothness gate (the machine carried six lanes all night) and the pipeline
tripwire on the exact published bundle (measured 0 on the lanes' own runs).

Process: scheduled jobs do not fire in this session (the 19:13 and 22:20 cuts
were missed), so timers replaced them; a usage limit at ~22:05 killed most
agents and everything was relaunched from journals; the commit charge hit
100 GB at 02:45 (orphaned preview servers + the known service-host leak) and
was cleaned to 84 GB; your ComfyUI/ollama/llama.cpp were never touched.

## Owner asks from 2026-09-02, by state
| Row | Ask | State |
|---|---|---|
| HF-395..398, 401..403, 406 | clip residue, rails, pullback, EBR, chopper lag, spawns, lobby, badge | shipped PASS 84 |
| HF-399 | Quality-profile fps | partial in 84; minimap 30 Hz in 87; viewmodel solver cache in 86; the periodic-stall lane held (its threshold moved the permissive way) |
| HF-404 | smooth in Chrome/Edge/Firefox | headless gate exists; Firefox needs your manual check (`docs/HF404_FIREFOX_MANUAL_CHECK.md`) |
| HF-405/409 | Map 3 explore showcase | shipped PASS 86 |
| HF-407 | Nuke Town rebuild to the BO2 flow | shipped PASS 86 as PREVIEW |
| HF-408 | Raid layout rethink | shipped PASS 87 as PREVIEW |
| HF-410 | viewmodel rework | shipped PASS 86 |
| HF-411/412/413 | grating, drop shots, arms | shipped PASS 85 (arms: 2 honest left-sleeve reds remain; cause measured, fix proposed) |
| HF-414/415/418 | graphics ladder, DLSS research, Balanced + RTX explainer | BUILT (Lane AI: Balanced profile, RTX explainer modal, 5x3 ladder measured on an RTX 5080) — not merged tonight; first thing this morning |
| HF-416 | brief-with-rules skill + Map 3 corridor | the GTA-art trial exercised the method; the full corridor lane is daytime work |
| HF-417 | Gun Range unreachable by map switch | root cause: a fence-exceed class on in-session switches (atomic-acres -> high-seas, not Gun Range specifically); Lane H2 fixes it WITHOUT the first-load regression the first pass had — SHIPPED PASS 88 |
| HF-419..422 | GTA art, water everywhere, subway lighting, Motion bricks | four skills in the vault + register rows; Map 3 trials done or in repair (see below) |
| HF-423 | Farcrysis sorted | shipped PASS 87 as PREVIEW |

## Skills and techniques (vault store + AKP register, all governed)
- `open-world-city-art-loop` — GTA-style street art as a street-cell loop with a
  screen-area ordering (road surface first, then kerbs, then facade bays, then
  furniture density); the reference itself runs at 18-20 fps, so it is a
  screenshot bar, not a gameplay target. Map 3 trial (corridor 3 street cell):
  +8 draws against a budget of 12, accepted with fixes; verdict "Map 3 only"
  until value separation (carriageway vs frontage) and the operator-readability
  check close. Feeds the Raid Rebuild and Nuke Town art passes.
- `threejs-webgpu-water` (extended) — multi-cascade FFT waves, Beer-Lambert
  colour, bubble backscatter, breaking foam, shoreline and swimmable volume,
  per-arena water rosters. Map 3 trial: a shared water module with a Map 3 pond,
  accepted with fixes, partial. Two things you should know: the physical colour
  model is NOT enabled on any shipped ocean yet (RustRig, High Seas, Farcrysis
  keep their look), and the pond-in-every-level rollout (Nuke Town, Skyline
  first) is the owed step - its roster test fails until they exist.
- `threejs-webgpu-interior-lighting-look` — the subway look without GI: emissive
  fixtures, value composition, fog falloff, grime decals, a filmic post chain,
  combat readability kept. Map 3 corridor trial: the harness and the arena route landed; the
  per-profile frame-time table is still unmeasured, so the skeptic kept it at
  REJECT for now. Merge candidate once that table exists.
- Motion bricks = `motion-bricks.cpp` (a GGML port of NVIDIA's motion model).
  The animation trial retargeted its output onto the operator rig and reached a
  NO-GO for now on measured foot slide versus our Komodo route; the honest
  finding for skins/bots: the third-person operator rig has NO reload, crouch,
  prone, ADS or knife clip at all, and four measured Kimodo clips never shipped.
  That is the real animation job.
- `comfyui-3d-native-pipeline` — your ComfyUI 0.34.0 already has native
  Trellis.2/Pixal3D (no update needed; weights ~10-15 GB not installed). Licence
  findings: the generators are MIT; the Comfy-Org repacks carry no LICENSE file;
  the image encoder is DINOv3 under Meta's licence; Meta's SAM licence forbids
  gun-related use, so the video-mocap chain is off the table unless you decide
  otherwise.
- Skill discovery was dead machine-wide (0/159 in every harness but Hermes)
  and was restored (160/160); a gotcha about the two link scripts is in AKP.

## Not merged tonight (all ACCEPT_WITH_FIXES unless said; branches are pushed)
- **AI** graphics ladder (Balanced profile, RTX explainer modal, 5x3 ladder measured): merge first thing.
- **AB** dynamic lighting (time of day on every arena as uniform writes, a host-authoritative TIME OF DAY lobby row, design doc): repair/audit finished after the cut.
- **AL** lighting tiers (offline path-traced SH-L1 probe volume, digest-cached, TSL baked-indirect node, per-profile tiers; LOW costs +0.7% median; zero pipelines at admission): skeptic REJECT on two runtime blockers (digest never re-derived after first bind; the 3 ms bake budget not enforced), repaired; audit clean. Merge after re-checking those two.
- **Technique trials** (AP, AM, AN, AO): audit clean except one two-hunk conflict in src/map3/corridors.ts; AO's recommendation is to land the analysis and tools but NOT spend a day on the MotionBricks C++ build.
- **Lane T** stall instruments (its threshold moved the permissive way; re-land without that change).

## Decisions that are yours
1. Promote NUKE TOWN REBUILD, RAID REBUILD and FARCRYSIS out of PREVIEW after you play them.
2. BALANCED as the auto-selected default on mid-range machines (currently Quality at 8+ cores / 8+ GB).
3. Chopper ghost-culling gate assertion; HF-334 flamethrower grant.
4. Raid Rebuild's art pass (Lane L shelved at your word; the rebuild is flat untextured albedo).
5. The SAM-licence question above.
6. HF-410 F2: the pass65 arms visual gate's two left-sleeve reds — fix by exempting the arm chains from the contact fold (repaints every contact pose) or a fourth reach arc toward the eye.

## Your manual checks
- Firefox: `docs/HF404_FIREFOX_MANUAL_CHECK.md`.
- Phone: Lane AE's checklist under `docs/evidence/pass85/lane-ae/`.

## Next work, in the order I would run it (ETAs are Opus wall-clock on this machine)
1. **PASS 89 this morning (~1 h):** merge AI (Balanced + RTX explainer), AB (time of day), AL after its two blockers are re-checked, the technique trials (resolve the one corridors.ts conflict); roll, gate, publish - `roll_pass.py --pass 89` then the ritual in the cut reports.
2. **Farcrysis to a real arena (~4 h):** collapse 224 materials onto the shared vocabulary, the core building's floor/walls and a practical light, the 25 runtime eye rows, your vegetation technique.
3. **Raid Rebuild art pass (~4 h)** with the brief-driven method and the GTA street-cell skill for the driveway/street.
4. **Water everywhere (~3 h):** the pond-in-every-level rollout from the Map 3 module, plus re-pointing High Seas/Raid/Nuke Town water.
5. **Animation (~4 h):** give the third-person operator the missing clips (reload, crouch, prone, ADS, knife) via the Kimodo clips that already measured shippable.
6. **Lighting tiers (AL)** once its repair lands; the RTX explainer copy in the changelog at the next roll.
7. **Branch/worktree cleanup (Lane AC)** in daylight with you around (402 worktrees; the plan has two blockers fixed on paper only).
8. **Hill-climb loop (AG)** after the feature lanes: cheap, rinse-and-repeat, staged until you have read its first receipts.
