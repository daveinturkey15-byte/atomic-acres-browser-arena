import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createBallisticSurface,
  traceBallisticPath,
  weaponPenetrationEnergy,
  type BallisticSurface,
  type BallisticTrace,
} from './ballistics';
import { WEAPONS } from './gameplay';
import { canonicalSha256 } from './canonical-state';
import { isStateTrafficMessage } from './protocol';
import {
  createAndAttachThinMetalPerforationRuntime,
  createThinMetalPerforationRuntime,
  disposeThinMetalPerforationRuntime,
  resetThinMetalPerforationRuntime,
  rollbackThinMetalPerforationRuntime,
} from './thin-metal-perforation-runtime';
import { FIELD_SHED_DEFINITION } from './destructible-shed-definition';
import { buildNuketown2 } from './nuketown2-arena';
import {
  THIN_METAL_MAX_HOLES_PER_ARENA,
  THIN_METAL_MAX_HOLES_PER_PANEL,
  THIN_METAL_PERFORATION_MIN_ENERGY_Q,
  ThinMetalPerforationAuthority,
  isThinMetalPerforationEnvelope,
  isThinMetalPerforationStateMessage,
  thinMetalPanelPlacements,
  type ThinMetalPanelSpec,
} from './thin-metal-perforation';

/** A 0.9 x 0.22 x 0.08 m sign blade at x=7.6, exactly the nuketown2 shape. */
function bladeBounds(x = 7.6): {
  minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number;
} {
  return { minX: x - 0.45, maxX: x + 0.45, minY: 2.54, maxY: 2.76, minZ: -0.49, maxZ: -0.41 };
}

function bladeSurface(id: string, x = 7.6): BallisticSurface {
  return createBallisticSurface(id, 'verge street name blade', bladeBounds(x), { material: 'thin-metal' });
}

const CARBINE = WEAPONS.carbine.penetration;
/** Energy the carbine has left at point-blank: far above the thin-metal floor. */
const CARBINE_ENERGY_Q = Math.round(weaponPenetrationEnergy(CARBINE) * 10);

function panelAuthority(surfaceIds: string[], hostAuthority = true): ThinMetalPerforationAuthority {
  const surfaces = surfaceIds.map((id) => bladeSurface(id));
  const placements = thinMetalPanelPlacements(
    [{ surfaceName: 'verge street name blade', hitsToOpen: 3 }] as readonly ThinMetalPanelSpec[],
    surfaces,
  );
  return new ThinMetalPerforationAuthority('nuketown2', 4, placements, hostAuthority);
}

function hitAt(
  authority: ThinMetalPerforationAuthority,
  surface: BallisticSurface,
  point: { x: number; y: number; z: number },
  penetrationEnergyQ = CARBINE_ENERGY_Q,
) {
  return authority.applyPanelImpact({
    surface,
    point,
    penetrationEnergyQ,
    penetrated: true,
  });
}

describe('thin-metal perforation (HF-467, R3 section 9 sibling)', () => {
  it('derives one panel per handed half and rejects authoring typos', () => {
    const surfaces = [bladeSurface('a:1'), bladeSurface('a:2', -7.6)];
    const placements = thinMetalPanelPlacements(
      [{ surfaceName: 'verge street name blade', hitsToOpen: 3 }],
      surfaces,
    );
    expect(placements).toHaveLength(2);
    expect(placements[0]!.id).toBe('verge street name blade#0');
    expect(placements[1]!.id).toBe('verge street name blade#1');
    expect(() => thinMetalPanelPlacements(
      [{ surfaceName: 'verge sign board', hitsToOpen: 3 }],
      surfaces,
    )).toThrow(/no shot surface named/);
    expect(() => thinMetalPanelPlacements(
      [{ surfaceName: 'verge street name blade', hitsToOpen: 3 }, { surfaceName: 'verge street name blade', hitsToOpen: 5 }],
      surfaces,
    )).toThrow(/claimed twice/);
  });

  it('opens a hole exactly at the authored hit count, at the hit point', () => {
    const authority = panelAuthority(['a:1']);
    const surface = bladeSurface('a:1');
    const point = { x: 7.7, y: 2.7, z: -0.45 };
    expect(hitAt(authority, surface, point)?.accepted).toBe(true);
    expect(hitAt(authority, surface, point)?.accepted).toBe(true);
    // Two hits in: counted, but no hole, no aperture, no pass-through.
    expect(authority.apertureQuery(surface, point)).toBe(false);
    const third = hitAt(authority, surface, point);
    expect(third?.accepted).toBe(true);
    expect(authority.apertureQuery(surface, point)).toBe(true);
    // The aperture is the hole, not the panel: a point 0.2 m along the blade
    // is still solid sheet.
    expect(authority.apertureQuery(surface, { x: 7.9, y: 2.7, z: -0.45 })).toBe(false);
    expect(authority.apertureQuery(bladeSurface('a:2'), point)).toBe(false);
  });

  it('lets the canonical trace pass through the open hole and nowhere else', () => {
    const authority = panelAuthority(['a:1']);
    const surface = bladeSurface('a:1');
    const origin = { x: 7.7, y: 2.7, z: 2 };
    const direction = { x: 0, y: 0, z: -1 };
    // Thin metal is a penetrable class: the round always crosses the sheet
    // while it is intact - but it MEETS the surface and pays the energy toll.
    // An open hole removes the meeting entirely, at that exact entry point.
    const meetsPanel = (trace: BallisticTrace): boolean =>
      trace.impacts.some((impact) => impact.surface.id === 'a:1');
    const intact = traceBallisticPath(origin, direction, 4, CARBINE, [surface], authority.apertureQuery);
    expect(meetsPanel(intact)).toBe(true);
    for (let index = 0; index < 3; index += 1) hitAt(authority, surface, { x: 7.7, y: 2.7, z: -0.45 });
    const throughHole = traceBallisticPath(origin, direction, 4, CARBINE, [surface], authority.apertureQuery);
    expect(meetsPanel(throughHole)).toBe(false);
    const offHole = traceBallisticPath(
      { x: 7.95, y: 2.7, z: 2 }, direction, 4, CARBINE, [surface], authority.apertureQuery,
    );
    expect(meetsPanel(offHole)).toBe(true);
  });

  it('respects the per-panel and global hole budgets', () => {
    const surfaces = Array.from({ length: 20 }, (_unused, index) => bladeSurface(`a:${String(index).padStart(2, '0')}`, index * 2));
    const authority = new ThinMetalPerforationAuthority(
      'nuketown2', 4,
      thinMetalPanelPlacements(
        [{ surfaceName: 'verge street name blade', hitsToOpen: 1 }],
        surfaces,
      ),
      true,
    );
    const centreX = (surface: BallisticSurface): number => (surface.bounds.minX + surface.bounds.maxX) / 2;
    // hitsToOpen 1: one hit opens the first hole at that point, a hit at a
    // second point opens the second, and the per-panel cap stops a third
    // hole (the hit still counts).
    const first = surfaces[0]!;
    hitAt(authority, first, { x: centreX(first) - 0.2, y: 2.7, z: -0.45 });
    hitAt(authority, first, { x: centreX(first) + 0.2, y: 2.7, z: -0.45 });
    expect(hitAt(authority, first, { x: centreX(first), y: 2.6, z: -0.45 })?.accepted).toBe(true);
    expect(authority.panelStates()[0]!.holes).toHaveLength(THIN_METAL_MAX_HOLES_PER_PANEL);
    // Panels 1..11 add two holes each: 2 + 22 = 24 = exactly the arena cap.
    for (const surface of surfaces.slice(1, 12)) {
      hitAt(authority, surface, { x: centreX(surface) - 0.2, y: 2.7, z: -0.45 });
      hitAt(authority, surface, { x: centreX(surface) + 0.2, y: 2.7, z: -0.45 });
    }
    const holes = authority.panelStates().reduce((sum, state) => sum + state.holes.length, 0);
    expect(holes).toBe(THIN_METAL_MAX_HOLES_PER_ARENA);
    // At the cap a fresh panel still counts the hit but mints nothing.
    const thirteenth = surfaces[12]!;
    const capped = hitAt(authority, thirteenth, { x: centreX(thirteenth), y: 2.7, z: -0.45 });
    expect(capped?.accepted).toBe(true);
    expect(authority.panelStates()[12]!.holes).toHaveLength(0);
    expect(authority.panelStates()[12]!.hits).toBe(1);
  });
  it('never lets a guest mint a hole, but still applies the host envelope', () => {
    const host = panelAuthority(['a:1']);
    const guest = panelAuthority(['a:1'], false);
    const surface = bladeSurface('a:1');
    const point = { x: 7.7, y: 2.7, z: -0.45 };
    for (let index = 0; index < 3; index += 1) hitAt(host, surface, point);
    expect(host.apertureQuery(surface, point)).toBe(true);
    const refused = hitAt(guest, surface, point);
    expect(refused?.accepted).toBe(false);
    expect(refused?.reason).toBe('guest-cannot-mint-hole');
    expect(guest.apertureQuery(surface, point)).toBe(false);
    expect(guest.applyAuthoritativeEnvelope(host.stateEnvelope())).toBe(true);
    expect(guest.apertureQuery(surface, point)).toBe(true);
  });

  it('replicates through a hash-bound envelope and rejects tampering', () => {
    const host = panelAuthority(['a:1']);
    const guest = panelAuthority(['a:1'], false);
    const surface = bladeSurface('a:1');
    const point = { x: 7.7, y: 2.7, z: -0.45 };
    expect(guest.applyAuthoritativeEnvelope(host.stateEnvelope())).toBe(true);
    for (let index = 0; index < 3; index += 1) hitAt(host, surface, point);
    const envelope = host.stateEnvelope();
    expect(isThinMetalPerforationEnvelope(envelope)).toBe(true);
    const message = {
      type: 'thin-metal-perforation-state',
      schemaVersion: envelope.schemaVersion,
      by: 'host-1',
      envelope,
      nonce: 7,
    } as const;
    expect(isThinMetalPerforationStateMessage(message)).toBe(true);
    expect(isStateTrafficMessage(message)).toBe(true);
    expect(isThinMetalPerforationStateMessage({ ...message, by: 'guest-1' })).toBe(true);
    expect(isThinMetalPerforationStateMessage({ ...message, nonce: -1 })).toBe(false);
    expect(isThinMetalPerforationStateMessage({ ...message, envelope: { ...envelope, hash: 'f'.repeat(64) } })).toBe(false);
    const tampered = { ...envelope, panels: envelope.panels.map((state) => ({ ...state, hits: 99 })) };
    expect(isThinMetalPerforationEnvelope(tampered)).toBe(false);
    expect(guest.applyAuthoritativeEnvelope(tampered)).toBe(false);
    expect(guest.applyAuthoritativeEnvelope(envelope)).toBe(true);
    expect(guest.apertureQuery(surface, point)).toBe(true);
    // A stale epoch is refused: the state belongs to a different match.
    const nextEpochAuthority = new ThinMetalPerforationAuthority('nuketown2', 5, thinMetalPanelPlacements(
      [{ surfaceName: 'verge street name blade', hitsToOpen: 3 }],
      [surface],
    ), false);
    expect(nextEpochAuthority.applyAuthoritativeEnvelope(envelope)).toBe(false);
  });

  it('rejects a valid older envelope after a newer state was applied', () => {
    const host = panelAuthority(['a:1']);
    const guest = panelAuthority(['a:1'], false);
    const surface = bladeSurface('a:1');
    const point = { x: 7.7, y: 2.7, z: -0.45 };
    const oldEnvelope = host.stateEnvelope();
    for (let index = 0; index < 3; index += 1) hitAt(host, surface, point);
    expect(guest.applyAuthoritativeEnvelope(host.stateEnvelope())).toBe(true);
    expect(guest.apertureQuery(surface, point)).toBe(true);
    expect(guest.applyAuthoritativeEnvelope(oldEnvelope)).toBe(false);
    expect(guest.apertureQuery(surface, point)).toBe(true);
  });

  it('rejects subset panels and panel states from another match', () => {
    const surfaces = [bladeSurface('a:1'), bladeSurface('a:2')];
    const placements = thinMetalPanelPlacements(
      [{ surfaceName: 'verge street name blade', hitsToOpen: 3 }],
      surfaces,
    );
    const host = new ThinMetalPerforationAuthority('nuketown2', 4, placements, true);
    const guest = new ThinMetalPerforationAuthority('nuketown2', 4, placements, false);
    const envelope = host.stateEnvelope();
    const rehash = (panels: readonly typeof envelope.panels[number][]) => ({
      ...envelope,
      panels,
      hash: canonicalSha256({
        schemaVersion: envelope.schemaVersion,
        arenaId: envelope.arenaId,
        matchEpoch: envelope.matchEpoch,
        revision: envelope.revision,
        panels: [...panels].sort((left, right) => left.panelId.localeCompare(right.panelId)),
      }),
    });
    const subset = rehash([envelope.panels[0]!]);
    expect(isThinMetalPerforationEnvelope(subset)).toBe(true);
    expect(guest.applyAuthoritativeEnvelope(subset)).toBe(false);
    const wrongMatch = rehash(envelope.panels.map((state) => ({ ...state, arenaId: 'gun-range' as const })));
    expect(isThinMetalPerforationEnvelope(wrongMatch)).toBe(true);
    expect(guest.applyAuthoritativeEnvelope(wrongMatch)).toBe(false);
  });

  it('keeps hole ids fresh when a guest is promoted to host', () => {
    const surfaces = Array.from({ length: 5 }, (_unused, index) => bladeSurface(`fresh:${index}`));
    const placements = thinMetalPanelPlacements(
      [{ surfaceName: 'verge street name blade', hitsToOpen: 1 }],
      surfaces,
    );
    const host = new ThinMetalPerforationAuthority('nuketown2', 4, placements, true);
    const guest = new ThinMetalPerforationAuthority('nuketown2', 4, placements, false);
    for (const surface of surfaces.slice(0, 4)) hitAt(host, surface, { x: 7.7, y: 2.7, z: -0.45 });
    expect(guest.applyAuthoritativeEnvelope(host.stateEnvelope())).toBe(true);
    guest.setHostAuthority(true);
    expect(hitAt(guest, surfaces[4]!, { x: 7.7, y: 2.7, z: -0.45 })?.accepted).toBe(true);
    const minted = guest.panelStates().find((state) => state.panelId.endsWith('#4'))?.holes[0];
    expect(minted?.id).toBe(4);
  });

  it('restores the prior scene root and disposes a failed successor', () => {
    const scene = new THREE.Scene();
    const placements = thinMetalPanelPlacements(
      [{ surfaceName: 'verge street name blade', hitsToOpen: 3 }],
      [bladeSurface('rollback:1')],
    );
    const previous = createAndAttachThinMetalPerforationRuntime(
      { id: 'nuketown2', thinMetalPanels: placements }, 4, true, scene,
    )!;
    const next = createAndAttachThinMetalPerforationRuntime(
      { id: 'nuketown2', thinMetalPanels: placements }, 4, true, scene,
    )!;
    const dispose = vi.spyOn(next.authority, 'dispose');
    previous.authority.root.removeFromParent();
    expect(rollbackThinMetalPerforationRuntime(previous, next, scene)).toBe(previous);
    expect(previous.authority.root.parent).toBe(scene);
    expect(next.authority.root.parent).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    previous.authority.dispose();
  });

  it('requires sub-threshold and non-penetrating hits to be ignored', () => {
    const authority = panelAuthority(['a:1']);
    const surface = bladeSurface('a:1');
    const point = { x: 7.7, y: 2.7, z: -0.45 };
    // Below the thin-metal entry cost the round never bought into the sheet.
    const weak = hitAt(authority, surface, point, THIN_METAL_PERFORATION_MIN_ENERGY_Q - 1);
    expect(weak?.accepted).toBe(false);
    expect(weak?.reason).toBe('sub-threshold-hit');
    // A round that entered but STOPPED in the panel left no through-hole.
    const stopped = authority.applyPanelImpact({
      surface, point, penetrationEnergyQ: CARBINE_ENERGY_Q, penetrated: false,
    });
    expect(stopped?.accepted).toBe(false);
    expect(authority.panelStates()[0]!.hits).toBe(0);
  });

  it('resets holes on epoch advance and refuses regressions', () => {
    const authority = panelAuthority(['a:1']);
    const surface = bladeSurface('a:1');
    const point = { x: 7.7, y: 2.7, z: -0.45 };
    for (let index = 0; index < 3; index += 1) hitAt(authority, surface, point);
    expect(authority.apertureQuery(surface, point)).toBe(true);
    authority.reset(5);
    expect(authority.apertureQuery(surface, point)).toBe(false);
    expect(authority.panelStates()[0]!.hits).toBe(0);
    expect(() => authority.reset(5)).toThrow(/epoch must advance/);
  });

  it('leaves the destructible shed contract alone', () => {
    // The sibling must not loosen the shed validator's retained behaviour:
    // exactly one door surface, exactly six pre-authored chunks, and the shed
    // thresholds are untouched by this module (no import, no mutation).
    expect(FIELD_SHED_DEFINITION.preauthoredChunkIds).toHaveLength(6);
    expect(FIELD_SHED_DEFINITION.doorSurfaceId).toBe('door-south');
    expect(FIELD_SHED_DEFINITION.thresholds.perforateEnergyQ).toBe(21);
  });

  it('builds a bounded hole presentation without perturbing arena geometry', () => {
    const authority = panelAuthority(['a:1']);
    const surface = bladeSurface('a:1');
    const point = { x: 7.7, y: 2.7, z: -0.45 };
    for (let index = 0; index < 3; index += 1) hitAt(authority, surface, point);
    const group = authority.root;
    expect(group.name).toBe('thin-metal-perforation:nuketown2');
    const instanced = group.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
    expect(instanced.length).toBe(2);
    for (const mesh of instanced) {
      expect(mesh.count).toBe(1);
      expect(mesh.instanceMatrix.count).toBeLessThanOrEqual(THIN_METAL_MAX_HOLES_PER_ARENA);
    }
    authority.dispose();
  });
  it('dispose returns the nuketown2 presentation GPU inventory to baseline (F-06)', () => {
    const scene = new THREE.Scene();
    const arena = buildNuketown2(scene);
    // Cold GPU inventory of the built arena. Geometry/material/texture counts
    // are the unit-test proxy for compiled programs (one distinct material is
    // one program family), snapshot() taken before and after the full
    // create-and-dispose lifecycle the arena switch performs.
    const snapshot = (): { meshes: number; geometries: number; materials: number; textures: number } => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      let meshes = 0;
      scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        meshes += 1;
        geometries.add(node.geometry);
        const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of nodeMaterials) {
          materials.add(material);
          if (material instanceof THREE.MeshStandardMaterial && material.map) textures.add(material.map);
        }
      });
      return { meshes, geometries: geometries.size, materials: materials.size, textures: textures.size };
    };
    const baseline = snapshot();
    const runtime = createAndAttachThinMetalPerforationRuntime(arena, 4, true, scene)!;
    const created = snapshot();
    // The cold presentation adds exactly the rim pair, the disc pair and the
    // torn-edge stencil: two meshes, two geometries, two materials, one texture.
    expect(created.meshes - baseline.meshes).toBe(2);
    expect(created.geometries - baseline.geometries).toBe(2);
    expect(created.materials - baseline.materials).toBe(2);
    expect(created.textures - baseline.textures).toBe(1);
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    runtime.authority.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      resources.add(node.geometry);
      const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of nodeMaterials) {
        resources.add(material);
        if (material instanceof THREE.MeshStandardMaterial && material.map) resources.add(material.map);
      }
    });
    expect(resources.size).toBe(5);
    const disposals = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
    // The exact arena-switch retirement lifecycle: remove the root, then
    // dispose the authority - every created GPU resource released exactly once.
    runtime.authority.root.removeFromParent();
    disposeThinMetalPerforationRuntime(runtime);
    expect(disposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(snapshot()).toEqual(baseline);
  });
  it('resets against its own prior epoch with no shed runtime present (F-08)', () => {
    const placements = thinMetalPanelPlacements(
      [{ surfaceName: 'verge street name blade', hitsToOpen: 3 }],
      [bladeSurface('own-epoch:1')],
    );
    const runtime = createThinMetalPerforationRuntime({ id: 'nuketown2', thinMetalPanels: placements }, 4, true)!;
    const surface = bladeSurface('own-epoch:1');
    const point = { x: 7.7, y: 2.7, z: -0.45 };
    for (let index = 0; index < 3; index += 1) hitAt(runtime.authority, surface, point);
    expect(runtime.authority.apertureQuery(surface, point)).toBe(true);
    // No shed runtime exists anywhere in this scenario: the epoch guard reads
    // the thin-metal runtime's own prior epoch, so the new match still lands.
    resetThinMetalPerforationRuntime(runtime, 5, true);
    expect(runtime.authority.apertureQuery(surface, point)).toBe(false);
    expect(runtime.authority.panelStates()[0]!.hits).toBe(0);
    expect(runtime.authority.stateEnvelope().matchEpoch).toBe(5);
    // A repeat call at the same epoch must not re-reset (the authority throws
    // on a non-advancing epoch); host authority still updates.
    expect(() => resetThinMetalPerforationRuntime(runtime, 5, false)).not.toThrow();
    expect(runtime.authority.hasHostAuthority()).toBe(false);
    // An epoch regression is a no-op on the tracked prior epoch, not a throw.
    expect(() => resetThinMetalPerforationRuntime(runtime, 4, false)).not.toThrow();
    expect(runtime.authority.stateEnvelope().matchEpoch).toBe(5);
  });

  it('keeps the legacy-main thin-metal reset outside the shed guard (F-08)', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const hoisted = "resetThinMetalPerforationRuntime(thinMetalPerforationRuntime, interactiveWorldMatchEpoch, mode !== 'client');";
    const call = source.indexOf(hoisted);
    expect(call).toBeGreaterThanOrEqual(0);
    // The shed-derived priorEpoch form is gone.
    expect(source).not.toContain('resetThinMetalPerforationRuntime(thinMetalPerforationRuntime, interactiveWorldMatchEpoch, priorEpoch');
    // The call sits before the shed guard; the guard body resets only the shed.
    const guard = source.indexOf('if (interactiveWorldRuntime) {', call);
    expect(guard).toBeGreaterThan(call);
    const guardEnd = source.indexOf('resetBreakableWindows();', guard);
    expect(guardEnd).toBeGreaterThan(guard);
    const guardBody = source.slice(guard, guardEnd);
    expect(guardBody).not.toContain('ThinMetalPerforation');
    expect(guardBody).toContain('interactiveWorldRuntime.reset(interactiveWorldMatchEpoch)');
  });
});
