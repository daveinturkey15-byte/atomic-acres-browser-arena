import type { Box2 } from '../collision';

export const TRAILER_FRAME_RAIL_M = 0.07;
export const TRAILER_FRAME_DEPTH_M = 0.012;

/** Local boxes for the physical four-bar frame. The arena alone registers
 * authority. Full-width horizontals own the corners; upright ends meet them
 * without the positive-volume overlap of the original presentation boxes. */
export function trailerFrameBoxes(
  door: { y0: number; y1: number; halfWidth: number }, rearZ: number,
): Box2[] {
  const halfRail = TRAILER_FRAME_RAIL_M / 2;
  if (![door.y0, door.y1, door.halfWidth, rearZ].every(Number.isFinite)
    || door.y1 - door.y0 <= TRAILER_FRAME_RAIL_M || door.halfWidth <= TRAILER_FRAME_RAIL_M) {
    throw new Error('Trailer frame requires finite dimensions and a nonempty opening');
  }
  const depth = { minZ: rearZ, maxZ: rearZ + TRAILER_FRAME_DEPTH_M };
  return [
    { ...depth, minX: door.halfWidth - TRAILER_FRAME_RAIL_M, maxX: door.halfWidth,
      minY: door.y0 + halfRail, maxY: door.y1 - halfRail },
    { ...depth, minX: -door.halfWidth, maxX: -door.halfWidth + TRAILER_FRAME_RAIL_M,
      minY: door.y0 + halfRail, maxY: door.y1 - halfRail },
    ...[door.y0, door.y1].map(y => ({ ...depth, minX: -door.halfWidth, maxX: door.halfWidth,
      minY: y - halfRail, maxY: y + halfRail })),
  ];
}
