/**
 * Tangent-space normal map from a millimetre height field (HF-536).
 *
 * Sobel-gradient neighbourhood with WRAPPED indices (the height field is a torus), so the
 * normal map tiles as exactly as the height field does. Tangent-space conventions:
 * - +X (red) points along +u (increasing column index);
 * - +Y (green) points along +v (up). Canvas row 0 is v = 1, so "up" is DECREASING row
 *   index and the vertical gradient uses the row above minus the row below;
 * - +Z (blue) is out of the surface, always positive (nz = 1 before normalisation).
 *
 * `strength` scales the gradient: 1.0 is metric-true slope (mm per mm); higher values
 * exaggerate relief without changing the authored geometry.
 */

export interface NormalMap {
  rgba: Uint8ClampedArray;
  /** Fraction of texels whose decoded z exceeds 0.92 (the "mostly +Z" proof input). */
  fractionMostlyZ: number;
}

export function normalFromHeight(
  heightMm: Float32Array,
  size: number,
  mmPerPx: number,
  strength: number,
): NormalMap {
  const rgba = new Uint8ClampedArray(size * size * 4);
  let mostlyZ = 0;
  for (let y = 0; y < size; y++) {
    const row = y * size;
    const rowUp = ((y - 1 + size) % size) * size;
    const rowDown = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const xLeft = (x - 1 + size) % size;
      const xRight = (x + 1) % size;
      // Sobel operators (gradient along u and along v), wrapped neighbours.
      const su =
        heightMm[row + xLeft] +
        2 * heightMm[rowUp + xLeft] +
        heightMm[rowDown + xLeft] -
        heightMm[row + xRight] -
        2 * heightMm[rowUp + xRight] -
        heightMm[rowDown + xRight];
      const sv =
        heightMm[rowUp + xLeft] +
        2 * heightMm[rowUp + x] +
        heightMm[rowUp + xRight] -
        heightMm[rowDown + xLeft] -
        2 * heightMm[rowDown + x] -
        heightMm[rowDown + xRight];
      const gx = (su * strength) / (8 * mmPerPx);
      const gy = (sv * strength) / (8 * mmPerPx);
      const inverseLength = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx * inverseLength;
      const ny = -gy * inverseLength;
      const nz = inverseLength;
      if (nz > 0.92) mostlyZ++;
      const o = (row + x) * 4;
      rgba[o] = nx * 127.5 + 127.5;
      rgba[o + 1] = ny * 127.5 + 127.5;
      rgba[o + 2] = nz * 127.5 + 127.5;
      rgba[o + 3] = 255;
    }
  }
  return { rgba, fractionMostlyZ: mostlyZ / (size * size) };
}
