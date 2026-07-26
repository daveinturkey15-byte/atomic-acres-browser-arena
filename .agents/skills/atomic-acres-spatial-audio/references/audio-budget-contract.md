# Audio catalog and budget contract

## Required buses

Master, SFX/weapons, movement, UI, announcements, ambience, menu music and in-game music have independent normalized gain and mute values. No node bypasses master or its declared category.

## Event coverage

Every weapon, ordnance, impact, door, shed/debris, support entity, movement/footstep, health, UI, announcement, ambience and music event declares:

- stable event ID and bus;
- local or spatial policy;
- variant/source IDs and provenance digests;
- concurrency, priority, cooldown and optional occlusion profile;
- lifecycle/disposal owner and evidence ID.

## Spatial and footstep rules

Require finite positive reference/max distances, monotonic rolloff, bounded cone values, per-profile voice caps and deterministic stealing. Footsteps require admitted grounded planar movement, actor/life/continuity identity, surface policy and discontinuity reset. Airborne lateral motion emits no footstep.

## Global budgets

Freeze maximum active voices, loops, reusable chains, per-bus voices, occlusion queries/second and occlusion CPU p95. Counts must settle after arena switches, rematches and audio suspend/resume.

Reject missing buses/events/provenance, out-of-range settings, invalid spatial bounds, unbounded concurrency, duplicate IDs, identical ambience everywhere without rationale, or evidence from a different source/build.
