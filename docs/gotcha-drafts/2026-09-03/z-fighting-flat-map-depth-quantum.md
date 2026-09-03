# DRAFT: Z-fighting on a flat map: authored +0.02 m offsets sit inside the depth quantum

Date: 2026-09-03

**Symptom.** The owner reported "loads of z-fighting all through the map" on the Nuke Town Rebuild (HF-434, P0): coplanar and near-coplanar surfaces flickered across the flat map — ground-dressing decal plates sitting a tiny authored offset above the slab, plus exactly coplanar floor/road surfaces.

**Cause (VERIFIED).** Authored +0.02 m offsets sit inside the depth buffer's precision quantum at map scale: with near 0.02 / far 180, the depth quantum is ≈1.07 cm at 60 m and ≈1.9 cm at 80 m, so a 2 cm offset does not reliably separate the surfaces. Ledger evidence (HF-443, Opus review of the geometry branch): "Depth computation: near 0.02 m, far 180 m -> depth quantum at 60 m ≈ 1.07 cm, at 80 m ≈ 1.9 cm; the old +0.02 m decal and exactly-coplanar floor/road are the z-fighting."

**Correction.** Use integer polygonOffset tiers instead of tiny authored offsets: ground 0 → road/floor −1 → lawn/dashes −2 (integer polygonOffset units, required by WebGPU depthBias; verified to reach the WebGPU path at three 0.185.1). Same HF-443 evidence.

**Verify.** The HF-443 review gate on commit `5b4f3c1e`: "coplanar-instrument audit, `npm run test:pass65` + `npm run check`, and a fresh nuke-town-2 contact sheet in both profiles" — verdict "VERIFIED-OK on real geometry". Reproduction check: any authored sub-quantum offset (≤ ~2 cm at mid-map distance) is a defect; surface separation must come from integer offset tiers, not position nudges.
