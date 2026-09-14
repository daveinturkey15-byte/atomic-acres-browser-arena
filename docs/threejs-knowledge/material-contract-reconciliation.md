# Reviewed correction: `src/vehicle-forge/clean-materials.test.ts:16`

Lane `render-contract-repair-20260912`, 2026-09-12. Independently reviewed by native
Opus High and the root integrator. Root retained the measured house-look contract
at 0.08 and changed the conflicting exact clean-finish pin to the same value.
This changes the candidate's clean base-lobe appearance; it is not a proof of
physical correctness or owner acceptance. Clean/worn graph, roughness and coat
behavior remain covered separately. Owner visual approval remains OPEN.

## Contradiction

Three tracked tests build a clean `createForgePaintMaterial` and pin `specularIntensity`:

| Test | Line | Pin | Introduced by |
|---|---|---|---|
| `src/coherent-material-exposure.test.ts` | 75 | `toBe(0.08)` | `ce85ca80b` 2026-09-10 14:16 +0100 (`git log -S'toBe(0.08)'`) |
| `src/nuketown2-vehicle-materials.test.ts` | 112, 114 | `<= 0.5` on the forge paint; `0.08` on the car paint | 0.08 lobe lineage `12ad3715d` 2026-09-08 → `ce85ca80b`; car paint set at `nuketown2-vehicle-materials.ts:194` |
| `src/vehicle-forge/clean-materials.test.ts` | 16 | `toBe(1)` | `0722e0c8e` 2026-09-10 21:27 +0100 "Restore clean enamel dielectric reflection" |

No single value of `specularIntensity` satisfies line 16 and line 75. `ce85ca80b` is an
ancestor of `0722e0c8e` (`git merge-base --is-ancestor` exit 0), so `0722e0c8e` added the
newer pin without retiring the older ones.

## Evidence for holding 0.08

- The 0.08 contract is the older, wider one: two tests, the car paint factory and the
  `nuketown2-vehicle-materials.ts:170` header ("clearcoat lobe, specularIntensity 0.08").
- `0722e0c8e`'s stated reason was physics ("restore the normal dielectric reflection"). The
  physics is correct as far as it goes: 1 at ior 1.5 is F0 0.04 / F90 1, three's own default.
  But nothing in the tree measured the look at 1, and the two tests that measured the look
  hold 0.08. The choice is house look, not correctness, and the house look is the recorded
  contract.
- The clean/worn invariant that `clean-materials.test.ts` protects is carried by
  `userData.forgeFinish` (`:31`) and `colorNode` (`:18,33`), not by this scalar. Changing
  line 16 reconciles the conflicting exact look value while retaining those
  separate clean/worn invariants.

## Evidence against (must be weighed by root)

- `0722e0c8e` is the newer intent, and its author may have looked at a render this lane
  did not. No owner statement either way was found in the tree, so owner visual approval of
  the 0.08 look on clean enamel is OPEN.

## Applied scope

The tracked `src/vehicle-forge/clean-materials.test.ts` has exactly one change:
line 16 `toBe(1)` → `toBe(0.08)`. No range, tolerance, timeout or other assertion was
relaxed. Root also removed an unneeded new test that pinned literal strings inside
Three.js; the game tests exercise material behavior, while the source review and
installed version are recorded in the accompanying recipe.

## Falsifier

Set `specularIntensity` to any value other than 0.08 in the clean branch of
`createForgePaintMaterial`: with the staged file applied, `clean-materials.test.ts:16`,
`coherent-material-exposure.test.ts:75` and `render-contract-repair.test.ts` fail together.
