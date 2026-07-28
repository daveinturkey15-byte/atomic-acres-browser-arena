import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  AZURE_COIL_ASSET,
  AZURE_COIL_AUTHORITY,
  AZURE_COIL_PATROL,
  AZURE_COIL_SWIM_CLIP,
  AzureCoilPresentation,
  azureCoilPatrolSample,
} from './azure-coil-presentation';

function parseGlb(data: Buffer): Record<string, any> {
  expect(data.subarray(0, 4).toString('utf8')).toBe('glTF');
  expect(data.readUInt32LE(4)).toBe(2);
  expect(data.readUInt32LE(8)).toBe(data.byteLength);
  const jsonLength = data.readUInt32LE(12);
  expect(data.readUInt32LE(16)).toBe(0x4e4f534a);
  return JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8').replace(/[\s\0]+$/u, ''));
}

describe('Azure Coil island patrol contract', () => {
  it('closes the deterministic 24-second ellipse exactly and stays above the playable world', () => {
    const start = azureCoilPatrolSample(0);
    const end = azureCoilPatrolSample(AZURE_COIL_PATROL.periodMs);
    expect(end.x).toBeCloseTo(start.x, 10);
    expect(end.y).toBeCloseTo(start.y, 10);
    expect(end.z).toBeCloseTo(start.z, 10);
    expect(end.yaw).toBeCloseTo(start.yaw, 10);

    const samples = Array.from({ length: 97 }, (_, index) => (
      azureCoilPatrolSample(index / 96 * AZURE_COIL_PATROL.periodMs)
    ));
    expect(Math.min(...samples.map((sample) => sample.y))).toBeGreaterThanOrEqual(
      AZURE_COIL_PATROL.minimumVisualClearanceY,
    );
    expect(Math.max(...samples.map((sample) => sample.y))).toBeLessThanOrEqual(
      AZURE_COIL_PATROL.maximumVisualAltitudeY,
    );
    expect(Math.max(...samples.map((sample) => Math.abs(sample.x)))).toBeLessThanOrEqual(23);
    expect(Math.max(...samples.map((sample) => Math.abs(sample.z)))).toBeLessThanOrEqual(26);
  });

  it('faces local -Z along the orbit tangent and remains presentation-only', () => {
    const sample = azureCoilPatrolSample(0);
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(sample.pitch, sample.yaw, sample.roll, 'YXZ'),
    );
    expect(forward.x).toBeGreaterThan(0.99);
    expect(Math.abs(forward.z)).toBeLessThan(0.01);
    expect(AZURE_COIL_AUTHORITY).toEqual({
      presentationOnly: true,
      blocksShots: false,
      hasRapierCollider: false,
      hasBallisticSurface: false,
      networkReplicated: false,
    });
  });

  it('plays, hides by arena, exposes audit telemetry, and disposes once', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1), new THREE.MeshStandardMaterial());
    root.add(mesh);
    const clip = new THREE.AnimationClip(AZURE_COIL_SWIM_CLIP, 5, []);
    const presentation = new AzureCoilPresentation(root, [clip]);
    presentation.update(1_000);
    presentation.update(1_016);
    expect(presentation.telemetry()).toMatchObject({
      state: 'ready',
      visible: true,
      clip: AZURE_COIL_SWIM_CLIP,
      runtimeScale: 1.05,
      meshes: 1,
      authority: AZURE_COIL_AUTHORITY,
    });
    expect(presentation.telemetry().animationTimeSeconds).toBeGreaterThan(0);
    expect(root.position.y).toBeGreaterThan(AZURE_COIL_PATROL.minimumVisualClearanceY);
    presentation.setArena('gun-range');
    expect(root.visible).toBe(false);
    presentation.setArena('atomic-acres');
    expect(root.visible).toBe(true);
    presentation.dispose();
    presentation.dispose();
    expect(presentation.telemetry().state).toBe('disposed');
  });
});

describe('Azure Coil authored GLB contract', () => {
  const glbPath = new URL(`../public${AZURE_COIL_ASSET}`, import.meta.url);
  const provenancePath = new URL('../source-assets/blender/azure-coil/azure-coil-leviathan.provenance.json', import.meta.url);
  const glb = readFileSync(glbPath);
  const document = parseGlb(glb);
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as Record<string, any>;

  it('ships one self-contained original rig with the named swim animation', () => {
    expect(document.skins?.length).toBeGreaterThanOrEqual(1);
    expect(document.animations?.map((animation: { name?: string }) => animation.name)).toContain(AZURE_COIL_SWIM_CLIP);
    expect(document.meshes?.length).toBeGreaterThanOrEqual(7);
    expect(document.meshes?.length).toBeLessThanOrEqual(12);
    expect(document.materials?.length).toBeGreaterThanOrEqual(7);
    expect(document.images?.length).toBeGreaterThanOrEqual(4);
    const externalUris = [
      ...(document.buffers ?? []),
      ...(document.images ?? []),
    ].flatMap((entry: { uri?: unknown }) => typeof entry.uri === 'string' ? [entry.uri] : []);
    expect(externalUris).toEqual([]);
  });

  it('keeps the hero asset inside its browser budget and matches provenance', () => {
    const triangles = (document.meshes ?? []).reduce((total: number, mesh: { primitives?: Array<{ indices?: number }> }) => (
      total + (mesh.primitives ?? []).reduce((meshTotal, primitive) => {
        if (primitive.indices === undefined) return meshTotal;
        return meshTotal + Math.floor(document.accessors[primitive.indices].count / 3);
      }, 0)
    ), 0);
    expect(triangles).toBeGreaterThanOrEqual(30_000);
    expect(triangles).toBeLessThanOrEqual(80_000);
    expect(glb.byteLength).toBeLessThanOrEqual(8 * 1_024 * 1_024);
    expect(provenance.runtimeGlbSha256).toBe(createHash('sha256').update(glb).digest('hex'));
    expect(provenance.glb.triangles).toBe(triangles);
    expect(provenance.originality).toMatchObject({
      externalModelBytes: false,
      externalImageBytes: false,
      downloadedAssets: [],
    });
    expect(provenance.authority).toEqual({
      presentationOnly: true,
      blocksShots: false,
      rapierCollider: false,
      ballisticSurface: false,
      networkReplicated: false,
    });
  });
});
