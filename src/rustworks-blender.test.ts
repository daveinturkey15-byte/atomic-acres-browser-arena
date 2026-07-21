import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUSTWORKS_TOWER, rustworksDeckTopY } from './additional-maps';
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
      nodes?: Array<{
        name?: string;
        translation?: number[];
        rotation?: number[];
        extras?: Record<string, unknown>;
      }>;
      meshes?: unknown[];
      materials?: unknown[];
      buffers?: Array<{ uri?: string }>;
    };
    const authored = (gltf.nodes ?? []).filter((node) => node.extras?.rustworks_asset_class === 'authored-central-tower');
    const root = authored.find((node) => node.extras?.rustworks_semantic === 'tower-root');
    expect(source.byteLength).toBeGreaterThan(100_000);
    expect(buffer.byteLength).toBeGreaterThan(50_000);
    expect(buffer.byteLength).toBeLessThan(1_500_000);
    expect((gltf.meshes?.length ?? 0)).toBeGreaterThanOrEqual(55);
    expect(gltf.materials).toHaveLength(4);
    expect(authored.length).toBeGreaterThanOrEqual(50);
    expect(root?.name).toBe('RUSTWORKS_AUTHORED_CENTRAL_TOWER');
    expect(root?.extras?.asset_version).toBe('pass40-v1');
    expect(Number(root?.extras?.authored_height_metres)).toBeGreaterThanOrEqual(14.6);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'ship-ladder')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'ship-ladder-rung')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'lower-ramp')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'process-equipment')).toBe(true);
    expect(authored.some((node) => node.extras?.rustworks_semantic === 'upper-access')).toBe(true);

    const lowerTop = rustworksDeckTopY(RUSTWORKS_TOWER.lowerDeckCenterY);
    const upperTop = rustworksDeckTopY(RUSTWORKS_TOWER.upperDeckCenterY);
    const lowerAngle = RUSTWORKS_TOWER.lowerRampAngleDegrees * Math.PI / 180;
    const lowerLength = (lowerTop - 0.12) / Math.sin(lowerAngle);
    const lowerLandingZ = -RUSTWORKS_TOWER.lowerDeckSize / 2 - 1.35 / 2 + RUSTWORKS_TOWER.landingOverlap;
    const lowerTopZ = lowerLandingZ - 1.35 / 2 + RUSTWORKS_TOWER.landingOverlap;
    const lowerCenterZ = lowerTopZ - Math.cos(lowerAngle) * lowerLength / 2;
    const lowerCenterY = lowerTop
      - Math.sin(lowerAngle) * lowerLength / 2
      - Math.cos(lowerAngle) * 0.28 / 2
      + 0.018;
    const lowerRamp = (gltf.nodes ?? []).find((node) => node.name === 'RW_lower_ramp_shell');
    expect(lowerRamp?.translation?.[1]).toBeCloseTo(lowerCenterY, 2);
    expect(lowerRamp?.translation?.[2]).toBeCloseTo(lowerCenterZ, 2);
    expect(lowerRamp?.rotation?.[0]).toBeCloseTo(-Math.sin(lowerAngle / 2), 3);

    const shipAngle = RUSTWORKS_TOWER.shipLadderAngleDegrees * Math.PI / 180;
    const shipRise = upperTop - lowerTop;
    const shipRun = shipRise / Math.tan(shipAngle);
    const shipLowZ = RUSTWORKS_TOWER.lowerDeckSize / 2 - 0.15;
    const shipHighZ = shipLowZ - shipRun;
    const shipCenterZ = (shipLowZ + shipHighZ) / 2;
    const shipCenterY = (lowerTop + upperTop) / 2 - Math.cos(shipAngle) * 0.22 / 2 + 0.018;
    const shipLadder = (gltf.nodes ?? []).find((node) => node.name === 'RW_ship_ladder_slab');
    expect(shipLadder?.translation?.[1]).toBeCloseTo(shipCenterY, 2);
    expect(shipLadder?.translation?.[2]).toBeCloseTo(shipCenterZ, 2);
    expect(shipLadder?.rotation?.[0]).toBeCloseTo(Math.sin(shipAngle / 2), 3);

    const controlHut = (gltf.nodes ?? []).find((node) => node.name === 'RW_control_hut_shell');
    const manifold = (gltf.nodes ?? []).find((node) => node.name === 'RW_process_manifold');
    const processPipeA = (gltf.nodes ?? []).find((node) => node.name === 'RW_process_pipe_a');
    const processRiser = (gltf.nodes ?? []).find((node) => node.name === 'RW_process_riser_-1.35');
    expect(controlHut?.translation?.[0]).toBeCloseTo(-1.35, 2);
    expect(controlHut?.translation?.[1]).toBeCloseTo(9.55, 2);
    expect(controlHut?.translation?.[2]).toBeCloseTo(-1.45, 2);
    expect(manifold?.translation?.[0]).toBeCloseTo(1.55, 2);
    expect(manifold?.translation?.[1]).toBeCloseTo(9.35, 2);
    expect(manifold?.translation?.[2]).toBeCloseTo(1.85, 2);
    expect(processPipeA?.translation?.[0]).toBeCloseTo(-2.4, 2);
    expect(processPipeA?.translation?.[1]).toBeCloseTo(4.6, 2);
    expect(processPipeA?.translation?.[2]).toBeCloseTo(2.6, 2);
    expect(processRiser?.translation?.[0]).toBeCloseTo(-1.35, 2);
    expect(processRiser?.translation?.[1]).toBeCloseTo(6.1, 2);
    expect(processRiser?.translation?.[2]).toBeCloseTo(-3.05, 2);

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

    expect(gltf.buffers?.every((entry) => entry.uri === undefined)).toBe(true);
  });
});
