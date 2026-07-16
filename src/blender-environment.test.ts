import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BLENDER_ARENA_ASSET } from './blender-environment';

const assetPath = new URL(`../public/${BLENDER_ARENA_ASSET.replace(/^\.\/assets\//, 'assets/')}`, import.meta.url);
const specPath = new URL('../source-assets/blender/atomic-acres-arena-spec.json', import.meta.url);

function glbJson(buffer: Buffer): Record<string, unknown> {
  expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.byteLength);
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trimEnd());
}

describe('Blender Render environment asset', () => {
  it('ships a self-contained, bounded original arena GLB with semantic windows', () => {
    const buffer = readFileSync(assetPath);
    const gltf = glbJson(buffer) as {
      nodes?: Array<{ name?: string; extras?: Record<string, unknown> }>;
      meshes?: unknown[];
      materials?: Array<{ name?: string }>;
      images?: unknown[];
      buffers?: Array<{ uri?: string }>;
    };
    const semanticWindows = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_semantic === 'breakable-window');
    expect(buffer.byteLength).toBeGreaterThan(50_000);
    expect(buffer.byteLength).toBeLessThan(5_000_000);
    expect(gltf.meshes?.length).toBe(24);
    expect(gltf.materials?.length).toBe(18);
    expect(gltf.images ?? []).toHaveLength(0);
    expect(gltf.buffers?.every((bufferInfo) => !bufferInfo.uri)).toBe(true);
    expect(semanticWindows).toHaveLength(6);
    expect(new Set(semanticWindows.map((node) => node.extras?.atomic_window_id)).size).toBe(6);
    expect((gltf.nodes ?? []).some((node) => node.name === 'BLD_BATCH_MAT_asphalt_charcoal')).toBe(true);
    expect((gltf.nodes ?? []).some((node) => node.name === 'BLD_BATCH_MAT_ground_olive')).toBe(true);
    expect((gltf.nodes ?? []).some((node) => node.name === 'BLD_BATCH_MAT_gunmetal')).toBe(true);
  });

  it('matches every authoritative breakable-window id generated for Blender', () => {
    const buffer = readFileSync(assetPath);
    const gltf = glbJson(buffer) as { nodes?: Array<{ extras?: Record<string, unknown> }> };
    const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
      schema: string;
      houses: Array<{ solids: Array<{ id: string; kind: string; breakable: boolean }> }>;
    };
    const expected = spec.houses.flatMap((house) => house.solids)
      .filter((solid) => solid.kind === 'glass' && solid.breakable)
      .map((solid) => solid.id)
      .sort();
    const actual = (gltf.nodes ?? [])
      .map((node) => node.extras?.atomic_window_id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
    expect(spec.schema).toBe('atomic-acres-blender-arena-v1');
    expect(actual).toEqual(expected);
  });
});
