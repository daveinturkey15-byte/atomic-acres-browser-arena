# Overnight plan — 2026-09-04 → 05

Owner direction (HF-497/499/501/502): PASS 94 live tonight; HITL 6 for multiplayer with friends; then PASS 95 with the new multiplayer soak gate; Opus/Fable back after the reset; Muse Spark 1.3 (contributor) as cheap builders; every Muse branch reviewed by Luna before merge; no publish without an owner HITL.

## Sequence (all times Europe/London)

1. **PASS 94 publish** — Luna, third run started 21:27 (first died with its launcher shell at 20:22; second stopped honestly on a load-induced test timeout). Live check + ledger record are part of the job.
2. **HITL 6** — Luna integrator, chained behind PASS 94 and the two multiplayer lanes (mp-bugs HF-498, mp-desync HF-499 + `qa:mp-soak`). Merges: mp fixes, chat (HF-500), perf lanes 1–3 (+ lane 4 if pushed), z-fight sweep, reconciled geometry (`nuketown2-geometry-2` if pushed, else layout-hitl5), bots/nuke/sound with review fixes, reviewed visual lanes, gameplay-feel if pushed. Serves :4300, does not publish. Headline: the soak-gate table.
3. **Owner HITL of candidate 6** with friends. Verdict decides PASS 95.
4. **PASS 95 cut** — Luna, only after the owner's verdict; the cut ritual plus `npm run qa:mp-soak` as a required gate (documented by the desync lane).
5. **Overnight lanes (no owner needed)** — Opus: perf parity, geometry 2, gameplay feel (running); Luna: reviews of every Muse branch (batches 1–3 done/running; batch 4 = Raid slice 2 + anything landing later); Muse builders resume after the publish (STOP file removed): PASS 96 candidates — clustered night lighting integration, breakable windows, lobby countdown, gamepad, yard-prop graphs, ground-projected horizon, load-time re-land, Raid/Farcrysis slices — each only after a Luna SHIP/SHIP-WITH-FIXES.
6. **06:00 candidate 7 build** — Luna integrator over the reviewed overnight branches, served on :4300 with captures; Gemini reference critic + Muse image audit on the captures; morning report in the ledger with the score delta (43 → 62 → 63 today).

## Rules that stay fixed overnight
- Never weaken a gate, fence, threshold or test; size ratchet is hoisted, never raised.
- Headless browsers only, one chain at a time; ComfyUI (:8188), ollama, the cockpit (:47821) untouched; local Qwen stays retired (HF-492).
- Long jobs launch from a background shell, never as a child of a watcher (gotcha 21:00).
- OMP credential store: if `auth_credentials` is empty, restore from the newest `agent.db.bak-*` and re-probe (gotcha).
- Every owner request goes in the ledger before action; every lane ships a REPORT with claim-states.
