# Audio catalog and budget contract

## Required buses

Master, SFX/weapons, movement, UI, announcements, ambience, menu music and in-game music have independent normalized gain and mute values. No node bypasses master or its declared category.

## Event coverage

Canonical runtime identity and coverage are owned by F16 at `src/sound-event-inventory.ts` and proved by `src/sound-event-inventory.test.ts`. The validator's 16-event fixture is an independent staging probe, not a substitute registry. It must explicitly declare whether it is a `staging-contract` or `canonical-runtime` input; canonical mode fails if either F16 authority path is absent.

Every weapon, ordnance, impact, door, shed/debris, support entity, movement/footstep, health, UI, announcement, ambience and music event declares:

- stable event ID and bus;
- local or spatial policy;
- variant/source IDs and provenance digests;
- concurrency, priority, cooldown and optional occlusion profile;
- lifecycle/disposal owner and evidence ID.

## Spatial and footstep rules

Require finite positive reference distances, greater finite maximum distances, sampled monotonic rolloff, bounded cone values, per-profile voice caps and deterministic stealing. Every spatial staging event has exactly one numeric pan/occlusion evidence row with an immutable artifact digest. Footsteps require admitted grounded planar movement, actor/life/continuity identity, surface policy and numeric grounded, airborne, discontinuity and remote-position evidence. Airborne lateral motion emits no footstep.

## Global budgets

Freeze maximum active voices, loops, reusable chains, per-bus voices, per-profile voices, occlusion queries/second and occlusion CPU p95. Global, bus, profile and event caps must agree arithmetically. Numeric before/after counts must settle after arena switches, rematches and audio suspend/resume.

Require the exact arena set `atomic-acres`, `skyline-terminal`, `rustworks-1v1`, and `gun-range`, each with distinct ambience. Reject missing buses/events/provenance, out-of-range settings, invalid spatial bounds, unbounded concurrency, duplicate IDs or variants, identical ambience everywhere, authority overclaims, or evidence from a different source/build.

Run `node scripts/verify-audio-catalog.mjs --self-test` after fixture checks. Its adversarial mutations must all be rejected before the validator can guard a candidate.
