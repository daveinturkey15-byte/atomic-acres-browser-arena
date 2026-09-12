# Render contract reconciliation - 12 September 2026

The integration retains the measured Nuke Town tonal pair and restores the recorded
40-second MAP3 sky orbit. The forged paint factories now share the established 0.08
base-lobe look on both clean and worn finishes. These are candidate choices; owner
visual approval remains OPEN. No renderer migration or new effect is introduced.

## Evidence and decisions

| Conflict | Evidence | Integration decision |
|---|---|---|
| Clean paint 1 versus 0.08 | `0722e0c8e` introduced an exact 1 pin while existing exposure/car-paint contracts retained 0.08 | Retain the wider measured house-look contract and reconcile the clean pin; see `material-contract-reconciliation.md` for both sides and review |
| Split tone 0.55 versus 1.45 | `b41673fe9` displaced the 29-station tonal-gap values and left the tonal-match assertions failing | Retain `0x2b4258 / 0xffd096 / 1.45`; inspect house-paint/foliage browning in the actual preview |
| Orbit 1200 versus 40 seconds | `7d76deb74` carried the constant in an animation revert; `sky.ts` records a quarter turn per ten seconds | Restore 40 seconds and exercise the actual animated direction |
| Nuke Town IBL 0.32 versus generic cap 0.3 | Exact night-lighting pin conflicts with the global graphics-refinement assertion | OPEN; neither constant nor cap changed in this packet |

The reviewed commits did not supply an owner-rejection receipt for either material
look. Measured local contracts guide this candidate, but do not substitute for the
owner's approval. A preserved-luminance tint transform is not by itself proof of
unchanged perceived readability.

## Physical model verified against the installed version

Current upstream documentation was checked before applying the project API. Installed
Three.js is 0.185.1; current documentation can describe later APIs. In the installed
`MeshPhysicalNodeMaterial.js:353-355`, dielectric F0 is the IOR/tint term multiplied by
specularIntensity, and F90 is mixed with metalness. In `PhysicalLightingModel.js:860`,
the final coat contribution is:

`base * (1 - clearcoat * Fcc) + coat * clearcoat`

The coat attenuates the base before adding its contribution. The earlier proposed
`dielectricLobeBudget` falsely modelled an unattenuated grazing sum and was rejected.
It and its tests are absent from integration. A default specularIntensity of 1 is
physically legitimate; 0.08 deliberately suppresses the face-on base highlight by
about 12.5 times. Its justification here is the house look, not a physics correction.

Sources: [Three.js physical material documentation](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
and [r185 physical lighting source](https://github.com/mrdoob/three.js/blob/r185/src/nodes/functions/PhysicalLightingModel.js).
The installed 0.185.1 source was inspected directly. No brittle literal-source test
was added for the dependency; game tests exercise the resulting material graphs.

## Verification and limits

Root ran the six material, tonal-match and sky files after integration: 37 tests
passed. Clean and worn still differ by graph, finish tag and coat behavior; all
existing opacity, colour and roughness assertions remain. The sky is tested through
both its module and the arena. Browser appearance and performance remain separate
acceptance checks, as does the unresolved IBL contradiction.

Texture optimization and exhaustive assertion equivalence were integrated separately;
see `texture-verifier-repair.md` for the independent 28-buffer and 185-case proofs.
The worker's scratch skipped timing test was not copied into integration.
