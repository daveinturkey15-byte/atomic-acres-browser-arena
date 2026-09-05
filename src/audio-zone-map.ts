/**
 * PASS 95 audio-polish: the acoustic ZONE MAP. Given the listener's arena and
 * position, answer which acoustic space they are standing in, so ArenaAudio
 * can swap the reverb return and the report tail when the player walks
 * indoors. Pure arithmetic over the arena's authored layout constants - no
 * three.js, no raycast, no allocation - so it can run every HUD tick and be
 * pinned by a headless test.
 *
 * Only Nuke Town has authored interiors today (two houses with garage wings,
 * ground plus upper storey). Every other arena reads as its default space
 * from `ARENA_ACOUSTIC_SPACES`; adding an interior to another arena means
 * adding its footprint here, not touching the audio graph.
 */

import type { ArenaId } from './arena-identity';
import { arenaAcousticSpace, type AcousticSpace } from './audio-immersion';
import {
  NUKETOWN2_GARAGE_SPAN,
  NUKETOWN2_GROUND_STOREY_H,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_HOUSE_WIDTH,
  NUKETOWN2_UPPER_Y0,
  nuketown2HandedX,
} from './nuketown2-layout';
import type { SpatialPoint } from './spatial-audio';

export type AcousticZoneVolume = Readonly<{
  id: string;
  space: AcousticSpace;
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}>;

/** Roof line of the upper storey: the interior stops being a room above it. */
const NUKETOWN2_INTERIOR_TOP_Y = NUKETOWN2_UPPER_Y0 + NUKETOWN2_GROUND_STOREY_H;
/** A little below the slab so a crouched listener on the raised floor still counts. */
const NUKETOWN2_INTERIOR_BOTTOM_Y = -0.5;

function nuketown2HouseVolumes(): readonly AcousticZoneVolume[] {
  const volumes: AcousticZoneVolume[] = [];
  for (const house of NUKETOWN2_HOUSE_LAYOUT) {
    const halfWidth = NUKETOWN2_HOUSE_WIDTH / 2;
    const halfDepth = NUKETOWN2_HOUSE_DEPTH / 2;
    // The layout is authored on the north house; the south house is its
    // 180-degree image, which the layout already expresses through negated
    // x/z. The handedness flip is applied to the FINISHED span so the map
    // matches what the arena actually builds.
    const [x0, x1] = [nuketown2HandedX(house.x - halfWidth), nuketown2HandedX(house.x + halfWidth)].sort((a, b) => a - b);
    volumes.push(Object.freeze({
      id: `nuketown2:${house.id}-house`, space: 'interior-room',
      minX: x0, maxX: x1, minY: NUKETOWN2_INTERIOR_BOTTOM_Y, maxY: NUKETOWN2_INTERIOR_TOP_Y,
      minZ: house.z - halfDepth, maxZ: house.z + halfDepth,
    }));
    // Garage wing: authored on the north house's +x end, mirrored for the
    // south house by the same negation the house centre uses.
    const garageX0 = house.facing === 1 ? NUKETOWN2_GARAGE_SPAN.x0 : -NUKETOWN2_GARAGE_SPAN.x1;
    const garageX1 = house.facing === 1 ? NUKETOWN2_GARAGE_SPAN.x1 : -NUKETOWN2_GARAGE_SPAN.x0;
    const [g0, g1] = [nuketown2HandedX(garageX0), nuketown2HandedX(garageX1)].sort((a, b) => a - b);
    volumes.push(Object.freeze({
      id: `nuketown2:${house.id}-garage`, space: 'interior-room',
      minX: g0, maxX: g1, minY: NUKETOWN2_INTERIOR_BOTTOM_Y, maxY: NUKETOWN2_UPPER_Y0,
      minZ: house.z - halfDepth, maxZ: house.z + halfDepth,
    }));
  }
  return Object.freeze(volumes);
}

/** Authored interior volumes per arena. Arenas without interiors are absent. */
export const ACOUSTIC_ZONE_VOLUMES: Readonly<Partial<Record<ArenaId, readonly AcousticZoneVolume[]>>> = Object.freeze({
  nuketown2: nuketown2HouseVolumes(),
});

function inside(volume: AcousticZoneVolume, point: SpatialPoint): boolean {
  return point.x >= volume.minX && point.x <= volume.maxX
    && point.y >= volume.minY && point.y <= volume.maxY
    && point.z >= volume.minZ && point.z <= volume.maxZ;
}

export type AcousticZoneResult = Readonly<{ space: AcousticSpace; volumeId: string | null }>;

/**
 * The listener's acoustic zone. Returns the containing authored volume's space
 * when inside one, else the arena's default. Non-finite positions read as the
 * arena default so a bad frame can never strand the mix indoors.
 */
export function classifyAcousticZone(arenaId: ArenaId | null | undefined, position: SpatialPoint): AcousticZoneResult {
  const fallback = arenaAcousticSpace(arenaId);
  if (!arenaId || !Number.isFinite(position.x + position.y + position.z)) {
    return { space: fallback, volumeId: null };
  }
  const volumes = ACOUSTIC_ZONE_VOLUMES[arenaId];
  if (volumes) {
    for (const volume of volumes) {
      if (inside(volume, position)) return { space: volume.space, volumeId: volume.id };
    }
  }
  return { space: fallback, volumeId: null };
}

/**
 * The override ArenaAudio.setAcousticSpace() wants: null while the listener is
 * in the arena's default space (so the arena keeps authority), the interior
 * space while inside a volume.
 */
export function acousticSpaceOverrideFor(arenaId: ArenaId | null | undefined, position: SpatialPoint): AcousticSpace | null {
  const zone = classifyAcousticZone(arenaId, position);
  return zone.volumeId ? zone.space : null;
}
