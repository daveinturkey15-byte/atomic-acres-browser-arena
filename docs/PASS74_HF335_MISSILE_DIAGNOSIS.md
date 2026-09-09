# PASS74 / HF-335 — Chopper Gunner HUD and Missiles: Diagnosis

**Lane:** CHOPPER GUNNER HUD AND MISSILES ONLY  
**Worktree:** `C:/Users/david/projects/atomic-acres-pass74`  
**Commit baseline:** `73cc0868`  
**Status:** DIAGNOSIS ONLY — no `src/` files or tests modified.

---

## Executive Summary & Verdict

**PARTIAL REGRESSION CONFIRMED (Missile Flight Presentation). The HUD and authoritative combat mechanics are already correct, but the visual launch origin and 3D flight trajectory regressed in Pass 72 (`73b61ba8`) and were never restored by `aa114737` (contrary to the ledger note).**

1. **HUD Control Strip & Ammo Readout:** **RESOLVED & VERIFIED.** The legible `LMB GUN | RMB MISSILES ×N` control strip, responsive layout, and authoritative ammo synchronization landed cleanly across `aa114737` and `821eb8e0`. No `src/legacy-main.ts` changes are needed for the HUD.
2. **Authority, Damage, Cadence, & Capacity:** **PROVEN CORRECT.** Capacity (`6`), cadence (`1,000ms`), flight duration (`780ms`), max splash damage (`240`), blast radius (`4.5m`), and free-fire raycast targeting (`chopperMissileGroundTarget`) are 100% identical to the Pass 71 reference implementation.
3. **Missile Launch & Flight Trajectory:** **REGRESSED (P1 Visual / Spatial).** In Pass 71, missiles launched from alternating left/right wing sockets (`CHOPPER_MISSILE_SOCKET_LOCAL_M`), were oriented toward the ground impact point, and flew along the true 3D vector. Currently in Pass 74, missiles spawn directly 14m above the ground impact point and drop straight down vertically along the Y axis like an aerial bomb.

---

## Detailed Findings Matrix (Pass 71 vs Pass 74)

### 1. Launch Position, Socket Hardpoints, and 3D Flight Trajectory
- **Status:** **REGRESSED**
- **Pass 71 Reference (`1e043fb2` / `6751a4d1`):**
  - Hardpoint offsets defined in `src/killstreak-runtime.ts`: `CHOPPER_MISSILE_SOCKET_LOCAL_M = { left: [-1.75, -0.65, 0.4], right: [1.75, -0.65, 0.4] }`.
  - `chopperMissileLaunchPosition(firingPosition, firingAttitude, ordinal)` computed the exact 3D world-space launch coordinate.
  - Host runtime emitted `launchPosition` on `impactEvents` during the `drop` phase.
  - In `src/killstreak-presentation.ts`, the missile shell copied `shell.launchPosition`, called `shell.root.lookAt(shell.impactPosition)` + `shell.root.rotateX(Math.PI / 2)`, and interpolated in full 3D space: `shell.root.position.lerpVectors(shell.launchPosition, shell.impactPosition, progress)`.
- **Pass 74 Current (HEAD):**
  - `src/killstreak-runtime.ts:2474–2482` — `impactEvents.push` omits `launchPosition` entirely.
  - `src/killstreak-presentation.ts:3463–3475` — `shell.startY` is hardcoded to `impact.position[1] + CHOPPER_MISSILE_PRESENTATION_ALTITUDE_M` (14m directly above the target). Shell position is initialized at `(impact.position[0], shell.startY, impact.position[2])`.
  - `src/killstreak-presentation.ts:3468` — `shell.root.rotation.x = 0` (points straight down).
  - `src/killstreak-presentation.ts:3279` — `shell.root.position.y = THREE.MathUtils.lerp(shell.startY, shell.impactPosition.y, progress)`. Only the Y axis is interpolated.
- **Impact:** Missiles do not appear to come from the player's gunship; they suddenly appear in the sky 14m directly above the target point and drop vertically like carpet bombs.

---

### 2. Salvo & Reload Cadence
- **Status:** **PROVEN CORRECT (Identical to Pass 71)**
- **Evidence:**
  - `src/killstreak-runtime.ts:43` — `export const CHOPPER_MISSILE_CADENCE_MS = 1_000;`
  - `src/killstreak-runtime.ts:1995–2001` — Single-shot edge trigger: RMB intent sets `pendingPlayerMissile` only when `entity.pendingPlayerMissile === null`, `entity.missilesRemaining > 0`, and `nowMs >= entity.nextMissileAtMs`. RMB clicks during cooldown are cleanly rejected without queuing stale launches.
  - `src/killstreak-runtime.ts:2462` — `entity.nextMissileAtMs = nowMs + CHOPPER_MISSILE_CADENCE_MS;` enforces exact 1.0s spacing between consecutive missile releases.
  - Unit tests in `src/chopper-gunner-missile.test.ts:74–86` verify strict cadence enforcement and cooldown snapshot reporting.

---

### 3. Magazine Capacity
- **Status:** **PROVEN CORRECT (Identical to Pass 71)**
- **Evidence:**
  - `src/killstreak-runtime.ts:42` — `export const CHOPPER_MISSILE_CAPACITY = 6;`
  - `src/killstreak-runtime.ts:1654` — Initialized on chopper spawn: `missilesRemaining: CHOPPER_MISSILE_CAPACITY`.
  - `src/killstreak-runtime.ts:2461` — Authoritatively decremented on each launch: `entity.missilesRemaining -= 1;`.
  - `src/killstreak-protocol.ts:326, 464` — Network replication strictly bounds `missileAmmo` in `[0, CHOPPER_MISSILE_CAPACITY]` and ordinals in `[0, 5]`.
  - There is no mid-flight reload mechanism (6 total missiles per deployment, matching Pass 71).

---

### 4. Damage & Blast Radius
- **Status:** **PROVEN CORRECT (Identical to Pass 71)**
- **Evidence:**
  - `src/killstreak-runtime.ts:46–47`:
    - `export const CHOPPER_MISSILE_BLAST_RADIUS_M = 4.5;`
    - `export const CHOPPER_MISSILE_MAX_DAMAGE = 240;`
  - `src/killstreak-runtime.ts:2441–2451` & `3008–3039` — `damageAround` applies linear radial falloff: `damage = Math.max(1, Math.round(maximum * (1 - range / radius * 0.75)))`.
  - `src/killstreak-runtime.ts:3030–3032` — Lifted LOS origin (`origin[1] + 0.08`) prevents floor colliders from self-occluding ground blast damage.
  - `src/legacy-main.ts:21418–21420` — Destructible environment collapse and support explosion visual effects triggered at impact point with exact `CHOPPER_MISSILE_BLAST_RADIUS_M` and `CHOPPER_MISSILE_MAX_DAMAGE`.

---

### 5. Lock-On vs Free-Fire Ground Targeting
- **Status:** **PROVEN CORRECT (Identical to Pass 71)**
- **Evidence:**
  - `src/killstreak-runtime.ts:771–795` — `chopperMissileGroundTarget`: Raycasts along the authoritative gunner view ray (`chopperGunnerAuthoritativeRay`) against arena bounding box and terrain height map in 0.5m steps up to `CHOPPER_MISSILE_MAX_RANGE_M = 120`.
  - There is no homing or target lock-on. (Pass 71's `primaryChopperMissileTarget` function was solely an audit/evidence logger for QA receipts in `chopperMissileAuthorityEvents`, not a gameplay steering mechanism). Missiles are purely free-fire aimed by player crosshair.

---

### 6. HUD Ammo Readout & Authoritative Synchronization
- **Status:** **PROVEN CORRECT (Resolved in `aa114737` and `821eb8e0`)**
- **Evidence:**
  - `src/ui/pass64-shell.ts:401–408` — Control strip markup contains:
    - `<div id="gunner-control-strip">`
    - `#gunner-gun-control` with `<kbd>LMB</kbd><span>GUN</span><strong class="gunner-control-value"><b id="gunner-control-gun-ammo">&infin;</b></strong>`
    - `#gunner-missile-status` with `<kbd>RMB</kbd><span>MISSILES</span><strong class="gunner-control-value"><i aria-hidden="true">&times;</i><b id="gunner-missile-ammo">0 / 6</b></strong><em id="gunner-missile-cooldown">OFFLINE</em>`
  - `src/legacy-main.ts:21183–21190` — Per-frame update formats `element('#gunner-missile-ammo').textContent = `${ammo} / ${CHOPPER_MISSILE_CAPACITY}`;` and sets `element('#gunner-missile-cooldown').textContent` to `READY`, `${cooldown}S`, or `EMPTY`.
  - The `<i>&times;</i>` multiplier glyph is authored as a sibling element in HTML, avoiding any double 'x' formatting (`× 6 / 6`).
  - `src/ui/pass65-hud.css:1230–1317` — Control strip styles provide responsive scaling, high-contrast typography, and phone-specific stacking above bottom instruments.

---

## Bounded Fix Instructions for Follow-up Agent

**Goal:** Restore the Pass 71 alternating socket launch position and 3D flight trajectory presentation without altering damage numbers, cadence, or HUD markup.

### 1. `src/killstreak-runtime.ts`
- Re-export `CHOPPER_MISSILE_SOCKET_LOCAL_M`:
  ```ts
  export const CHOPPER_MISSILE_SOCKET_LOCAL_M = Object.freeze({
    left: Object.freeze([-1.75, -0.65, 0.4] as const),
    right: Object.freeze([1.75, -0.65, 0.4] as const),
  });
  ```
- Re-export `chopperMissileLaunchPosition`:
  ```ts
  export function chopperMissileLaunchPosition(
    position: SupportVec3,
    attitude: SupportVec3,
    ordinal: number,
  ): SupportVec3 {
    const socket = ordinal % 2 === 0
      ? CHOPPER_MISSILE_SOCKET_LOCAL_M.left
      : CHOPPER_MISSILE_SOCKET_LOCAL_M.right;
    return translatedSupportOffset(position, attitude, socket);
  }
  ```
- In `advanceChopper` (around lines 2465–2483), compute `const launchPosition = chopperMissileLaunchPosition(firingPosition, firingAttitude, ordinal);` and pass `launchPosition` into `entity.pendingMissiles` and `impactEvents.push`.

### 2. `src/killstreak-presentation.ts`
- In `presentImpacts` (around line 3450), when `isChopperMissile` and `impact.phase === 'drop'`:
  - Read `impact.launchPosition` (with fallback to helicopter position or current Y+14m if null).
  - Position shell at `shell.launchPosition`.
  - Orient shell: `shell.root.lookAt(shell.impactPosition); shell.root.rotateX(Math.PI / 2);`.
- In `updateBombShells` (around line 3276):
  - Interpolate in full 3D: `shell.root.position.lerpVectors(shell.launchPosition, shell.impactPosition, progress);`.

### 3. `src/chopper-gunner-missile.test.ts`
- Update test assertions to verify `launch.impactEvents[0].launchPosition` matches `chopperMissileLaunchPosition(before.position, before.attitude, 0)`.

### 4. `docs/PASS74_OWNER_FEEDBACK_LEDGER_2026-08-21.md`
- Update HF-335 status from `PARTIALLY LANDED` to `IMPLEMENTED` once verified.

---

## File Allowlist
- `src/killstreak-runtime.ts`
- `src/killstreak-presentation.ts`
- `src/chopper-gunner-missile.test.ts`
- `docs/PASS74_OWNER_FEEDBACK_LEDGER_2026-08-21.md`

**Strict Blocklist (Do NOT Touch):**
- `src/legacy-main.ts` (HUD sync, input handling, and explosion triggers are already correct)
- `src/ui/pass64-shell.ts` (control strip HTML is already correct)
- `src/ui/pass65-hud.css` (control strip CSS layout is already correct)
- `src/killstreak-protocol.ts` (protocol schema and validators already support impact positions)
