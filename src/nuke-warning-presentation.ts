export const GUN_RANGE_NUKE_WARNING_POSITION = Object.freeze([75.75, 7.5, 6] as const);

export type NukeWarningPresentationSample = Readonly<{
  charge: number;
  scale: number;
  rotationY: number;
  coreOpacity: number;
  ringOpacity: number;
  skyFlash: number;
  fogBlend: number;
}>;

export function sampleNukeWarningPresentation(
  elapsedMs: number,
  warningDurationMs: number,
  reducedSensory: boolean,
): NukeWarningPresentationSample {
  const charge = Math.max(0, Math.min(1, elapsedMs / Math.max(1, warningDurationMs)));
  const sensoryScale = reducedSensory ? 0.42 : 1;
  const warningWave = 0.72 + Math.sin(Math.max(0, elapsedMs) * 0.005) * 0.28;
  return Object.freeze({
    charge,
    scale: 0.65 + charge * (reducedSensory ? 0.75 : 1.55),
    rotationY: charge * Math.PI * (reducedSensory ? 0.35 : 1.5),
    coreOpacity: (0.18 + charge * 0.68) * sensoryScale,
    ringOpacity: (0.2 + charge * 0.56) * sensoryScale,
    skyFlash: Math.max(0, warningWave) * charge * 0.18 * sensoryScale,
    fogBlend: charge * 0.24,
  });
}
