# Atomic Acres player profiles

This directory separates the preserved pre-1v1 player from the new one-bot architecture.

## Preserved current profile

`legacy-offensive-accuracy-v2.profile.json` is the immutable pre-1v1 rollback reference. It preserves:

- the saved harness commit;
- the exact v2 policy and environment snapshots;
- the G0125 runtime policy, report and manifest hashes;
- the observed 72 ms Carbine pulse, 420 ms cooldown, 900 ms bounded contact pursuit, 1.8 s same-target finishing window and three-follow-up limit;
- the evidence caveat that G0125 was a useful attacking shape but fairness-invalid because one practice target was contacted.

The environment snapshot says `AUTOMATIC_FIRE=false`, but that variable was not the campaign launch authority. The campaign wrapper always forwarded `-AllowCombatFire`, and the immutable G0125 runtime report records `automaticCombatFireEnabled: true`. Both facts are preserved rather than silently normalised.

## New profile

`one-v-one-semantic-v1.profile.json` is deliberately:

- default-off;
- non-selected;
- non-promoted;
- replay-only;
- missing a production semantic detector until the new build supplies rendered training and calibration frames.

Its deterministic pipeline is:

1. rendered proposal generation;
2. one-class mobile-opponent semantic discrimination;
3. single-track `SEARCH → TENTATIVE → CONFIRMED → COASTING → LOST` lifecycle;
4. alpha-beta state estimation with commanded-camera compensation;
5. bounded coarse/fine image-space PD aiming;
6. two causally fresh same-track alignments;
7. independent fire authorization;
8. immediate post-shot reassociation;
9. visible-evidence same-target finishing.

Proposal colour, minimap bearings, optical flow and predicted/coasting tracks can guide search or aim. None can authorize fire.

### Rendered semantic refinement v2

The default-off refinement adds `rendered-motion-semantic-v1` as a **shadow-observer-only** gate. It combines an existing rendered colour/geometry proposal with body-shaped component constraints and independent target motion measured only after camera and movement commands have stopped. It is not a production model, motion alone never authorizes a live shot, and legacy aim is suppressed during its bounded calibration so observer motion cannot be mistaken for target motion.

Frozen evidence is split across:

- `datasets/one-v-one-rendered-semantic-v2.manifest.json` — rendered positive, hard-negative and ambiguous/reject labels with image hashes and provenance;
- `datasets/rendered-motion-semantic-v1.evaluation.json` — G0134 held-sequence and synthetic regression receipt;
- `one-v-one-semantic-refinement-v2.spec.json` — claim states, retained behaviour and promotion gates.

Known static G0133/G0125-style contacts, horizontal prop handoffs and observer-camera motion remain non-authoritative in the offline gate. Live use remains no-input shadow observation until a second rendered calibration is reviewed.

## Offline verification

```bash
npm run test:agent-player
npm run replay:one-v-one-scaffold
npm run evaluate:one-v-one-motion-semantic
npm run verify:player-profiles
```

The frozen registry is `index.json`. It binds both profile files, the implementation modules, the replay fixture, dataset manifest and launcher surfaces to SHA-256 values. The verifier also reruns the deterministic replay and requires its exact fingerprint and summary.

## Activation gate for later testing

Do not edit the frozen profile or registry in place. Create a candidate revision and require all of the following before any live tracking test:

1. Exact new-build receipt and rendered HUD/viewport verification.
2. Sequence-disjoint positive and hard-negative datasets.
3. Verified semantic detector model hash and confidence calibration receipt.
4. Offline detector precision/recall and zero false-authorization evidence.
5. Deterministic tracking replays covering misses, ambiguity, camera motion, coasting and reassociation.
6. Measured mouse-to-image calibration receipt.
7. Explicit Dave authorization for the next stage.
8. No-fire live tracking before aim-only testing.
9. Fresh-frame one-shot testing before complete 1v1 matches.
10. Three consecutive valid passing matches under one frozen policy before promotion.

The current driver and launcher accept a path plus canonical profile fingerprint, but the default-off profile is rejected before browser launch. Even a future armed profile is rejected until a live semantic-detector binding is deliberately implemented and reviewed. This prevents configuration forwarding from being mistaken for a working control path.
