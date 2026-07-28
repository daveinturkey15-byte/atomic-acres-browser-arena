# Atomic Player profile latency benchmark — 2026-07-28

## Goal

Determine whether IQ-style priority service and lower-reasoning/model helper lanes reduce Atomic Acres orchestration latency without weakening causal experiment review, while proving separately whether any profile/model setting enters the deterministic live perception/aim/input loop.

## Retained behavior

- Default Telegram Jigglyclaw remains OpenAI Codex `gpt-5.6-sol`, high reasoning, normal service tier.
- Atomic live control remains one deterministic rendered-pixel input owner.
- No model lane may authorize, vote on, or issue individual live controls.
- G0031 remains the overall fallback; G0041 and G0059 retain their existing roles.
- Safety, explicit weapon, rendered-target, pointer-lock, input-release, archive and zero-regression gates remain unchanged.

## Profile matrix

| Lane | Model | Reasoning | Service | Purpose |
|---|---|---|---|---|
| `atomicnormal` | gpt-5.6-sol | high | normal | same-model service-tier control |
| `atomicplayer` | gpt-5.6-sol | high | priority | primary/orchestrator target |
| `atomicsolmedium` | gpt-5.6-sol | medium | priority | same-model reasoning control |
| `atomicluna` | gpt-5.6-luna | medium | priority | immediate diversity helper |
| `atomicterra` | gpt-5.6-terra | medium | priority | delayed diversity/verifier helper |

## Model-plane protocol

- Five counted invocations per lane.
- Randomized lane order in every repetition.
- Fresh one-shot Hermes process per invocation.
- Same compact prompt, no external tools required.
- Measure wall-clock end-to-end latency, exit status, parse success and exact causal-quality fields.
- Record resolved profile/model/reasoning/service-tier provenance from the executable profile and model policy.

The fixed review fixture intentionally distinguishes scoreboard improvement from causal evidence:

- G0074 control: 0–5, 0.00 K/D, 10% accuracy.
- G0075 candidate: 2–4, 0.50 K/D, 38.9% accuracy.
- G0031 retained fallback: 4–8, 0.50 K/D, 61.5% accuracy.
- G0075 finish-window activations: zero.
- G0075 finish follow-up pulses: zero.

Required answer:

- `causal_attribution=false`;
- `promote=false`;
- `next_experiment="pending-hit-reacquisition"`;
- rationale must mention that the changed mechanism never activated and that G0031 retained metrics were regressed.

## Live-plane protocol

1. Inspect the transitive runtime imports for the deterministic driver and fail if model/provider/Hermes inference code is imported into the control path.
2. Run saved rendered-frame perception/aim replay under every profile-name environment and require byte-identical semantic outputs.
3. Compare measured replay runtimes as host noise only; profile identity must not alter outputs or code path.
4. Preserve exactly one input owner. Luna/Terra/Sol may review archived evidence asynchronously but cannot enter the live frame loop.

## Acceptance checks

- **C1:** Default chat remains Sol/high/normal.
- **C2:** All five Atomic profiles resolve to the declared provider/model/reasoning/service tier and Atomic workdir.
- **C3:** Model-policy and selector regression guards pass.
- **C4:** Every counted model-plane invocation exits zero and produces parseable evidence.
- **C5:** Quality is reported per lane; no lane is recommended solely for speed if it fails the causal answer.
- **C6:** Live-plane source audit finds no model call/import in the control path.
- **C7:** Saved-frame/replay outputs are invariant across profile-name environments.
- **C8:** Existing player tests, fallback verification and archive verification remain green.
- **C9:** Recommendation separates orchestration latency from live aiming latency.

## Promotion rule

Priority/lower-reasoning/helper routing may be adopted for offline Atomic orchestration only when it improves latency with no causal-quality regression. It cannot be described as improving live aim/K/D unless a separately counted gameplay policy changes and passes the frozen gameplay promotion gate.
