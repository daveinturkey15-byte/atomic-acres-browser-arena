export function evaluateTargetExposure(target, options = {}) {
  const minimumPixels = Math.max(0, Number(options.minimumPixels ?? 0));
  const minimumArea = Math.max(0, Number(options.minimumArea ?? 0));
  const minimumHeight = Math.max(0, Number(options.minimumHeight ?? 0));
  const pixels = Number(target?.pixels ?? 0);
  const width = Number(target?.bounds?.width ?? 0);
  const height = Number(target?.bounds?.height ?? 0);
  const area = width * height;
  const reasons = [];
  if (!target) reasons.push('missing-target');
  if (pixels < minimumPixels) reasons.push('insufficient-visible-pixels');
  if (area < minimumArea) reasons.push('insufficient-visible-area');
  if (height < minimumHeight) reasons.push('insufficient-visible-height');
  return {
    passes: reasons.length === 0,
    reasons,
    pixels,
    width,
    height,
    area,
    minimumPixels,
    minimumArea,
    minimumHeight,
  };
}
