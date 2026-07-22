import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HOLY_HAND_FRAG_ASSET,
  HOLY_HAND_FRAG_MAX_DIMENSION,
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

describe('Sanctified Frag presentation', () => {
  it('ships an authored Blender GLB with the sacred silhouette parts and materials', () => {
    expect(HOLY_HAND_FRAG_ASSET).toBe('./assets/original/models/holy-hand-frag.glb');
    const gltf = glbJson('public/assets/original/models/holy-hand-frag.glb');
    const nodeNames = (gltf.nodes ?? []).map((node) => node.name);
    const materialNames = (gltf.materials ?? []).map((material) => material.name);
    expect(nodeNames).toContain('AtomicAcres_SanctifiedFrag');
    expect(nodeNames).toContain('HHG_Body');
    expect(nodeNames).toContain('HHG_CrossStem');
    expect(nodeNames).toContain('HHG_CrossArm');
    expect(nodeNames).toContain('HHG_PinRing');
    expect(nodeNames).toContain('HHG_SafetyLever');
    expect(materialNames).toEqual(expect.arrayContaining(['Holy Gold', 'Blessed Ivory', 'Pin Steel', 'Ruby Enamel']));
  });

  it('keeps a small original fallback while the GLB is unavailable or loading', () => {
    expect(grenadePresentationTelemetry().status).toBe('idle');
    expect(HOLY_HAND_FRAG_MAX_DIMENSION).toBeLessThanOrEqual(0.5);
    const root = createGrenadePresentation();
    expect(root.name).toBe('sanctified-frag-fallback');
    expect(root.userData.authoredGrenade).toBe(false);
    expect(root.getObjectByName('fallback-holy-orb')).toBeTruthy();
    expect(root.getObjectByName('fallback-cross-stem')).toBeTruthy();
    disposeGrenadePresentation(root);
    expect(root.parent).toBeNull();
  });
});
