import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
// CANDIDATE 8: `thin-metal-perforation` hoisted the ballistic-impact routing
// out of legacy-main.ts into `routeInteractiveWorldBallisticImpact()` (to pay
// the legacy size ratchet), so the composition this file pins now spans two
// modules. The scanned SURFACE widens to follow the hoist; not one assertion
// below is relaxed, and legacy-main.ts is still required to call the hoisted
// router (asserted immediately below), so the route cannot be quietly dropped.
const routedSource = readFileSync(
  new URL('./thin-metal-perforation-runtime.ts', import.meta.url), 'utf8');
const composition = `${source}
${routedSource}`;

describe('live Atomic-house destruction composition contract', () => {
  it('replaces map-static movement and ballistic authority with the revisioned runtime', () => {
    expect(source).toContain('activeArena.houseDestruction?.definitions ?? []');
    expect(source).toContain('new Set(activeArena.houseDestruction?.staticColliders ?? [])');
    expect(source).toContain('activeArena.colliders.filter((collider) => !replacedStatic.has(collider))');
    expect(source).toContain('runtimeOwnsHouseSurfaces ? activeArena.houseDestruction?.staticBallisticSurfaceIds ?? [] : []');
    expect(source).toContain('!replacedHouseSurfaces.has(surface.id)');
    expect(source).toContain('const surfaces = activeBallisticSurfaces(traceArena);');
    expect(source).toContain("collision.dynamicColliders.filter((entry) => !entry.id.includes('debris:'))");
    expect(source).toContain('object.userData.dynamicAuthorityReplacement === true');
    expect(source).toContain('prepareRaycastMeshes: () => {');
    expect(source).toContain('return activeRaycastMeshes();');
  });

  it('routes house shots, physics and windows through the shared deterministic budget', () => {
    // legacy-main must still reach the hoisted router, or the composition below
    // would be satisfied by dead code in a module nothing calls.
    expect(source).toContain('routeInteractiveWorldBallisticImpact(');
    expect(composition).toContain('interactiveWorldRuntime.applyHouseBulletImpact({');
    expect(source).toContain('`house-debris:${impact.surface.houseMajorDebris.fragmentId}`');
    expect(source).toContain("canAdmitMajorDebris(counts, 'window')");
    expect(source).toContain('Math.min(capacity, SHARED_MAJOR_DEBRIS_BUDGET.window)');
  });

  it('falls Quality back only when profile-owned structural geometry has detached', () => {
    expect(source).toContain('interactiveWorldRuntime?.hasDetachedProfileOwnedHouseFragment()');
    expect(source).toContain('interactiveWorldRuntime?.setExternalHouseProfilePresentationActive(atomicQualityPrimary)');
    expect(source).toContain('arena.root.visible = !qualityOwnsStaticFragments');
    expect(source).toContain('arenaArtRoot.visible = blenderArenaActive ? qualityOwnsStaticFragments : true');
  });
});
