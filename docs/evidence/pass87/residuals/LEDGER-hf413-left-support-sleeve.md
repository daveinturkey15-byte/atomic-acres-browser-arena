# Ledger — HF-413 left support sleeve, prone-against-wall: OPEN, not landed

PASS 87 Lane AR, item 14. Measured 2026-09-03 on `dave-gaming-pc`, headless
installed Chrome, `npm run qa:pass65:first-person-arms-visual` on the lane
branch with a clean tracked worktree. ComfyUI idle, GPU 5.6 GB of 16.3 GB used.

## The two reds, verbatim

```
Pass 65 first-person arms visual gate failed:
- contact/m4a1/prone-wall-floor-hip/left: sleeve entry
  [0.10942475521479438, -0.6906989175270046, 0.9848210991770688]
  does not continue below frame
- contact/m4a1/prone-wall-floor-ads/left: sleeve entry
  [-0.024952569546658306, -0.9000264403030639, 0.9842892020766265]
  does not continue below frame
```

Two violations, both the LEFT support chain, both prone-against-wall, and no
others: every other pose, weapon family and profile in the gate passes. The
assertion is `arm.shoulderEntryNdc[1] <= -0.98` — the sleeve must leave the
frame through the bottom edge rather than beginning in mid-screen, because a
sleeve that starts in mid-screen reads as a severed floating arm.

Measured shortfall, in NDC:

| pose | shoulderEntryNdc.y | required | short by |
|---|---|---|---|
| prone-wall-floor-hip | -0.6907 | <= -0.98 | 0.2893 |
| prone-wall-floor-ads | -0.9000 | <= -0.98 | 0.0800 |

Frames: `contact-m4a1-prone-wall-floor-hip.png`,
`contact-m4a1-prone-wall-floor-ads.png` (both halved from ~730 KB).

## Cause, as established by the PASS 86 gate repair

`WeaponPresentation` applies the solved contact fold to the whole viewmodel
root — `src/weapon-presentation.ts`, `this.root.scale.multiplyScalar(
this.contactFold.scale)` — and the arm chains are children of that root, so
they shrink with the weapon. `VIEWMODEL_CONTACT_FOLD_MINIMUM_SCALE` is 0.72,
i.e. up to 28% of length, and the PASS 86 repair measured ~14% reach loss at
these poses. The left support socket also sits further forward than the firing
hand, so it is the chain that runs out of reach first. No lane constant and no
elbow pole can recover it: the shortfall is in the chain's LENGTH, not its
solution.

## Why Lane AR did not land a fix

Both candidate repairs are rig changes to the shipped first-person presentation
in the same pass that HF-410 re-fitted it:

1. **Exempt the arm chains from the fold scale** (counter-scale each chain by
   `1 / contactFold.scale`). Plausible, and it recovers exactly the 14% that
   was lost — but it changes the relationship between the arms and the weapon
   grip sockets that the gate's own `contactError <= 0.01 m`,
   `palmOrientationError <= 0.2`, `socketReachRatio <= 1.04` and
   `gripSocketCalibration <= 0.01 m` assertions pin, across all seven weapon
   families and both profiles. It cannot be landed on one measurement.
2. **A fourth reach arc toward the eye with a near-plane guard.** Adds a solve
   branch to the shared arm IK; the near-plane guard is the load-bearing part
   and it interacts with `FIRST_PERSON_CAMERA_NEAR_METERS`, which HF-410 moved
   to 0.02 in PASS 85.

Each needs a full arms-gate cycle per iteration (~5 minutes) plus the
viewmodel-fit and near-plane specs, and neither is a change to make at 03:00
against a 05:10 cut. The gate stays RED and honest — no threshold was touched.
The `-0.98` entry bound, the two poses and the left/right split are all
unchanged.

## Falsifier for whoever takes it

`npm run qa:pass65:first-person-arms-visual` green with the `-0.98` bound
intact, plus `src/viewmodel-contact-applied-transform.test.ts`,
`src/pass69-3-authored-near-plane-catalog-runner.test.ts` and the two frames
above showing the left sleeve leaving the bottom of the frame in both poses.
Grade the fix on `shoulderEntryNdc[1]` at these exact two poses; the numbers to
beat are -0.6907 and -0.9000.
