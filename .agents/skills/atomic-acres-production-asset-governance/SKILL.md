---
name: atomic-acres-production-asset-governance
description: Forge, ingest, integrate, and release-gate authored Atomic Acres weapons, first- and third-person characters, vehicles, support platforms, ordnance props, and hero world assets. Use for Blender or licensed-source assets, PBR textures, rigs, animation, LODs, sockets, review renders, runtime streaming, provenance, performance budgets, or any pass that adds or changes a player-visible production asset.
---

# Atomic Acres Production Asset Governance

Treat a model being loadable as the start of verification, not the quality result. Reject generic procedural hero geometry, shared silhouettes masquerading as distinct weapons, metadata-only PBR claims, and self-attested visual approval.

## Workflow

1. Read the repository instructions, current pass ledger, canonical gameplay catalog, existing asset manifests, runtime loader, and the relevant production gate.
2. Declare the asset family, variants, authoritative gameplay identity, source ownership, expected runtime sockets/actions, performance budgets, and review views before authoring.
3. Author in Blender or ingest a licence-vetted editable source. Record the source digest and licence. Never replace a gameplay contract with an asset-local mirror.
4. Produce complete runtime variants and LODs from the one canonical source. Preserve canonical axes, scale, origins, sockets, skeleton names, and action names.
5. Produce real base-colour, normal, ORM and emissive maps where the material calls for them. Confirm UVs, tangents, colour spaces and restrained material response in the exported GLB.
6. Integrate through bounded asynchronous loading, caching and prewarming. Keep collision/gameplay geometry independent of presentation quality, and dispose every owned GPU resource on retirement.
7. Render deterministic near, mid, far and action views. For held assets, include first-person contact, ADS, world and dropped views. For characters, include neutral, locomotion and weapon-contact views. For vehicles, include exterior, cockpit/first-person, moving-part and support-action views.
8. Inspect the rendered pixels. Mark the tranche RED when anatomy, silhouette, scale, texture response, contact, clipping, axis, animation, readability or family distinction is weak, even if validators pass.
9. Run the domain production gate and then `npm run qa:pass65:production-assets`. Run representative-hardware runtime captures for assets that compile pipelines, animate, possess a camera, or appear during combat.
10. Hand off one scoped commit with source, runtime assets, manifests, evidence, tests and honest residual risks. Do not publish or promote a release from this skill.

## Non-negotiable gates

- Derive roster coverage from canonical catalogs. A future weapon, support platform or operator must auto-enrol or make the gate fail.
- Require editable source or a licence-vetted source package, digest-bound provenance and reproducible export/finalization.
- Require unique gameplay-facing silhouettes and complete action/socket coverage; reject renamed shared meshes.
- Require skin weights and believable anatomy for characters, canonical forward/up axes for vehicles, and sight/muzzle/grip alignment for weapons.
- Require visual evidence in addition to schema checks. The implementer cannot be the only visual approver.
- Keep hero assets visible and semantically identical across Quality, Performance and Custom. LODs may simplify presentation without removing gameplay geometry or retaining invisible collision.
- Prewarm expensive support and possession assets before activation. No ability may synchronously decode, compile or allocate enough work to hitch gameplay.
- Preserve the immutable Stable benchmark and compare candidate visuals, budgets and runtime behavior before promotion.

Read [the asset definition of done](references/asset-definition-of-done.md) when defining or reviewing a tranche. Run the aggregate verifier in `scripts/verify-production-assets.mjs` from the repository root.
