# Atomic Acres — Tactical Feel Pass 03

**Date:** 2026-07-12  
**Branch:** `overhaul/tactical-feel-pass-03`  
**Release policy:** local/separate review candidate only. Do not replace the canonical live build until Dave explicitly accepts the playtest.

## Why this pass exists

Dave's live playtest correctly rejected Combat Feel Pass 02 despite its green automated suite:

- no prone stance;
- the physical ADS picture did not feel trustworthy or aligned;
- apparent shots through fence/greenhouse-style cover;
- poor information about enemies obscured by cover;
- the aggregate result still felt like a browser prototype rather than a polished early-2010s tactical arcade FPS.

The prior verifier proved implementation stability, not target feel. Pass 03 treats stance depth, aim alignment, cover authority, enemy readability, animation weight, audio hierarchy and combat information as release requirements.

## Originality boundary

Use genre-level qualities only: fast but weighty stance transitions, a centred physical sight picture, deterministic cover, readable enemy silhouettes, disciplined recoil, strong directional feedback and rapid match cadence. Do not copy proprietary map geometry, weapon models, textures, UI, audio, names, logos, source code or exact tuning.

## Must-fix systems

### 1. Real stance state machine

- States: `stand`, `crouch`, `prone`.
- Keyboard: `C` toggles crouch; `Z` or left Ctrl toggles prone; sprint/jump requests stand.
- Gamepad: B toggles crouch; D-pad down toggles prone; sprint/jump requests stand.
- Each stance has an actual Rapier capsule, eye height, acceleration, braking, maximum speed, bob and spread profile.
- Feet remain fixed when changing collider size.
- Raising the collider under a ceiling must fail instead of clipping through geometry.
- Prone disables autostep and cannot sprint or jump.
- Network snapshots carry stance, and remote hit geometry follows the displayed pose.

### 2. Rebuilt ADS picture

- Align the procedural optic's physical axis to camera centre mathematically.
- Remove the hip-fire crosshair completely while ADS; the optic reticle is the aiming reference.
- Move the weapon forward enough that the receiver does not swallow the lower half of the screen.
- Keep ADS bob/sway restrained and preserve monitor-distance-like sensitivity scaling.
- Recoil must move camera and weapon together and recover without dragging the resting sight off centre.

### 3. Authoritative cover and hit trust

- Replace the old average-height 2D LOS shortcut with exact 3D segment/AABB slab intersection.
- Every bot shot performs a fresh cover trace at the instant of firing; cached LOS may select intent but may never authorize damage.
- Tracers terminate and spawn an impact at the first authoritative cover hit.
- Incoming peer hits are rejected when the locally known attacker-to-victim line crosses hard cover.
- Grenades, bots, bullets, movement and networking share the same authored collider set.
- Decorative meshes remain non-blocking unless explicitly promoted.

### 4. Enemy and damage readability

- Enemy operators receive brighter team-colour material and a luminous identifier band without through-wall outlines.
- Hard cover remains visually solid; translucent/open-looking surfaces must not secretly behave as solid walls.
- Minimap fire pings, stopped tracers, cover impact flashes and directional damage must agree about the threat direction.
- No enemy marker may reveal a silent opponent through hard cover.

## Broader feel audit

Before release, explicitly review:

- first-shot accuracy, sustained recoil and recovery across all three weapons;
- weapon switch/reload/melee/grenade interruption rules;
- sprint-to-fire and prone-to-fire timing;
- footsteps, near/far gunshot balance, impact audibility and damage mix ducking;
- camera FOV/roll/bob at stand, crouch, prone, sprint and ADS;
- spawn safety and immediate sightlines;
- bot reaction, aim, burst length and cover respect;
- team silhouette and environment contrast in all lanes;
- multiplayer stance replication and hit rejection;
- HUD stance/ADS information without visual clutter;
- desktop performance in full and explicit compatibility modes.

## Acceptance gates

1. Unit tests prove stance ordering/reduction, real collider resizing, low-ceiling stand rejection, 3D LOS and nearest cover-hit time.
2. Browser test proves keyboard stand → crouch → prone, actual eye-height reduction, and sprint recovery to stand.
3. ADS screenshot shows the physical reticle at screen centre, no hip crosshair, and no major receiver obstruction.
4. A deterministic cover scenario proves a bot tracer stops at cover and player HP does not change.
5. Multiplayer smoke proves stance snapshots remain protocol-valid and host/guest each see one remote.
6. Public/review console has zero application errors.
7. Full verifier passes TypeScript, all unit tests, production build, all Chromium scenarios and the unchanged compatibility budgets (`>=40 FPS`, `<=180` calls, `<=350,000` triangles).
8. Full-quality playtest remains visually coherent; compatibility reductions do not silently become normal defaults.
9. The canonical live site remains unchanged until Dave approves the separate review candidate.

A green result is evidence for these gates only. It is not a claim of AAA parity or a substitute for Dave's playtest.

## Verification evidence

- `npm run verify` passes in a clean-process environment.
- TypeScript passes.
- **41/41 unit tests** pass across gameplay, collision, physics, bots, protocol, and minimap.
- **9/9 Chromium scenarios** pass, including real stand/crouch/prone transitions and the unchanged `>= 40 FPS` gate.
- Local full-quality release capture passes with zero browser-console errors.
- Local two-page PeerJS QA passes with host/client connectivity, **prone stance replication**, and **29.15 m spawn separation**.
- `npm audit --audit-level=high` reports `found 0 vulnerabilities`.
- Normal-quality screenshots were inspected for ADS centring, crosshair suppression, weapon obstruction, menu leakage, HUD balance, and hard-cover readability.

## Implemented evidence

- Dynamic Rapier capsule dimensions and eye heights for all three stances.
- Blocked stand-up under a low ceiling is covered by a physics integration test.
- The procedural optic axis is mathematically aligned to camera centre; the physical orange reticle replaces the hip crosshair during ADS.
- Exact 3D segment/AABB entry-time tests cover sloped rays and nearest-cover selection.
- Shared hitscan resolution clips tracers and prevents target damage when cover is closer than the target.
- Bot shots revalidate cover at the actual shot instant instead of trusting cached awareness.
- Incoming network hits are rejected when the receiver's authoritative cover trace is blocked.
- Remote-player shots clip at cover and create local impact flash/sound.
- Host/client spawn selection uses role preference and live occupancy penalties, eliminating same-team spawn overlap seen by multiplayer QA.

## Honest remaining limitations

This is still an original browser/procedural arena, not a native AAA engine or a literal recreation of another game. It does not copy maps, assets, audio, UI, code, animation data, or branding. Remaining limits include stylised procedural environment geometry, no skeletal prone animation, no killcam, no mobile/touch support, and synthesized Web Audio rather than recorded weapon libraries. Those limits are not represented as bugs fixed by automated tests.

## Isolated HTTPS review deployment

- Review URL: <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass03/?release=0b4d662>
- Source branch/revision: `overhaul/tactical-feel-pass-03` at `6d192e2d890321206904d336a1b1161df70f9d23`.
- Pages revision: `0b4d66297292feccd109f3569ab2a05504bc3ee6`; GitHub Pages API status `built`.
- Review bundle: `assets/index-DZUrMLdw.js`; review stylesheet: `assets/index-CMzxS9np.css`.
- Canonical root remained on the prior `assets/index-OlmsQh-U.js` Pass 02 bundle and returned HTTP 200.
- Public full-quality release QA passed with zero console errors.
- Public two-page QA passed with prone replication, one remote per peer, and 29.1548 m spawn separation.
- A 1280×580 public-menu inspection exposed hidden below-fold controls; a short-height desktop layout was added, locally rechecked, and included in the final review revision. The final menu visibly includes `Z/CTRL prone` without hidden scrolling.