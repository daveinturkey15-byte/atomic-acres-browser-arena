# Production asset definition of done

## Shared evidence

Every player-visible production family must provide:

- a stable catalog ID and one canonical manifest;
- editable `.blend` source or a licence-vetted source package;
- source, export and runtime digests plus provenance/licence records;
- metres-scale, canonical origin/axes and named sockets/actions;
- UVs, tangents and material-specific base-colour, normal, ORM and emissive maps;
- bounded LODs with triangle, texture, animation and byte budgets;
- deterministic near/mid/far contact sheets and action captures;
- asynchronous cached loading, explicit prewarm and retirement/disposal evidence;
- catalog set-equality and deliberately incomplete/future-ID mutation failures;
- independent pixel-level visual review and exact-candidate runtime proof.

## Type-specific evidence

| Family | Required evidence |
|---|---|
| Firearm or crossbow | Unique platform silhouette; first-person, world and dropped variants; grip, muzzle, casing and sight sockets; idle/equip/fire/reload/ADS/melee actions; sight-axis and hand-contact tolerances. |
| First-person arms | Opaque skin; believable shoulder/elbow/ulna/wrist/palm/finger/thumb anatomy; stable weights; sleeve/glove PBR; representative carbine, pistol, knife, grenade and ADS contact. |
| Third-person operator | Skeleton and skin coverage; opaque complete body; locomotion, aim, fire, reload, grenade, hit and death clips; weapon-hand contact; team/material variants; near/mid/far LOD review. |
| Aircraft or helicopter | Canonical forward/up axis; body, cockpit/glass, rotor/propeller and weapon/cargo sockets; exterior/cockpit LODs; rotor, gun, cargo/bomb and ingress/egress actions; pose-dot-velocity proof. |
| Drone | Shared family projection for autonomous/manual variants; articulated propulsion; visible mounted gun and camera socket; propeller, recoil and fire actions; unobstructed first-person camera sweep. |
| Ordnance prop | Distinct held, thrown, flight, stuck and world silhouettes; fuse/impact action; attachment origin; readable LODs without substituting authority geometry. |
| Hero world asset | Correct normals/winding; material/decal coverage; visible geometry/collider parity across profiles; damage/destruction states; major debris persistence and contact evidence. |

## Automatic rejection

Reject the tranche if any of these are true:

- a hero family is a primitive placeholder, a recolour, or a renamed shared mesh;
- a texture channel is declared but not present and visibly effective;
- the review sheet omits a state that can clip or misalign in play;
- a vehicle faces opposite its velocity or a weapon sight/muzzle is off-axis;
- character skin is transparent, anatomically implausible, unweighted or visibly detached;
- Performance hides semantic geometry while collision remains;
- activation causes an unbounded allocation, compile, decode, frame stall or device error;
- provenance, source reproducibility, runtime wiring or independent visual review is missing.
