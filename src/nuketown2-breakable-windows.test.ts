import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from './nuketown2-arena';
import {
  BALLISTIC_MATERIAL_CLASS,
  traceBallisticPath,
  weaponPenetrationEnergy,
} from './ballistics';
import {
  admitGlassImpact,
  createGlassState,
  glassAuthorityProjection,
} from './glass-authority';
import { deriveGlassDynamicColliders } from './glass-collider-bounds';
import { WEAPONS } from './gameplay';
import { isHostAuthorityMessage, type WindowBreakMessage } from './protocol';

/**
 * w5-300 (owner HITL 2, HF-464/HF-467): every nuketown2 window pane body —
 * upstairs and downstairs, both houses, mirrored through pair() — is a
 * breakable glass surface on the shipped shatter path.
 *
 * This suite pins the brief's acceptance contract against the SHIPPED
 * mechanism (no duplicate authority, no new pipeline):
 *
 * - rating: each pane carries an explicit `glass` ballistic surface, and
 *   `glass` is the `shatter` class, so bullets admit the break lifecycle;
 * - removal + aperture: one admitted bullet or melee hit breaches the pane,
 *   the projection opens the aperture (`apertureOpen`, pane hidden, no
 *   ballistic solidity), the dynamic collider drops, and a trace over the
 *   remaining surfaces crosses the opening untouched;
 * - host authority: guests cannot mint a break — `admitGlassImpact` rejects
 *   non-host mutation and the `window-break` replication rides the
 *   host-authority channel (mirroring the `thin-metal-perforation-state`
 *   guarantee: `network.ts` drops `isHostAuthorityMessage` payloads arriving
 *   on a guest connection);
 * - shard burst: the breach consumes the existing presentation catalogue
 *   (`spawnPersistentWindowDebris` pooled instanced shards,
 *   `spawnImpactFlash(..., 'glass')`, `audio.impact('glass')` in
 *   `breakHouseWindow`); the inputs that path reads — `paneVisible: false`
 *   and `apertureOpen: true` — are asserted here.
 */

function build() {
  return buildNuketown2(new THREE.Scene());
}

function weakestFirearmProfile() {
  return Object.values(WEAPONS)
    .map((weapon) => weapon.penetration)
    .filter((profile) => weaponPenetrationEnergy(profile) > 0)
    .sort((a, b) => weaponPenetrationEnergy(a) - weaponPenetrationEnergy(b))[0]!;
}

function breachWithBullet(paneId: string) {
  let state = createGlassState(paneId, 1);
  const admission = admitGlassImpact(state, {
    isHost: true,
    matchEpoch: 1,
    expectedRevision: state.revision,
    impactId: `w5-300:bullet:${paneId}`,
    tick: 1,
    profile: 'bullet',
  });
  expect(admission.accepted, `${paneId}: host bullet hit must be admitted`).toBe(true);
  state = admission.state;
  expect(state.phase === 'breached' || state.phase === 'detached').toBe(true);
  return state;
}

describe('w5-300 nuketown2 breakable windows (HF-464 upstairs glass)', () => {
  it('rates every house pane upstairs and downstairs as shatter glass through pair()', () => {
    const arena = build();
    // Two ground-front panes + one upper-front + one upper-back, per house,
    // each mirrored north/south by pair(): 8 panes, 4 authored bodies.
    expect(arena.breakableWindows).toHaveLength(8);
    const bases = arena.breakableWindows.map((pane) => pane.id.replace(/:(north|south)$/, ''));
    expect(new Set(arena.breakableWindows.map((pane) => pane.id)).size).toBe(8);
    expect(new Set(bases).size).toBe(4);
    for (const base of new Set(bases)) {
      expect(
        arena.breakableWindows.filter((pane) => pane.id === `${base}:north`).length,
        `${base} must have a north half`,
      ).toBe(1);
      expect(
        arena.breakableWindows.filter((pane) => pane.id === `${base}:south`).length,
        `${base} must have a south half`,
      ).toBe(1);
    }
    // Upstairs is the owner's explicit ask: two upper panes per house.
    expect(arena.breakableWindows.filter((pane) => pane.id.startsWith('nuketown2-upper-'))).toHaveLength(4);
    for (const pane of arena.breakableWindows) {
      const surface = arena.shotSurfaces.find((entry) => entry.breakableWindowId === pane.id);
      expect(surface, `${pane.id} needs a ballistic surface`).toBeDefined();
      expect(surface!.material).toBe('glass');
      expect(surface!.classification).toBe('explicit');
      expect(BALLISTIC_MATERIAL_CLASS[surface!.material]).toBe('shatter');
    }
    expect(arena.shotSurfaces.filter((entry) => entry.breakableWindowId)).toHaveLength(8);
  });

  it('opens a real aperture on one admitted bullet hit: pane gone, collider dropped, trace crosses', () => {
    const arena = build();
    const targetId = 'nuketown2-upper-front-window:north';
    const surface = arena.shotSurfaces.find((entry) => entry.breakableWindowId === targetId)!;
    expect(surface).toBeDefined();

    // Intact pane: the weakest catalogue firearm hits it and passes through
    // (glass is crossed, then the break opens the frame for good).
    const weakest = weakestFirearmProfile();
    const midX = (surface.bounds.minX + surface.bounds.maxX) / 2;
    const midY = ((surface.bounds.minY ?? 0) + (surface.bounds.maxY ?? 3)) / 2;
    const midZ = (surface.bounds.minZ + surface.bounds.maxZ) / 2;
    const intact = traceBallisticPath(
      { x: midX, y: midY, z: midZ - 3 },
      { x: 0, y: 0, z: 1 },
      6,
      weakest,
      [surface],
    );
    expect(intact.impacts).toHaveLength(1);
    expect(intact.impacts[0]!.penetrated).toBe(true);

    // One admitted bullet breaches: the aperture flag the runtime reads is
    // open, the pane hides (the input the pooled shard burst consumes), and
    // it is no longer ballistically solid.
    const state = breachWithBullet(targetId);
    const projection = glassAuthorityProjection(state);
    expect(projection.apertureOpen).toBe(true);
    expect(projection.paneVisible).toBe(false);
    expect(projection.ballisticSolid).toBe(false);
    expect(projection.movementSolid).toBe(false);
    expect(projection.aiLineOfSightSolid).toBe(false);

    // The dynamic collider drops exactly the breached pane, and a trace over
    // the remaining surfaces — the same removal `activeBallisticSurfaces()`
    // performs — crosses the opening with no impact.
    const panes = arena.breakableWindows;
    const target = panes.find((pane) => pane.id === targetId)!;
    const before = deriveGlassDynamicColliders(panes);
    target.glassState = state;
    const after = deriveGlassDynamicColliders(panes);
    expect(after).toHaveLength(before.length - 1);
    const remaining = arena.shotSurfaces.filter((entry) => entry.breakableWindowId !== targetId);
    const through = traceBallisticPath(
      { x: midX, y: midY, z: midZ - 3 },
      { x: 0, y: 0, z: 1 },
      6,
      weakest,
      remaining,
    );
    expect(through.impacts).toEqual([]);
    expect(through.reachedDistance).toBe(true);
  });

  it('opens the same aperture on one admitted melee hit', () => {
    const paneId = 'nuketown2-upper-back-window:south';
    const state = createGlassState(paneId, 1);
    const admission = admitGlassImpact(state, {
      isHost: true,
      matchEpoch: 1,
      expectedRevision: 0,
      impactId: `w5-300:knife:${paneId}`,
      tick: 2,
      profile: 'knife',
    });
    expect(admission.accepted, 'host melee hit must be admitted').toBe(true);
    expect(admission.state.phase === 'breached' || admission.state.phase === 'detached').toBe(true);
    expect(glassAuthorityProjection(admission.state).apertureOpen).toBe(true);
    expect(glassAuthorityProjection(admission.state).paneVisible).toBe(false);
  });

  it('lets guests mint nothing: non-host impacts rejected and breaks ride the host-authority channel', () => {
    const paneId = 'nuketown2-ground-window-0:north';
    const state = createGlassState(paneId, 1);
    const guest = admitGlassImpact(state, {
      isHost: false,
      matchEpoch: 1,
      expectedRevision: 0,
      impactId: 'w5-300:guest:0',
      tick: 3,
      profile: 'bullet',
    });
    expect(guest.accepted).toBe(false);
    expect(guest.reason).toBe('not-host');
    expect(guest.state).toBe(state);

    // Mirrors the thin-metal-perforation-state guarantee: a host-canonicalized
    // break is host authority (replicated), a bare guest mint is not (dropped
    // at guest ingress by network.ts via isHostAuthorityMessage).
    const guestMint: WindowBreakMessage = {
      type: 'window-break',
      by: 'guest-a',
      windowId: paneId,
      origin: [0, 1.55, -9.9],
      kind: 'shot',
      nonce: 11,
    };
    const hostCanonical: WindowBreakMessage = {
      ...guestMint,
      hostAuthority: { hostId: 'host-1', stickyAttachment: null },
    };
    expect(isHostAuthorityMessage(guestMint)).toBe(false);
    expect(isHostAuthorityMessage(hostCanonical)).toBe(true);
  });

  it('keeps every window-bound surface explicitly rated (no fallback over the panes)', () => {
    // The parity walk-through budget for nuketown2 stays 0: no pane may fall
    // back to unshootable `reinforced` cover, and the full audit
    // (collider-visual-parity gate: zero invisible colliders, zero
    // walk-through meshes beyond the ledger, which names no nuketown2 row)
    // runs in the gate suite.
    const arena = build();
    for (const pane of arena.breakableWindows) {
      const surface = arena.shotSurfaces.find((entry) => entry.breakableWindowId === pane.id)!;
      expect(surface.classification, `${pane.id} must never be fallback`).not.toBe('fallback');
    }
  });
});
