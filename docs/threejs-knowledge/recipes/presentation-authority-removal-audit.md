# Presentation/authority removal audit

Removes decorative kit call sites and unwanted vehicles WITHOUT changing gameplay cover.
Validated on Nuke Town (r185): 562 house-kit meshes + 14 garage-car parts removed,
12 solid furnishings retained, 2 car-body colliders + 2 shot surfaces removed with the cars.

## Permit (measure on the built arena, never on flags)

A body may be removed iff, measured on `buildArena(new THREE.Scene())`:

- no AABB match in `map.colliders` within 1e-3 (Box3 overlap probe, not name search —
  collider entries here carry `minX/maxX`, no mesh ref), AND
- `userData.ballisticSurfaceId` is not a string.

Do NOT key on `userData.presentationOnly` or `mesh.visible`:
`pair()` drops a handed `presentationOnly: true` (only `pairKit()` stamps it after),
and `batchPresentationOnlyBoxes()` sets `visible=false` on 3809/4441 source meshes
that still render. Count source meshes by name substring.

Dual-package hazard under `tsx`: `instanceof THREE.Mesh` is false for every arena
mesh (CJS vs ESM builds). Duck-type `node.isMesh === true`; `THREE.Box3`,
`THREE.Vector3` still work. Vitest does not have this problem.

## Steps

1. Census before: duck-typed counts by name (`house interior`, `garage car`),
   collider/shot totals, solid-furnishing presence (6 names x N/S = 12).
2. StepA: delete the decorative `pairKit` call site only (keep solid cover,
   keep `garageInteriorDressing`, `houseWindowDressing`). Expect house-kit 0,
   collider/shot deltas 0.
3. StepB (one semantic change): delete vehicle presentation AND its exact
   authority together — body/cabin/glass/wheels plus the body collider and
   `vehicle`-rated shot surface. Never leave an invisible blocker in a vacated bay.
4. Prove the bay: absence assertions (no mesh/collider/shot under the removed
   name), floor slab still present, orphan-collider sweep (every above-slab
   collider in the region matches a standing visible mesh within 1e-6), lane-width
   route check past surviving furniture.
5. Update RED tests in the same step: the contract changed because the owner
   removed the object — replacement assertions are absence + preserved neighbours,
   never deleted coverage.

## Failure modes

- Removing cover: check every body against the collider set first; refuse anything
  with a collider unless provably decorative.
- Crouch-only cells: a second solid over an open sill (cabin over body) creates a
  gap a crouch clears and a stand does not — the ground crouch sweep catches it.
- Batch drift: removing sources changes derived batch-mesh counts; compare named
  sets, not totals.

Upstream: `THREE.Box3.setFromObject` / `Box3` —
https://threejs.org/docs/#api/en/math/Box3 (checked against installed 0.185.1;
pure deletion, no new API chosen).
