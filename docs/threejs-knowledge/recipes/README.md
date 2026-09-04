# Recipes

One file per reusable Three.js pattern, in the format given in
[`../README.md`](../README.md). **Empty on purpose right now.**

A recipe requires a measurement (frame time, draw-call delta, memory, the quality tier it sits
behind). Nothing has been measured yet under this directory's rules, so nothing is written
here — an unmeasured recipe is a proposal wearing a recipe's clothes, and that is exactly the
kind of green-looking-but-hollow artefact the gates exist to catch.

Candidates already identified and waiting on a measurement, both from the HF-481 ingestion
(vault `Ingestion/REGISTER.md` rows 54 and 56):

- **SH-L2 irradiance volume** — a spherical-harmonic probe grid baked into a 3D texture,
  sampled with a half-spacing normal offset, giving cheap diffuse indirect light everywhere.
  Would be expressed in TSL. Gap confirmed: `light probe` matches **0** files in `src/`, and
  `irradiance volume` / `spherical harmonics` / `light probe grid` all return NO COVERAGE
  across the 164-skill store.
- **Cascaded shadow maps + TAA** — the two entries in a deferred stack whose absence most
  plausibly explains the look gap the owner asked about. TAA needs a velocity prepass first;
  `prepass` currently matches 0 files in `src/`.

Write the recipe when the probe exists, not when the idea does.
