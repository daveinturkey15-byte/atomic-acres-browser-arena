import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUSTWORKS_TOWER, rustworksDeckTopY } from './additional-maps';
import { RUSTWORKS_BLENDER_ASSET, RUSTWORKS_BLENDER_EXPECTED_VERSION } from './rustworks-blender';

function glbJson(buffer: Buffer): Record<string, unknown> {
  expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.byteLength);
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trimEnd());
}

const assetPath = new URL('../public/assets/original/models/rustworks-central-tower.glb', import.meta.url);
const sourcePath = new URL('../source-assets/blender/rustworks-central-tower.blend', import.meta.url);

describe('Rustworks Blender central tower asset', () => {
  it('ships Pass 43 textured Quality kit with embedded PBR and clear access', () => {
    const source = readFileSync(sourcePath);
    const buffer = readFileSync(assetPath);
    const gltf = glbJson(buffer) as {
      nodes?: Array<{
        name?: string;
        translation?: number[];
        rotation?: number[];
        extras?: Record<string, unknown>;
      }>;
      meshes?: unknown[];
      materials?: Array<{ name?: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }>;
      textures?: unknown[];
      images?: unknown[];
      buffers?: Array<{ uri?: string }>;
    };
    const authored = (gltf.nodes ?? []).filter((node) => node.extras?.rustworks_asset_class === 'authored-central-tower');
    const root = authored.find((node) => node.extras?.rustworks_semantic === 'tower-root');
    expect(source.byteLength).toBeGreaterThan(200_000);
    expect(buffer.byteLength).toBeGreaterThan(1_000_000);
    expect(buffer.byteLength).toBeLessThan(8_000_000);
    expect((gltf.meshes?.length ?? 0)).toBeGreaterThanOrEqual(120);
    expect((gltf.materials?.length ?? 0)).toBeGreaterThanOrEqual(6);
    expect((gltf.images?.length ?? 0)).toBeGreaterThanOrEqual(6);
    expect((gltf.textures?.length ?? 0)).toBeGreaterThanOrEqual(6);
    expect(authored.length).toBeGreaterThanOrEqual(120);
    expect(root?.name).toBe('RUSTWORKS_AUTHORED_CENTRAL_TOWER');
    expect(root?.extras?.asset_version).toBe(RUSTWORKS_BLENDER_EXPECTED_VERSION);
    expect(root?.extras?.quality_pass).toBe('pass43-textured-plant');
    expect(Number(root?.extras?.authored_height_metres)).toBeGreaterThanOrEqual(14.6);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'ship-ladder')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'ship-ladder-rung')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'lower-ramp')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'process-equipment')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'upper-access')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'upper-deck')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'yard-tank')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'ground-hardstand')).toBe(true);

    // Control hut / manifold stay in opposite corners so upper centre stays walkable.
    const controlHut = (gltf.nodes ?? []).find((node) => node.name === 'RW_control_hut_shell');
    const manifold = (gltf.nodes ?? []).find((node) => node.name === 'RW_process_manifold');
    expect(controlHut?.translation?.[0]).toBeCloseTo(-2.05, 1);
    expect(controlHut?.translation?.[2]).toBeCloseTo(-2.05, 1);
    expect(manifold?.translation?.[0]).toBeCloseTo(2.15, 1);
    expect(manifold?.translation?.[2]).toBeCloseTo(2.15, 1);

    const upperLanding = (gltf.nodes ?? []).find((node) => node.name === 'RW_ship_ladder_upper_landing');
    const upperLandingZ = upperLanding?.translation?.[2] ?? 0;
    const upperLandingX = upperLanding?.translation?.[0] ?? 0;
    const blockingRails = (gltf.nodes ?? []).filter((node) => node.name?.startsWith('RW_upper_handrail') || node.name?.startsWith('RW_upper_rail_post'));
    expect(blockingRails.length).toBeGreaterThanOrEqual(4);
    for (const rail of blockingRails) {
      const x = rail.translation?.[0] ?? 0;
      const z = rail.translation?.[2] ?? 0;
      const nearOpening = Math.abs(x - upperLandingX) < 0.55 && Math.abs(z - upperLandingZ) < 0.85;
      expect(nearOpening, `${rail.name} crosses upper access opening`).toBe(false);
    }

    const textured = (gltf.materials ?? []).filter((material) => material.pbrMetallicRoughness?.baseColorTexture);
    expect(textured.length).toBeGreaterThanOrEqual(4);
    expect(gltf.buffers?.every((entry) => entry.uri === undefined)).toBe(true);

    // Access ramps still line up with TypeScript deck tops.
    const lowerTop = rustworksDeckTopY(RUSTWORKS_TOWER.lowerDeckCenterY);
    const lowerAngle = RUSTWORKS_TOWER.lowerRampAngleDegrees * Math.PI / 180;
    const lowerLength = (lowerTop - 0.12) / Math.sin(lowerAngle);
    const lowerLandingZ = -RUSTWORKS_TOWER.lowerDeckSize / 2 - 1.55 / 2 + RUSTWORKS_TOWER.landingOverlap;
    const lowerTopZ = lowerLandingZ - 1.55 / 2 + RUSTWORKS_TOWER.landingOverlap;
    const lowerCenterZ = lowerTopZ - Math.cos(lowerAngle) * lowerLength / 2;
    const lowerCenterY = lowerTop
      - Math.sin(lowerAngle) * lowerLength / 2
      - Math.cos(lowerAngle) * 0.28 / 2
      + 0.018;
    const lowerRamp = (gltf.nodes ?? []).find((node) => node.name === 'RW_lower_ramp_shell');
    expect(lowerRamp?.translation?.[1]).toBeCloseTo(lowerCenterY, 1);
    expect(lowerRamp?.translation?.[2]).toBeCloseTo(lowerCenterZ, 1);
  });
});
