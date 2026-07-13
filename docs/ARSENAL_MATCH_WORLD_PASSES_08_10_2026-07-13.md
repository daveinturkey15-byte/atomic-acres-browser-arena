# Atomic Acres Passes 08–10 — Arsenal, Match Flow, and Arena Storytelling

Date: 2026-07-13
Branch: `overhaul/arsenal-match-world-passes-08-10`
Baseline: Pass 07 documentation `d4936f8`; game source `cbd3c17`

## Non-negotiable rules

- Original Atomic Acres art, names, layouts, UI, procedural audio, and code only. No commercial assets, geometry, branding, weapon models, animation data, tuning tables, or extracted references.
- Camera-ray hits, damage, collision, spawn policy, fixed hit proxies, one weak solo bot, host identity binding, and remote-shot admission remain authoritative.
- Presentation sockets, moving weapon parts, operator gait, environmental animation, UI pulses, and ambient zones are visual/audio only.
- Full QA gates remain `>=40 FPS`, compatibility `<=180` calls and `<=350,000` triangles, bounded transient pools, zero page/console errors, and isolated review deployment.
- Pass 04 collision is immutable unless a proven collision defect is reproduced.

## Pass 08 — Arsenal and operator-animation parity

- Give Vectorline SMG and Model 12 Scattergun original named detail sets and compatibility representations.
- Centralize per-weapon ADS axis, recoil/flash scale, smoke count, action travel, required detail names, and locomotion weight in deterministic profiles.
- Distinguish magazine and shell reload motion and synthesized action timing.
- Improve presentation-only operator gait, lean, weapon carry, foot roll, and stance transitions without moving hit proxies.
- Acceptance: all three weapons center physical sights, expose ready detail telemetry, preserve bounded effects, and remain non-raycast in third person.

## Pass 09 — Match flow and combat information

- Centralize deterministic warmup, active, respawn, score-change, and end-state presentation.
- Add readable countdown states, score pulses/lead messaging, respawn countdown, a real rematch action, end reason, and richer kill-feed hierarchy.
- Preserve the five-minute/first-to-25 rules and existing network authority.
- Acceptance: rematch reliably resets scores/ammo/match state, ended input stays suppressed, and debug/browser tests can advance the match deterministically.

## Pass 10 — Arena storytelling and route readability

- Add original lane markers, house identity plaques, interior domestic/lab props, delivery manifests, route-color cues, restrained atomic landmark/beacon motion, and zone-aware procedural ambience.
- Decorative additions do not block movement or shots; animated nodes opt out of static batching.
- Compatibility uses semantic placeholders or omits micro-detail while retaining route identity.
- Acceptance: normal quality gains clear west/center/east route identities and ambient state telemetry while compatibility remains within existing budgets.

## Release plan

Commit after each pass, retain each source revision, and publish immutable `review/pass08/`, `review/pass09/`, and `review/pass10/` builds. The canonical root and Pass 04–07 paths remain untouched.
