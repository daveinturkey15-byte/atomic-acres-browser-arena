# PASS95 day-shift candidate — 2026-09-06 (Claude Code, HF-535)

**HITL local inspection build: `bc649bb5e880824037880ca0d788789466b55f15` served on http://127.0.0.1:4285/?release=latest&renderer=webgpu&render=quality — NOT published.** Companion visual-inspection build (base + visual-c, no multiplayer fixes) on http://127.0.0.1:4286/?release=latest&renderer=webgpu&render=quality (see §4).

Claim states: [VERIFIED] root ran it; [MEASURED] tool output quoted; [INFERENCE] static reading; [OPEN] not proven.

## 1. Takeover and machine
- [VERIFIED] Took over from Codex Astra 06:05 BST (HF-535, ledger aa-claude-hotfix b8118209 + checkpoints). Integration checkout `aa-astra-pass95-hitl`, branch `contrib/dave-gaming-pc/codex/pass95-hitl-45m`, day base b5b06e0f.
- [VERIFIED] Commit-charge leak corrected 06:20 (CDPUserSvc + explorer, 103 → 53 GB; RAM 2.9 → 6.5 GB). High performance throughout. AKP adoption PASS; pull-only sync blocked (local main 1 unpushed / 2 behind) — owner-side.

## 2. Multiplayer (owner priority 1) — fixed and gated
- [VERIFIED] Root cause of the rejoin failure in every soak since candidate 9 (Muse instrumented soak + two Opus traces + bundle): on rejoin the guest spent both reconnect attempts in 0.4 ms (startMatch repair-ready + parked-replay re-entry); the host's join burst delivered `killstreak-state` 0.4 ms before `guest-resume-authority`; the raw-count fence called `handleGuestResumeTimeout` → silent hp 0 / alive false → state pump off → host latch (edge-triggered) never released → guestA pruned at 12 s.
- [MEASURED] Repair (Opus, lane aa-day-mp): reconnect pacing + terminal-verdict fence + late-authority readmit (`src/guest-rejoin-repair-pacing.ts`), host latch driven from the tick with a fail-closed deadline (`src/rejoin-latch-recovery.ts`), evidence bundle fixes, four skeptic fixes (Muse). Host-authored `health-authority` event (`src/host-health-authority-broadcast.ts`, `src/protocol.ts`) so observers see authoritative health inside one RTT, plus six skeptic fixes (epoch-scoped revision ledger, rejoin seeding, continuity-gated respawn classification, hp clamp to a held authority, newer-life hold, applied-only ledger). Two Opus skeptics reviewed; all required fixes applied with RED-before evidence. `src/legacy-main.ts` held at exactly 37,396 lines.
- [MEASURED] Solo soak on bc649bb5 (final-3): 6/8. PASS duration, reload-after-death, respawn-reset, stair-fire, console-clean (0), scoreboard. Divergences 30 = exactly guestB's scripted 15 s absence (s91–105). Two earlier soaks under concurrent CPU load showed transient guestB failures (stair-fire / reload) that did not recur solo — the soak harness is load-sensitive; run it alone.
- [OPEN → owner decision] MP-SOAK-REPLICATION counts a peer that is deliberately in the lobby as divergence; cannot pass with the rejoin inside the sample window. MP-SOAK-REJOIN-DAMAGE probe reads the three peers sequentially and exits at 120 ms while injecting 60 ms one-way delay; the victim alone measures 183–206 ms although guestA accepts the host health fact in the same second. Neither gate was changed.
- [MEASURED] Two-bot Nuke Town retained (overnight 736ffada). Freeze: host-mode attributor added; host 4-bot Terminal p99.9 24.7 ms max 54–61 ms (1–5 hitches); Nuke host 2-bot p99.9 24.0, 0 hitches; no multi-second freeze reproduced (owner-visible freeze needs real peers/WAN/headed).

## 3. Final gates on bc649bb5 (label final-3, solo)
| Gate | Result |
|---|---|
| tsc | [VERIFIED] 0 errors |
| vitest (legacy-main readers + nuketown2 + mp) | [VERIFIED] 132 files / 1433 tests pass |
| soak contracts | [VERIFIED] 9/9 |
| build + served-bytes receipt | [VERIFIED] `legacy-main-B_HlzZdZ.js` served on :4285 byte-identical to disk; 606 files; dist tree sha256 `599dc7c1efd72f8fcd3bd468f940abb3b9322c04ac5bb6b3d7279e1819e0c9f5`; receipt `docs/evidence/pass95/day-2026-09-06/candidate-receipt.json` |
| 29 review stations ×2 | [VERIFIED] 29/29, manifest bundleAtStart = built bundle |
| boot smoke (all 13 arenas, stock flags, external preview :4285) | [VERIFIED] 13/13 passed (8.9 min) |
| hitches nuketown2 solo 2 bots 90 s (2560x1440 high/webgpu) | [MEASURED] p50 10 / p95 14.3 / p99 17.2 / p99.9 23.5 / max 39.9 ms, 0 hitches ≥ 50 ms |
| soak 180 s / 3 peers | [MEASURED] 6/8 (see §2) |
| viewpoint diff vs served b5b06e0f | [MEASURED] FAIL: NEWLY_BLACK on 12 stations — the asphalt road renders exact-black at coach-elevation (21 %), street-centre (10 %), vehicle-far (8 %) while the roofs heal — see §4 |
| preflight | [MEASURED] refuses: 3 untracked evidence paths + inherited main-ancestry divergence (publication-only) |

## 4. Black surfaces (roofs / roads) — root cause narrowed, not fixed; visual lanes held out
- [VERIFIED] Genuine captures of the served b5b06e0f build: north roof, garage roof, interior ceiling exact [0,0,0]; road clean. (The Muse roof lane's "no black roofs" was VOID: a stale preview squatting :41931 served a Pass-93 bundle to all 14 of its captures. Harness now refuses squatters and reaps its own preview: b639b751, c0df91bf.)
- [MEASURED] Opus probes localised the NaN to the shared `baseColor` uniform read in the roof program; generated WGSL shows that program declaring it `f32` (scalar collapse from a type-unpinned `uniform(new THREE.Color())`), three r185 `UniformsGroup.updateNumber` then writes a Color object into a float slot → NaN. Pinning the types (lane commit 4a60f52f) fixes the roof WGSL and heals the roofs — but the asphalt then goes black with byte-identical WGSL. Thirteen different bundles today (each visual lane alone, the integrated tree, the multiplayer commits alone, the type pin, and six compositions on top of the multiplayer commits) all moved the exact-zero clamp onto the road (19–22 % of coach-elevation); only the untouched base bundle (captured twice, identical) and base + visual-c kept it clean. [INFERENCE] The victim is a deterministic function of the built bundle (base reproduced twice), decided in the shared uniform DATA path (three r185 `NodeBuilder` dead `sharedNodeData` cache and unique node hashes rule out the simple explanations). Falsified today: roof albedo, literal roof colour, per-material nodes, whole-buffer uploads, device limits, type pin alone. Next: per-family shared-node sets, judged on all 29 stations with the newly-black gate (now enforced by `scripts/qa/diff-arena-viewpoints.mjs`, 569d82b1).
- Consequence: the multiplayer candidate on :4285 shows black road patches at some angles (roofs healed). The visual lanes (a: mountains/asphalt/verge, b: trees/hedges, c: lamp heads/effects, polish) are complete, tested and captured but HELD OUT on branches `contrib/dave-gaming-pc/omp/day-visual-{a,b,c}` / `day-polish` / `day-roof` (4a60f52f) until the data-path defect is fixed. A companion build of base + visual-c (roofs healed, roads clean, lamp heads black ~0.5 % of frame; no multiplayer fixes) is served on :4286 for visual inspection only.
- [MEASURED] Gemini critic on the integrated visuals (before the hold-out): overhead 22.5→25.5, north-yard 21→23.5, garage 25→27; regressions it found were fixed by the polish lane.

## 5. Still OPEN
- Publication: owner HITL verdict + live release contract + main-ancestry reconciliation (955/491 commit divergence). PASS94 public unchanged.
- Black-surface data-path defect (above). Cold admission 21.7 s vs 10 s budget (inherited). Raid preview not started. Capture script GPU flags (`--use-angle=d3d11`, `--enable-unsafe-webgpu`, `--ignore-gpu-blocklist`) differ from the heavy-work rule; captures are pixel evidence only.
- Untracked in the integration checkout: `docs/evidence/pass95/night-runtime/` (Astra's runtime lane) and `node_modules.pruned-20260905/` (250 MB, safe to delete per the overnight lane) — left for the owner.

## 6. Where everything is
Day directory `C:\Users\david\Desktop\stuff\aa-day-2026-09-06\` (STATE.json, CONTRACT.md, lanes/*, root-captures/*, scripts). Lane worktrees `C:\Users\david\projects\aa-day-*`. Ledger rows HF-535 + checkpoints in `aa-claude-hotfix/docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`. Memory: `pass95-day-shift-2026-09-06`, `gotcha-viewpoint-capture-port-squatter`, `gotcha-nuketown2-black-roofs-shader-program-set`.
