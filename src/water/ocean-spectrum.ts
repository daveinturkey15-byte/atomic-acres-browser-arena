/**
 * ocean-spectrum.ts — the single frozen wave-band table and CPU ocean sampler.
 *
 * HF-358: owner-directed water/ocean upgrade. This module extends the previous
 * five warped-sine bands (src/water-system.ts) to true Gerstner authoring:
 * per-band unit direction, wavelength -> wave number k = 2*pi/lambda, and
 * deep-water dispersion (omega = sqrt(g*k), phase speed c = sqrt(g/k) — the
 * Forge water.hlsl:55-75 pattern). The five wavelengths carry the previous
 * 22-180 m spectrum forward so the sea keeps its authored storm-swell scale.
 *
 * Authority contract:
 * - sampleOcean() is the sole CPU authority for wave height, surface normal
 *   and vertical surface velocity. Buoyancy, drag and the swim state all read
 *   this sampler; every render profile and every peer must agree byte-for-byte.
 * - The VERTICAL field is authoritative. Horizontal Gerstner chop is
 *   presentation-only at OCEAN_CHOP_PRESENTATION_GAIN (the tidewarden 0.22
 *   precedent) so the CPU height field stays a deterministic function of
 *   (x, z, t) — no horizontal-displacement inversion enters gameplay.
 * - Per-band steepness follows the Forge map3 pattern
 *   (steepness = amplitude * k * 0.42) and the summed steepness is clamped
 *   below 1 so the presentation surface can never loop over itself.
 */

export const OCEAN_GRAVITY = 9.81;

/**
 * Retains the semantics of RUSTWORKS_OCEAN_AUTHORITY_ID: one shared spectrum
 * is the render *and* physics authority. water-system.ts re-exports this under
 * the historical name for existing telemetry/QA consumers.
 */
export const OCEAN_SPECTRUM_AUTHORITY_ID = 'shared-render-physics-ocean-spectrum' as const;

/**
 * Global reference amplitude (metres). Wave height participates in buoyancy
 * and is therefore gameplay authority, not a graphics-quality knob — identical
 * across compat/performance/blender (see water-quality.ts, which deliberately
 * has no amplitude field).
 */
export const OCEAN_REFERENCE_AMPLITUDE = 1.55;

/** Presentation-only lateral Gerstner chop gain (tidewarden ocean.ts 0.22). */
export const OCEAN_CHOP_PRESENTATION_GAIN = 0.22;

/** Forge map3_water.hlsl:96-107 steepness pattern: Q-contribution = a*k*0.42. */
export const OCEAN_STEEPNESS_GAIN = 0.42;

/** Hard ceiling for summed steepness; Gerstner loops when the sum reaches 1. */
export const OCEAN_MAX_TOTAL_STEEPNESS = 0.9;

export type OceanBand = Readonly<{
  /** Unit propagation direction (world XZ). */
  directionX: number;
  directionZ: number;
  /** Wavelength in metres. */
  wavelength: number;
  /** k = 2*pi/wavelength (rad/m). */
  waveNumber: number;
  /** Deep-water dispersion: omega = sqrt(g*k) (rad/s). */
  angularFrequency: number;
  /** Phase speed c = sqrt(g/k) = omega/k (m/s). */
  phaseSpeed: number;
  /** Fraction of the global amplitude carried by this band. */
  weight: number;
  /** Clamped per-band steepness contribution (dimensionless, sums < 1). */
  steepness: number;
  /** Authored phase offset (rad). */
  phase: number;
}>;

type OceanBandAuthoring = Readonly<{
  directionX: number;
  directionZ: number;
  wavelength: number;
  weight: number;
  phase: number;
}>;

// Direction and phase authoring carried over from the previous OCEAN_WAVES
// table (long storm swells down to tight chop); wavelengths restate the same
// 22-180 m spectrum explicitly so dispersion derives from physical lambda.
const BAND_AUTHORING: readonly OceanBandAuthoring[] = [
  { directionX: 0.91, directionZ: 0.41, wavelength: 180, weight: 0.68, phase: 0.31 },
  { directionX: -0.22, directionZ: 0.98, wavelength: 103, weight: 0.41, phase: 1.73 },
  { directionX: 0.65, directionZ: -0.76, wavelength: 60, weight: 0.24, phase: 3.14 },
  { directionX: -0.95, directionZ: -0.31, wavelength: 36, weight: 0.13, phase: 4.86 },
  { directionX: 0.37, directionZ: 0.93, wavelength: 22, weight: 0.065, phase: 5.77 },
];

function buildBands(): readonly OceanBand[] {
  const raw = BAND_AUTHORING.map((band) => {
    const directionLength = Math.hypot(band.directionX, band.directionZ);
    const waveNumber = (2 * Math.PI) / band.wavelength;
    const amplitude = band.weight * OCEAN_REFERENCE_AMPLITUDE;
    return {
      directionX: band.directionX / directionLength,
      directionZ: band.directionZ / directionLength,
      wavelength: band.wavelength,
      waveNumber,
      angularFrequency: Math.sqrt(OCEAN_GRAVITY * waveNumber),
      phaseSpeed: Math.sqrt(OCEAN_GRAVITY / waveNumber),
      weight: band.weight,
      steepness: OCEAN_STEEPNESS_GAIN * waveNumber * amplitude,
      phase: band.phase,
    };
  });
  const totalSteepness = raw.reduce((sum, band) => sum + band.steepness, 0);
  const steepnessScale = totalSteepness > OCEAN_MAX_TOTAL_STEEPNESS
    ? OCEAN_MAX_TOTAL_STEEPNESS / totalSteepness
    : 1;
  return Object.freeze(raw.map((band) => Object.freeze({
    ...band,
    steepness: band.steepness * steepnessScale,
  })));
}

/** The single frozen spectrum: GPU displacement and CPU physics both read it. */
export const OCEAN_BANDS: readonly OceanBand[] = buildBands();

/** Summed steepness after clamping — must stay strictly below 1. */
export const OCEAN_TOTAL_STEEPNESS = OCEAN_BANDS
  .reduce((sum, band) => sum + band.steepness, 0);

export type OceanSample = Readonly<{
  /** Vertical displacement (metres) relative to the body's mean level. */
  height: number;
  /** d(height)/dx and d(height)/dz of the authoritative vertical field. */
  slopeX: number;
  slopeZ: number;
  /** Unit surface normal of the vertical field. */
  normal: Readonly<{ x: number; y: number; z: number }>;
  /** d(height)/dt (m/s) — surface bob velocity for buoyancy matching. */
  verticalVelocity: number;
}>;

/**
 * The sole CPU ocean authority. Vertical Gerstner field:
 *   phase_i = k_i * (d_i . p) - omega_i * t + phi_i
 *   height  = sum a_i * sin(phase_i),  a_i = weight_i * amplitude
 * Horizontal chop is deliberately absent here (presentation-only on the GPU).
 */
export function sampleOcean(
  x: number,
  z: number,
  timeSeconds: number,
  amplitude: number = OCEAN_REFERENCE_AMPLITUDE,
): OceanSample {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let verticalVelocity = 0;
  for (const band of OCEAN_BANDS) {
    const scaledAmplitude = band.weight * amplitude;
    const phase = (x * band.directionX + z * band.directionZ) * band.waveNumber
      - timeSeconds * band.angularFrequency
      + band.phase;
    const sinPhase = Math.sin(phase);
    const cosPhase = Math.cos(phase);
    height += sinPhase * scaledAmplitude;
    slopeX += cosPhase * scaledAmplitude * band.waveNumber * band.directionX;
    slopeZ += cosPhase * scaledAmplitude * band.waveNumber * band.directionZ;
    verticalVelocity -= cosPhase * scaledAmplitude * band.angularFrequency;
  }
  const normalLength = Math.hypot(slopeX, 1, slopeZ);
  return {
    height,
    slopeX,
    slopeZ,
    normal: {
      x: -slopeX / normalLength,
      y: 1 / normalLength,
      z: -slopeZ / normalLength,
    },
    verticalVelocity,
  };
}

/**
 * Stable fingerprint of every constant the GPU expression is built from.
 * ocean-tsl.ts stamps the fingerprint of the table it consumed into mesh
 * userData; the CPU/GPU parity test asserts both sides read one frozen table.
 */
export function oceanSpectrumFingerprint(): string {
  const bands = OCEAN_BANDS.map((band) => [
    band.directionX,
    band.directionZ,
    band.waveNumber,
    band.angularFrequency,
    band.weight,
    band.steepness,
    band.phase,
  ].map((value) => value.toFixed(12)).join(','));
  return `gerstner-v1|g=${OCEAN_GRAVITY}|chop=${OCEAN_CHOP_PRESENTATION_GAIN}|${bands.join(';')}`;
}
