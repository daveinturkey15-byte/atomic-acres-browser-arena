export const DEFAULT_CORAL_MASK = Object.freeze({
  redMinimum: 150,
  greenMinimum: 42,
  greenMaximum: 195,
  blueMaximum: 175,
  redGreenLead: 28,
  redBlueLead: 32,
});

export const DEFAULT_EXCLUDED_REGIONS = Object.freeze([
  // Pass 63's persistent hostile-operator notification uses the same Coral
  // palette as operators. It is HUD, so it must never authorize aim or fire.
  Object.freeze({ minimumXRatio: 0.67, maximumXRatio: 1, minimumYRatio: 0.05, maximumYRatio: 0.31 }),
]);

export function isCoralPixel(red, green, blue, config = DEFAULT_CORAL_MASK) {
  return red >= config.redMinimum
    && green >= config.greenMinimum
    && green <= config.greenMaximum
    && blue <= config.blueMaximum
    && red - green >= config.redGreenLead
    && red - blue >= config.redBlueLead;
}

export function findCoralTargets(raw, width, height, channels = 3, options = {}) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('Vision frame dimensions must be positive integers');
  }
  if (!Number.isInteger(channels) || channels < 3) throw new Error('Vision frame must have at least three channels');
  if (!raw || raw.length < width * height * channels) throw new Error('Vision frame is smaller than its declared dimensions');

  // Pass 63 puts coral team markers in the large left minimap and red
  // counters along the top. V1 deliberately sacrifices peripheral vision to
  // avoid confidently aiming at HUD pixels.
  const minimumY = Math.max(0, Math.floor(height * (options.minimumYRatio ?? 0.18)));
  const maximumY = Math.min(height - 1, Math.ceil(height * (options.maximumYRatio ?? 0.72)));
  const minimumX = Math.max(0, Math.floor(width * (options.minimumXRatio ?? 0.40)));
  const maximumX = Math.min(width - 1, Math.ceil(width * (options.maximumXRatio ?? 0.97)));
  const minimumPixels = Math.max(2, Math.floor(options.minimumPixels ?? 6));
  const maximumPixels = Math.max(minimumPixels, Math.floor(options.maximumPixels ?? width * height * 0.035));
  const excludedRegions = options.excludedRegions ?? DEFAULT_EXCLUDED_REGIONS;
  const mask = new Uint8Array(width * height);

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const excluded = excludedRegions.some((region) => x / width >= region.minimumXRatio
        && x / width <= region.maximumXRatio
        && y / height >= region.minimumYRatio
        && y / height <= region.maximumYRatio);
      if (excluded) continue;
      const pixel = (y * width + x) * channels;
      if (isCoralPixel(raw[pixel], raw[pixel + 1], raw[pixel + 2], options.mask ?? DEFAULT_CORAL_MASK)) {
        mask[y * width + x] = 1;
      }
    }
  }

  const candidates = [];
  const stack = [];
  const centreX = width / 2;
  const centreY = height / 2;
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0) continue;
    mask[start] = 0;
    stack.push(start);
    let pixels = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (stack.length > 0) {
      const index = stack.pop();
      const x = index % width;
      const y = Math.floor(index / width);
      pixels += 1;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      const neighbours = [index - 1, index + 1, index - width, index + width];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || neighbour >= mask.length || mask[neighbour] === 0) continue;
        const neighbourX = neighbour % width;
        if (Math.abs(neighbourX - x) > 1) continue;
        mask[neighbour] = 0;
        stack.push(neighbour);
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const aspect = boxWidth / Math.max(1, boxHeight);
    const density = pixels / Math.max(1, boxWidth * boxHeight);
    if (pixels < minimumPixels || pixels > maximumPixels) continue;
    if (boxWidth > width * 0.24 || boxHeight > height * 0.48) continue;
    if (boxHeight < 3 || aspect < 0.1 || aspect > 2.2 || density < 0.055) continue;

    const x = sumX / pixels;
    const y = sumY / pixels;
    const centreDistance = Math.hypot((x - centreX) / width, (y - centreY) / height);
    const sizeReward = Math.min(0.24, Math.log2(pixels + 1) * 0.035);
    const shapePenalty = aspect > 1.65 ? (aspect - 1.65) * 0.08 : 0;
    candidates.push({
      x,
      y,
      pixels,
      bounds: { minX, minY, maxX, maxY, width: boxWidth, height: boxHeight },
      density,
      centreDistance,
      score: centreDistance + shapePenalty - sizeReward,
    });
  }

  return candidates.sort((left, right) => left.score - right.score || right.pixels - left.pixels);
}

export function createTemporalTargetTracker(options = {}) {
  const confirmationFrames = Math.max(2, Math.floor(options.confirmationFrames ?? 3));
  const maximumTrackDistanceRatio = Number(options.maximumTrackDistanceRatio ?? 0.12);
  const screenLockDistanceRatio = Number(options.screenLockDistanceRatio ?? 0.006);
  let previous = null;
  let age = 0;
  let screenLockedFrames = 0;
  let observedWorldMotionFrames = 0;

  const reset = () => {
    previous = null;
    age = 0;
    screenLockedFrames = 0;
    observedWorldMotionFrames = 0;
  };

  return {
    reset,
    update(candidates, { width, height, active, cameraMoved = false } = {}) {
      if (!active || !Array.isArray(candidates) || candidates.length === 0) {
        reset();
        return { rawTarget: candidates?.[0] ?? null, confirmedTarget: null, reason: active ? 'no-candidate' : 'inactive-match', age: 0, screenLockedFrames: 0 };
      }
      const frameDiagonal = Math.hypot(width, height);
      let candidate = candidates[0];
      if (previous) {
        candidate = [...candidates].sort((left, right) => {
          const leftDistance = Math.hypot(left.x - previous.x, left.y - previous.y) / frameDiagonal;
          const rightDistance = Math.hypot(right.x - previous.x, right.y - previous.y) / frameDiagonal;
          return leftDistance - rightDistance || left.score - right.score;
        })[0];
        const distanceRatio = Math.hypot(candidate.x - previous.x, candidate.y - previous.y) / frameDiagonal;
        const sizeRatio = candidate.pixels / Math.max(1, previous.pixels);
        if (distanceRatio > maximumTrackDistanceRatio || sizeRatio < 0.28 || sizeRatio > 3.6) {
          reset();
        } else {
          age += 1;
          if (cameraMoved && distanceRatio <= screenLockDistanceRatio) screenLockedFrames += 1;
          if (distanceRatio > screenLockDistanceRatio) observedWorldMotionFrames += 1;
        }
      }
      if (!previous) age = 1;
      previous = candidate;
      const screenLocked = cameraMoved && age >= confirmationFrames && screenLockedFrames >= confirmationFrames - 1;
      const confirmed = age >= confirmationFrames && observedWorldMotionFrames >= 1 && !screenLocked;
      return {
        rawTarget: candidate,
        confirmedTarget: confirmed ? candidate : null,
        reason: screenLocked ? 'screen-locked-overlay' : confirmed ? 'temporally-confirmed' : 'warming-track',
        age,
        screenLockedFrames,
        observedWorldMotionFrames,
      };
    },
    snapshot: () => ({ age, screenLockedFrames, observedWorldMotionFrames, previous }),
  };
}

export function frameSignature(raw, width, height, channels = 3, options = {}) {
  const columns = Math.max(4, Math.floor(options.columns ?? 16));
  const rows = Math.max(3, Math.floor(options.rows ?? 9));
  const minimumX = Math.floor(width * (options.minimumXRatio ?? 0.08));
  const maximumX = Math.ceil(width * (options.maximumXRatio ?? 0.94));
  const minimumY = Math.floor(height * (options.minimumYRatio ?? 0.20));
  const maximumY = Math.ceil(height * (options.maximumYRatio ?? 0.68));
  const signature = [];
  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(height - 1, Math.round(minimumY + (maximumY - minimumY) * (row + 0.5) / rows));
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(width - 1, Math.round(minimumX + (maximumX - minimumX) * (column + 0.5) / columns));
      const offset = (y * width + x) * channels;
      signature.push(Math.round(raw[offset] * 0.299 + raw[offset + 1] * 0.587 + raw[offset + 2] * 0.114));
    }
  }
  return signature;
}

export function signatureDifference(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) return null;
  return left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length;
}
