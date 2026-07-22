import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUSTWORKS_TOWER, rustworksDeckTopY } from './additional-maps';
import { RUSTWORKS_BLENDER_EXPECTED_VERSION } from './rustworks-blender';

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

describe('Rustworks Blender Quality plant asset', () => {
  it('ships the Rustworks-owned tower overhaul with embedded PBR and route-parity metadata', () => {
    const source = readFileSync(sourcePath);
    const buffer = readFileSync(assetPath);
    const gltf = glbJson(buffer) as {
      nodes?: Array<{
        name?: string;
        translation?: number[];
        extras?: Record<string, unknown>;
      }>;
      meshes?: unknown[];
      materials?: Array<{ name?: string; pbrMetallicRoughness?: { baseColorTexture?: unknown } }>;
      textures?: unknown[];
      images?: unknown[];
      buffers?: Array<{ uri?: string }>;
    };
    const authored = (gltf.nodes ?? []).filter((node) => node.extras?.rustworks_asset_class === 'authored-central-tower');
    expect(authored.every((node) => node.extras?.rustworks_asset_owner === 'Rustworks')).toBe(true);
    const root = authored.find((node) => node.extras?.rustworks_semantic === 'tower-root');
    expect(source.byteLength).toBeGreaterThan(400_000);
    expect(buffer.byteLength).toBeGreaterThan(2_500_000);
    expect(buffer.byteLength).toBeLessThan(12_000_000);
    expect((gltf.meshes?.length ?? 0)).toBeGreaterThanOrEqual(150);
    expect((gltf.materials?.length ?? 0)).toBeGreaterThanOrEqual(10);
    expect((gltf.images?.length ?? 0)).toBeGreaterThanOrEqual(10);
    expect((gltf.textures?.length ?? 0)).toBeGreaterThanOrEqual(10);
    expect(authored.length).toBeGreaterThanOrEqual(150);
    expect(root?.name).toBe('RUSTWORKS_AUTHORED_CENTRAL_TOWER');
    expect(root?.extras?.asset_version).toBe(RUSTWORKS_BLENDER_EXPECTED_VERSION);
    expect(root?.extras?.quality_pass).toBe('rustworks-tower-overhaul');
    expect(root?.extras?.container_layout).toBe('four-per-side-one-open-per-side');
    expect(root?.extras?.service_trench).toBe('west-deck-level');
    expect(Number(root?.extras?.authored_height_metres)).toBeGreaterThanOrEqual(15.8);

    for (const semantic of [
      'ship-ladder', 'ship-ladder-rung', 'lower-ramp', 'upper-access',
      'upper-deck', 'rig-leg', 'rig-deck', 'perimeter', 'tower-undercroft',
      'derrick-crown', 'derrick-service-platform', 'derrick-beacon',
      'service-trench', 'service-trench-crossover', 'yard-container',
      'yard-open-container', 'yard-container-placement',
    ] as const) {
      expect(authored.some((node) => node.extras?.rustworks_semantic === semantic), semantic).toBe(true);
    }

    for (const forbidden of ['crane', 'pulley', 'hook', 'cable_tray', 'process_riser', 'RW_pipe', 'control_hut', 'manifold', 'RW_tank_', 'RW_crate_', 'RW_pallet_', 'RW_barrier_']) {
      expect((gltf.nodes ?? []).some((node) => node.name?.toLowerCase().includes(forbidden.toLowerCase())), forbidden).toBe(false);
    }
    const placements = (gltf.nodes ?? []).filter((node) => node.name?.startsWith('RW_container_placement_'));
    const closedContainers = (gltf.nodes ?? []).filter((node) => node.name?.startsWith('RW_shipping_container_'));
    const openShells = (gltf.nodes ?? []).filter((node) => node.extras?.rustworks_semantic === 'yard-open-container');
    expect(placements).toHaveLength(16);
    expect(closedContainers).toHaveLength(12);
    expect(openShells.length).toBeGreaterThanOrEqual(16);
    for (const side of ['north', 'south', 'west', 'east']) {
      const row = placements.filter((node) => node.extras?.rustworks_side === side);
      expect(row, `${side} authored row`).toHaveLength(4);
      expect(row.filter((node) => node.extras?.rustworks_open === true), `${side} authored pass-through`).toHaveLength(1);
    }
    expect((gltf.nodes ?? []).some((node) => node.name === 'RW_canopy_roof')).toBe(false);
    expect((gltf.nodes ?? []).filter((node) => node.name?.startsWith('RW_undercroft_portal_'))).toHaveLength(4);
    expect((gltf.nodes ?? []).filter((node) => node.name?.startsWith('RW_service_trench_wall_'))).toHaveLength(6);

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
    expect(textured.length).toBeGreaterThanOrEqual(8);
    expect(gltf.buffers?.every((entry) => entry.uri === undefined)).toBe(true);

    const lowerTop = rustworksDeckTopY(RUSTWORKS_TOWER.lowerDeckCenterY);
    const lowerAngle = RUSTWORKS_TOWER.lowerRampAngleDegrees * Math.PI / 180;
    const lowerLength = (lowerTop - 0.12) / Math.sin(lowerAngle);
    const lowerLandingZ = -RUSTWORKS_TOWER.lowerDeckSize / 2 - 1.6 / 2 + RUSTWORKS_TOWER.landingOverlap;
    const lowerTopZ = lowerLandingZ - 1.6 / 2 + RUSTWORKS_TOWER.landingOverlap;
    const lowerCenterZ = lowerTopZ - Math.cos(lowerAngle) * lowerLength / 2;
    const lowerCenterY = lowerTop
      - Math.sin(lowerAngle) * lowerLength / 2
      - Math.cos(lowerAngle) * 0.3 / 2
      + 0.02;
    const lowerRamp = (gltf.nodes ?? []).find((node) => node.name === 'RW_lower_ramp_shell');
    // Allow small deck-size drift between presentation kit and collision shell.
    expect(Math.abs((lowerRamp?.translation?.[1] ?? 0) - lowerCenterY)).toBeLessThan(0.45);
    expect(Math.abs((lowerRamp?.translation?.[2] ?? 0) - lowerCenterZ)).toBeLessThan(0.85);
  });
});
