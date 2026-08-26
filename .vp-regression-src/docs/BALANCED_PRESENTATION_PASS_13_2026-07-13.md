# Atomic Acres — Balanced Presentation Pass 13

Date: 2026-07-13
Status: immutable review published; owner-path acceptance pending

## Owner report

Dave reports that released Pass 12 Responsive still feels too laggy while Compatibility is smooth but visually unacceptable. This report overrides the unlocked Pass 12 benchmark.

## Measured profile gap

Responsive and Compatibility already share the same reduced world, reduced presentation detail and palette-basic static batches. Their dominant difference is framebuffer work:

| Profile | DPR cap | Antialiasing | Approximate 1080p drawing buffer |
|---|---:|---:|---:|
| Pass 12 Responsive | 0.85 | yes | 1632×918 plus multisampling |
| Pass 12 Compatibility | 0.20 | no | 384×216 |
| Pass 13 Balanced candidate | 0.50 | no | 960×540 |

The initial comparison showed `0.50` Balanced at `29.94 Hz` and Compatibility at `59.88 Hz` in one hosted-browser sample. Reducing only the WebGL scale to `0.35` and `0.25` did not change Balanced's approximately 30 Hz cadence. Inspection then found the meaningful profile difference: Responsive kept a full-screen animated grain layer and soft-light colour-grade layer while Compatibility disabled both. Those display-resolution CSS blend layers sit outside the reduced WebGL drawing buffer and can force continuous compositor work. Balanced now disables both overlays, retains the readable `0.50` framebuffer, and keeps Responsive geometry, palette, transparency, signs, weapon/operator presentation and HUD. It uses 34.6% of Responsive's nominal WebGL pixel area before accounting for multisample savings and 6.25× Compatibility's pixel area.

## Invariants

- Preserve camera-ray firing, collision, damage, hit proxies, remote-shot admission and connection-bound identity.
- Preserve the Pass 12 `33 ms` peer snapshot cadence and frame-independent `24 s^-1` interpolation.
- Do not alter gameplay tuning to disguise presentation latency.
- Keep Quality and Compatibility as explicit overrides.
- Validate normal foreground Windows Chrome separately from VSync-disabled headroom.
- Require visual comparison at the same spawn and viewport.
- Passes 03–12 remain immutable; publish only as a new Pass 13 review.

## Acceptance gates

1. Balanced reports DPR `0.50`, no multisample antialiasing, expected drawing-buffer dimensions and the same semantic palette colours as Responsive.
2. Balanced remains at or below `120` calls and `150,000` triangles in the deterministic browser gate.
3. Normal Windows Chrome foreground cadence is no worse than Compatibility on the active display path.
4. Unlocked AMD p95/max frame time shows substantial headroom.
5. Visual review confirms clearly better legibility than Compatibility and no black-world, missing-sign, weapon, HUD or transparency regression.
6. Full deterministic, functional Chromium, multiplayer and public checks pass before publication.

## Local migration

The active repository was renamed from the obsolete prototype path to:

```text
/root/jigglyclaw/projects/atomic-acres-browser-arena
```

The Git remotes remain the correctly named `atomic-acres-browser-arena` repositories. The paused Qwen-era watchdog was removed. The historical local-Qwen swarm helper was moved to the external local archive `/root/jigglyclaw/archive/atomic-acres-qwen-prototype/`, marked retired and left disconnected from scheduling.

## Verified local evidence

- TypeScript lint: passed.
- Deterministic tests: `98/98` passed across `23` files.
- Production build: passed; bundles `index-DYZm5_gU.js` and `index-DCXd0xVK.css`.
- Chromium functional scenarios: `12/12` passed.
- Balanced profile browser gate: passed at `0.50` DPR, no AA, overlays hidden, `110` calls and `63,700` triangles in the final visual session.
- Compatibility performance gate: passed when isolated from the intentionally unthrottled Windows benchmark. Running the constrained gate while that benchmark consumed the shared GPU produced an invalid low result and was rejected.
- Local WebRTC: host/client each saw one remote; errors `[]`; state interval `33 ms`; interpolation rate `24 s^-1`; sampled snapshot age `4.5 ms`; interpolation error `0.000482 m`.
- Browser console/page errors during final visual review: `0`.

### Normal foreground Windows Chrome, virtual 30 Hz output

| Profile | Cadence | Median | p95 | Maximum | Drawing buffer |
|---|---:|---:|---:|---:|---:|
| Pass 13 Balanced | 28.82 Hz | 34.7 ms | 35.3 ms | 37.3 ms | 464×458 at the test window |
| Compatibility | 28.90 Hz | 34.6 ms | 35.2 ms | 37.4 ms | 185×183 at the test window |

Balanced is no worse than Compatibility on the normal display path while rendering `6.25×` its nominal WebGL pixel area. Both remain visibly capped by the active 30 Hz virtual output.

### Unlocked Windows AMD/D3D11 headroom

| Profile | FPS | p95 | Maximum | Calls | Triangles |
|---|---:|---:|---:|---:|---:|
| Pass 13 Balanced | 325.67 | 4.7 ms | 7.5 ms | 78 | 54,308 |
| Quality | 66.98 | 30.9 ms | 44.7 ms | 383 | 296,518 |
| Compatibility | 332.71 | 4.3 ms | 8.2 ms | 78 | 54,308 |

Balanced reaches `97.9%` of Compatibility's unlocked throughput in this sample while retaining a substantially sharper framebuffer. This test proves renderer headroom only; it does not override Dave's subjective real-stream acceptance.

## Remaining acceptance

Pass 13 should first be published only to immutable `review/pass13/`. Canonical must remain Pass 12 until Dave confirms that the review build feels materially better in his normal play path.

## Review release

- Source revision: `9dd2b55`.
- Pages revision: `d38a3eec1543e0681284048ae9cc529f4d5a51c7`.
- Review URL: https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass13/?release=9dd2b55
- Pages isolation: `15` added files, all under `review/pass13/`; `outside_pass13: []`.
- Canonical Pass 12 still serves `index-DQ9-GZeB.js` and was not changed.
- Public review serves `index-DYZm5_gU.js`; Balanced reports `0.50` DPR, no AA, overlays hidden, `110` calls and `63,700` triangles in the public visual session.
- Public visual/console smoke: passed, zero console and JavaScript errors.
- Public WebRTC: a first moving-peer sample had reciprocal peers/errors `[]` but transient interpolation error `2.62 m`, above the unchanged `2 m` gate. An immediate rerun passed with reciprocal peers, errors `[]`, snapshot age `0.60 ms` and interpolation error `0.000482 m`. The verifier threshold was not weakened.

The release is deliberately not canonical. Dave's direct normal-stream/controller assessment remains the final acceptance gate.
