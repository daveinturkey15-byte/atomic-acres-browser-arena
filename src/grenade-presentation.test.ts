import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FRAG_GRENADE_ASSET,
  FRAG_GRENADE_MAX_DIMENSION,
  createGrenadePresentation,
  disposeGrenadePresentation,
  grenadePresentationTelemetry,
} from './grenade-presentation';

function glbJson(path: string): { nodes?: Array<{ name?: string }>; materials?: Array<{ name?: string }> } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
  expect(bytes.readUInt32LE(4)).toBe(2);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

describe('conventional fragmentation grenade presentation', () => {
  it('ships an authored Blender GLB with a normal frag silhouette and mechanical parts', () => {
    expect(FRAG_GRENADE_ASSET).toBe('./assets/original/models/frag-grenade.glb');
    const gltf = glbJson('public/assets/original/models/frag-grenade.glb');
    const nodeNames = (gltf.nodes ?? []).map((node) => node.name);
    const materialNames = (gltf.materials ?? []).map((material) => material.name);
    expect(nodeNames).toContain('AtomicAcres_FragGrenade');
    expect(nodeNames).toContain('Frag_Body');
    expect(nodeNames).toContain('Frag_FuseHead');
    expect(nodeNames).toContain('Frag_PullRing');
    expect(nodeNames).toContain('Frag_SafetyLever');
    expect(materialNames).toEqual(expect.arrayContaining(['Olive cast steel', 'Phosphate fuse', 'Safety lever', 'Pull pin']));
    expect(nodeNames.some((name) => /cross|holy|jewel|crown/i.test(name ?? ''))).toBe(false);
  });

  it('keeps a small original fallback while the GLB is unavailable or loading', () => {
    expect(grenadePresentationTelemetry().status).toBe('idle');
    expect(FRAG_GRENADE_MAX_DIMENSION).toBeLessThanOrEqual(0.5);
    const root = createGrenadePresentation();
    expect(root.name).toBe('frag-grenade-fallback');
    expect(root.userData.authoredGrenade).toBe(false);
    expect(root.getObjectByName('fallback-frag-body')).toBeTruthy();
    expect(root.getObjectByName('fallback-frag-lever')).toBeTruthy();
    expect(root.getObjectByName('fallback-frag-pin-ring')).toBeTruthy();
    disposeGrenadePresentation(root);
    expect(root.parent).toBeNull();
  });
});
