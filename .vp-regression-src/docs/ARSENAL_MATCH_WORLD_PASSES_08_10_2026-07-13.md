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

## Release evidence

### Source checkpoints

- Pass 08 — `584b1f4` (`Build Pass 08 arsenal and operator parity`)
- Pass 09 — `c3c46e3` (`Build Pass 09 match flow and rematch loop`)
- Pass 10 — `69977d5` (`Build Pass 10 arena storytelling and route identity`)
- Review Pages deployment — `d5e2a57` (`Publish Atomic Acres review passes 08 through 10`)
- Canonical live promotion — `31b638f` (`Promote Atomic Acres Pass 10 to live root`)

### Local verification

- TypeScript lint: passed.
- Vitest: `87/87` tests across `19/19` files.
- Production builds: passed independently at all three source checkpoints.
- Chromium functional matrix: `12/12` scenarios.
- Isolated performance scenario: passed the unchanged `>=40 FPS` gate.
- Scripted two-browser multiplayer: host/client each observed one remote; zero errors.
- Full-quality Pass 10 capture: `569` calls / `341,078` triangles; zero console errors.
- Compatibility Pass 10 active capture: `75` calls / `71,934` triangles, below the `180` / `350,000` limits.
- Fixed pools, one weak bot policy, camera-ray authority, identity binding, remote-shot admission, and fixed authoritative hit proxies remained covered by deterministic/browser checks.
- Final visual review covered menu, hip view, SMG ADS, and scattergun ADS. The SMG front-post tip and Model 12 bead were corrected to align physically through their rear apertures at screen centre.

### Public verification

The deployment diff was mechanically confined to `review/pass08/`, `review/pass09/`, and `review/pass10/`; Pass 07 and earlier paths were unchanged. All expected hashed bundles became available on GitHub Pages.

- Pass 08: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass08/?release=584b1f4>
- Pass 09: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass09/?release=c3c46e3>
- Pass 10: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass10/?release=69977d5>

Public smoke verification confirmed the correct Pass 08/09/10 identity at each path, original-art and weapon readiness, zero page/console errors, Pass 10 story readiness, and two-browser Pass 10 host/client replication. The public compatibility smoke measured `43` calls / `62,542` triangles; the more demanding local active compatibility capture above remains the release-budget reference.

### Canonical audit and promotion

The final pre-promotion audit distinguished source milestones from public review snapshots rather than inventing missing releases:

- Passes 01 and 02 are retained source milestones (`b345392`, `3d70e62`) but were never published as `review/pass01/` or `review/pass02/`.
- Passes 03–10 retain public review snapshots and all returned HTTP 200 after promotion.
- The corrected Pass 03 source milestone `e9e1c7f` and every later Pass 04–09 source milestone are ancestors of Pass 10 `69977d5`; Pass 10 therefore contains the complete source progression.
- A fresh gate before promotion passed `87/87` units, `12/12` functional Chromium scenarios, production build, isolated performance, and `git diff --check`.
- The canonical deployment changed only root `index.html` and hashed root assets; the `review/` tree hash was unchanged.
- Public canonical full-quality solo smoke loaded Pass 10 with original art, weapon, operator and arena-story readiness and zero page/console errors. Compatibility active smoke measured `77` calls / `71,998` triangles.

Canonical URL: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/?release=31b638f>

## Known limits

- Automated tests cannot prove subjective controller feel, synthesized audio quality, or perceived weapon weight; those remain manual play/listening checks.
- Existing multiplayer architecture still uses victim validation rather than a fully authoritative dedicated server, and grenades are not fully replicated.
- Full quality intentionally exceeds the compatibility draw-call target; the target applies to the explicit reduced compatibility renderer.

## Release plan

Completed: each pass from 08–10 remains an independent source revision and immutable review path. Pass 10 is also the canonical live root at Pages revision `31b638f`; the review tree and Pass 03–09 checkpoints remain unchanged.
