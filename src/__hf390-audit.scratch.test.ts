import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import { BALLISTIC_MATERIALS, isBallisticMaterialId, type BallisticSurface } from './ballistics';
import { buildFarcrysis } from './farcrysis';
import { buildHighSeas } from './high-seas';
import { buildArena, type ArenaMap } from './map';

interface ArenaBuild {
  shotSurfaces: readonly BallisticSurface[];
  raycastMeshes: readonly THREE.Object3D[];
}

function fakeCanvasContext() {
  const gradient = () => ({ addColorStop: vi.fn() });
  const state: Record<PropertyKey, unknown> = {};
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'createImageData') {
        return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      }
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
      if (typeof prop === 'string') {
        if (!(prop in target)) target[prop] = vi.fn();
        return target[prop];
      }
      return undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument() {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0, getContext: () => context, style: {},
      setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
    }),
    getElementById: () => null,
    documentElement: { dataset: {} },
    body: { appendChild: () => undefined },
  });
}

it('hf390 audit dump', () => {
  stubCanvasDocument();
  const builders: Array<[string, () => ArenaBuild]> = [
    ['atomic-acres', () => buildArena(new THREE.Scene())],
    ['skyline-terminal', () => buildSkylineTerminal(new THREE.Scene())],
    ['rustworks-1v1', () => buildRustworks1v1(new THREE.Scene())],
    ['gun-range', () => buildGunRange(new THREE.Scene())],
    ['farcrysis', () => buildFarcrysis(new THREE.Scene())],
    ['high-seas', () => buildHighSeas(new THREE.Scene())],
  ];
  const report: Record<string, unknown> = {};
  for (const [id, build] of builders) {
    try {
      const arena = build() as unknown as ArenaMap;
      const surfaces: readonly BallisticSurface[] = arena.shotSurfaces;
      const byMaterial: Record<string, number> = {};
      const byClass: Record<string, number> = {};
      const fallbacks: string[] = [];
      const invalidRatings: string[] = [];
      for (const s of surfaces) {
        byMaterial[s.material] = (byMaterial[s.material] ?? 0) + 1;
        byClass[s.classification] = (byClass[s.classification] ?? 0) + 1;
        if (s.classification === 'fallback') fallbacks.push(`${s.id} :: ${s.name}`);
        if (!isBallisticMaterialId(s.material)) invalidRatings.push(s.id);
        const rule = BALLISTIC_MATERIALS[s.material];
        if (!rule || !Number.isFinite(rule.entryCost) || rule.entryCost <= 0) invalidRatings.push(s.id);
      }
      const unstamped = arena.raycastMeshes
        .filter((m) => typeof m.userData.ballisticSurfaceId !== 'string')
        .map((m) => `${m.name}|targetId=${String(m.userData.targetId)}`);
      const surfaceById = new Map(surfaces.map((s) => [s.id, s]));
      const stampMismatches: string[] = [];
      for (const m of arena.raycastMeshes) {
        const sid = m.userData.ballisticSurfaceId as string | undefined;
        if (typeof sid !== 'string') continue;
        const surf = surfaceById.get(sid);
        if (!surf) { stampMismatches.push(`${m.name}: missing surface ${sid}`); continue; }
        if (m.userData.ballisticMaterial !== surf.material) {
          stampMismatches.push(`${m.name}: stamp ${String(m.userData.ballisticMaterial)} != surface ${surf.material}`);
        }
      }
      report[id] = {
        surfaces: surfaces.length,
        raycastMeshes: arena.raycastMeshes.length,
        byMaterial,
        byClass,
        fallbacks: fallbacks.slice(0, 40),
        invalidRatings,
        unstampedCount: unstamped.length,
        unstampedSample: unstamped.slice(0, 15),
        stampMismatches: stampMismatches.slice(0, 20),
      };
    } catch (err) {
      report[id] = { BUILD_ERROR: String(err) };
    }
  }
  writeFileSync('hf390-audit.json', JSON.stringify(report, null, 1));
  expect(true).toBe(true);
  vi.unstubAllGlobals();
});
