# PASS74 / HF-347 — Gun Range Test Level in Multiplayer: Diagnosis

Lane: GUN RANGE ONLY (RustRig and Terminal are other agents' arenas).
Repo/worktree: `aa-pass75-identity-diagnostics` @ e30af365 (2026-08-22), clean tree.
DIAGNOSIS ONLY — no src/ file was touched.

## Verdict

**CONFIRMED FAULT: the training-dummy lifecycle does NOT replicate. Every peer
runs its own dummies on its own local clock, and every peer applies dummy
damage locally with no host admission.** The owner's complaint ("gun test level
when multiplayer") matches this exactly: a guest sees a dummy at a
guest-computed pose, shoots it, gets a local hitmarker and score, while the
host — which owns all authoritative combatant state — never hears about it and
resolves nothing. Conversely, host-side consumers of dummy positions (chopper /
hunter LOS, support damage) evaluate against the *host's* dummy poses, which
diverge from what the guest sees.

## Evidence chain

### 1. Dummy pose is a pure function of each peer's local clock

- `src/additional-maps.ts:2377` — `updateGunRangePresentation(root, nowMs)`.
- `src/additional-maps.ts:2400` — dummy pose comes from
  `gunRangeTestBayRenderedDummyPose(definition, index, nowMs)`; position/yaw set
  directly on the shared scene graph at 2401–2406.
- `src/gun-range-test-bay.ts:361–387` — `gunRangeTestBayDummyPose` is fully
  deterministic in `(definition, nowMs)`; there is no replicated phase input,
  only the authored static `phase` offset (contract dummies,
  `src/gun-range-test-bay.ts:139–144`).
- `src/legacy-main.ts:26297` — `const visualNow = debugCaptureFixedVisualTimeMs ?? now`
  where `now` is the frame's **local** `performance.now()`; fed to
  `updateTargets(visualNow)` at 26298 and `updateGunRangePresentation(arena.root,
  visualNow)` at 26375.

No peer exchanges any dummy timestamp. Two peers with unsynchronised
`performance.now()` clocks render the four walking dummies at different points
on their triangle-wave routes indefinitely. This is an arena value computed
independently per peer rather than replicated — a candidate fault under the
host-authoritative architecture, and here it is real.

### 2. Dummy damage is applied locally by every peer, including guests

- `src/legacy-main.ts:19751` — `hitPracticeTarget(...)` mutates
  `target.health` (19765), flips `target.active` and sets
  `target.respawnAt = performance.now() + (target.respawnDelayMs ?? 2_200)`
  (19800–19801). There is **no `network.role` gate anywhere in the function**
  and it sends **no network message**.
- Guest fire path: `tryFire` (`src/legacy-main.ts:16195`) runs the local trace
  loop; the practice-target branch at `src/legacy-main.ts:16446–16462` calls
  `hitPracticeTarget(result.targetId, ...)` at 16448 **before** the client
  early-return at 16543 (`if (network.role === 'client') { ... network.send(request); return; }`).
  So a guest both predicts dummy damage locally AND sends a shot-request whose
  dummy component is silently dropped (see §3).
- Score: `publishRangeScore()` (`src/legacy-main.ts:8358`) sends a
  `range-score-claim` that the host accepts monotonically (8371–8377) — so
  guest scores climb off unadmitted local hits. The claim is self-reported;
  nothing verifies a dummy hit ever happened on the host.

### 3. The host's authoritative shot resolver ignores training dummies entirely

- `resolveAuthoritativeShot` (`src/legacy-main.ts:11471`) builds `targetPoses`
  from the local player (11667–11679), remotes (11680–11686) and bots
  (11687–11692) — **no arena.targets / training-dummy branch exists**.
- Outcome application (11760 onward) handles `player.id`, `bots.has(targetId)`,
  then falls through to `remotes.get(targetId)` and `continue`s when absent —
  a dummy id can never be admitted. A guest's shot-request that visually hit a
  dummy produces no outcome, no result entry, nothing.
- Contrast with combatants, who get full rewind/admission
  (`rewindCombatantPoseStrict` at 11668/11681/11688 against
  `request.targetViewTimeMs`). Dummies have no rewind path because they have no
  replicated timeline at all.

### 4. Killstreak/support consumers read per-peer local dummy poses

- `killstreakWorldState()` (`src/legacy-main.ts:20372–20384`) pushes dummies as
  targets using `target.root.getWorldPosition(...)` — i.e. the local peer's
  rendered pose — with `lifeId: Math.max(0, Math.floor(target.respawnAt))`,
  itself a local-clock value (set at 19800).
- Same pattern: `fillExplosiveBoltTargets` (18030–18045),
  `supportTargetState`/`nearestSupportTarget` (21476–21505), hunter swarm
  (21625), nuke (21810), explosive bolts (18253–18263, 18550–18556).
- Consequence: when the HOST admits a chopper/hunter/support activation, its
  LOS and damage checks run against host-local dummy poses; the guest is
  looking at different poses. Support damage events that do reach a guest are
  re-checked against the guest's local `respawnAt` (20913–20918:
  `event.targetLifeId !== Math.max(0, Math.floor(practiceTarget.respawnAt))`)
  — two independent clocks compared through one integer, so valid host damage
  can be dropped on the guest and vice versa.

### 5. `gunRangeTestBayDummyColliders` is dead code in production

- `src/test-bay-dummy-colliders.ts:26` exports
  `gunRangeTestBayDummyColliders(activeDummyIds, nowMs)`; the only importer in
  the repo is its own test file (`src/test-bay-dummy-colliders.test.ts`).
  Zero production call sites (verified by repo-wide grep). The HF-318
  half-buried-collider fix lives in code nothing imports at runtime.
- Live dummy collision therefore happens implicitly via the moving dummy
  meshes/raycast surfaces at each peer's locally computed pose — reinforcing §1.

## Proven negatives (checked, correctly host-authored — do not re-litigate)

- **The secure test-bay door IS host-authored and replicates.** Host-only
  advance gated at `src/legacy-main.ts:6655`
  (`network.role === 'client'` returns null); guests consume
  `privateLobbySnapshot.testBayDoor` (6702, broadcast envelope 28333, guest
  projection 6673–6688 using `snapshotHostTimeMs`). Correct pattern — use it as
  the template for the dummy fix.
- **The gun-range match clock IS host-authoritative.**
  `updateGunRangeMatchClockAuthority` (`src/legacy-main.ts:6813`) advances on
  host only, guests call `projectActiveGunRangeMatchClock` (6816–6818); bay
  occupancy drives pause/boundary edges with checkpoint+broadcast (6839–6844).
- **The Gun Range IS reachable in a hosted lobby**: `multiplayer: true` at
  `src/map-selection.ts:101`; 6P FFA rules label at 99. Reachability is not the
  fault.
- **Killstreak activation admission is host-side** (station hold → host
  admission chain per the pass65/pass69 runtime contract); the *runtime
  targeting* against dummies is what diverges (§4), not admission.

## Sharply scoped fix instruction (for a 30-minute follow-up agent)

**Goal:** make the training-dummy lifecycle host-authored and replicated, using
the already-proven door/clock replication pattern.

1. Extend the host lobby snapshot (the same envelope that already carries
   `testBayDoor`, built in `hostSnapshot` around `src/legacy-main.ts:6860+`,
   consumed at 6702/8759) with a `testDummies` array:
   `{ id, active, health, respawnAtHostTimeMs }[]` plus the snapshot's existing
   `snapshotHostTimeMs`.
2. Host: after `updateTargets`, publish dummy state from the single source of
   truth (`arena.targets` filtered to `kind === 'training-dummy'`).
3. Guests: drive dummy visibility/health from the snapshot (replace the local
   mutation path), and render poses from
   `gunRangeTestBayDummyPose(definition, projectedHostNowMs)` where
   `projectedHostNowMs` is derived exactly like the door's guest projection
   (`projectActiveGunRangeTestBayDoor`, `src/legacy-main.ts:6673–6688`) —
   local now minus skew, clamped to `updatedAtMs`. Do NOT invent a new clock
   sync mechanism; reuse the door's.
4. Gate `hitPracticeTarget` (`src/legacy-main.ts:19751`) to
   `network.role !== 'client'`; convert the guest branch at 16448 into either
   (a) dropping local application and letting the host resolve (requires adding
   a training-dummy branch to `resolveAuthoritativeShot`'s targetPoses +
   outcome application, ~15 lines mirroring the bot branch at 11770), or
   (b) minimal first cut: keep guest prediction visual-only (hitmarker/tracer)
   and reconcile on the next snapshot. Option (a) is the correct end state;
   option (b) is acceptable inside 30 minutes if (a) overruns.
5. Update `lifeId` consumers (20916, 18036, 20378) to compare against the
   replicated `respawnAtHostTimeMs` instead of local `performance.now()`.

**File allowlist:** `src/legacy-main.ts`, `src/gun-range-test-bay.ts` (types
only, if a `GunRangeTestBayDummyState` helper is wanted),
`src/additional-maps.ts` (pose call-site clock swap only). Tests:
`src/additional-maps.test.ts` or a new `src/gun-range-dummy-replication.test.ts`.
Do NOT touch RustRig/Terminal files, `test-bay-dummy-colliders.ts` (dead code —
flag for deletion in a separate lane), or the door/clock authority paths.

**Verification:** vitest unit test asserting (i) two peers given clocks 800 ms
apart produce identical dummy poses once the guest projects through snapshot
host time, and (ii) a guest-side `hitPracticeTarget` call is refused while the
host-resolved equivalent applies. Live two-browser matrix (host shoots dummy A
while guest watches; guest shoots dummy B while host watches) remains the
close-out bar per HF-347.
