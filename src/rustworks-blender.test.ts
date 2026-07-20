import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUSTWORKS_BLENDER_ASSET } from './rustworks-blender';

function glbJson(buffer: Buffer): Record<string, unknown> {
  expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.byteLength);
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trimEnd());
}

const assetPath = new URL(`../public/${RUSTWORKS_BLENDER_ASSET.replace(/^\.\/assets\//, 'assets/')}`, import.meta.url);
const sourcePath = new URL('../source-assets/blender/rustworks-central-tower.blend', import.meta.url);

describe('Rustworks Blender central tower asset', () => {
  it('ships both editable Blender source and a bounded self-contained GLB', () => {
    const source = readFileSync(sourcePath);
    const buffer = readFileSync(assetPath);
    const gltf = glbJson(buffer) as {
      nodes?: Array<{ name?: string; extras?: Record<string, unknown> }>;
      meshes?: unknown[];
      materials?: unknown[];
      buffers?: Array<{ uri?: string }>;
    };
    const authored = (gltf.nodes ?? []).filter((node) => node.extras?.rustworks_asset_class === 'authored-central-tower');
    const root = authored.find((node) => node.extras?.rustworks_semantic === 'tower-root');
    expect(source.byteLength).toBeGreaterThan(100_000);
    expect(buffer.byteLength).toBeGreaterThan(50_000);
    expect(buffer.byteLength).toBeLessThan(1_000_000);
    expect(gltf.meshes).toHaveLength(55);
    expect(gltf.materials).toHaveLength(4);
    expect(authored.length).toBeGreaterThanOrEqual(50);
    expect(root?.name).toBe('RUSTWORKS_AUTHORED_CENTRAL_TOWER');
    expect(root?.extras?.asset_version).toBe('pass34-v1');
    expect(root?.extras?.authored_height_metres).toBe(14.6);
    expect(gltf.buffers?.every((entry) => entry.uri === undefined)).toBe(true);
  });
});
