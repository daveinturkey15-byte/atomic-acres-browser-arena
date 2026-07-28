export const DEFAULT_CORAL_MASK = Object.freeze({
  redMinimum: 150,
  greenMinimum: 42,
  greenMaximum: 195,
  blueMaximum: 175,
  redGreenLead: 28,
  redBlueLead: 32,
});

// Pass 63 Performance operators use a deliberately dark Coral tactical palette
// (the main swatch is #b34d3f). The bright-coral proposal mask misses that
// material in shade while orange props dominate the brighter mask. Keep this
// second mask narrow and require humanoid geometry plus temporal motion before
// it can authorise fire.
export const DEFAULT_OPERATOR_MASK = Object.freeze({
  redMinimum: 85,
  greenMaximum: 105,
  blueMaximum: 105,
  redGreenLead: 35,
  redBlueLead: 30,
});

export const DEFAULT_EXCLUDED_REGIONS = Object.freeze([
  // The visible minimap may contain Coral markers; exclude its rectangle rather than the whole left field.
  Object.freeze({ minimumXRatio: 0, maximumXRatio: 0.39, minimumYRatio: 0, maximumYRatio: 0.52 }),
  // Pass 63's persistent hostile-operator notification uses the same Coral palette as operators.
  Object.freeze({ minimumXRatio: 0.67, maximumXRatio: 1, minimumYRatio: 0.05, maximumYRatio: 0.31 }),
  // Stacked DAMAGE TAKEN notifications move as new rows appear, defeating simple screen-lock tracking.
  Object.freeze({ minimumXRatio: 0.78, maximumXRatio: 1, minimumYRatio: 0.28, maximumYRatio: 0.72 }),
]);

export function isCoralPixel(red, green, blue, config = DEFAULT_CORAL_MASK) {
  return red >= config.redMinimum
    && green >= config.greenMinimum
    && green <= config.greenMaximum
    && blue <= config.blueMaximum
    && red - green >= config.redGreenLead
    && red - blue >= config.redBlueLead;
}

export function isOperatorPalettePixel(red, green, blue, config = DEFAULT_OPERATOR_MASK) {
  return red >= config.redMinimum
    && green <= config.greenMaximum
    && blue <= config.blueMaximum
    && red - green >= config.redGreenLead
    && red - blue >= config.redBlueLead;
}

export function findMinimapThreats(raw, width, height, channels = 3, options = {}) {
  if (!raw || raw.length < width * height * channels) throw new Error('Vision frame is smaller than its declared dimensions');
  const minimumX = Math.floor(width * (options.minimumXRatio ?? 0.10));
  const maximumX = Math.ceil(width * (options.maximumXRatio ?? 0.28));
  const minimumY = Math.floor(height * (options.minimumYRatio ?? 0.24));
  const maximumY = Math.ceil(height * (options.maximumYRatio ?? 0.61));
  const mask = new Uint8Array(width * height);
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const pixel = (y * width + x) * channels;
      const red = raw[pixel];
      const green = raw[pixel + 1];
      const blue = raw[pixel + 2];
      if (red >= 120 && green <= 125 && blue <= 150 && red - green >= 30 && red >= blue) mask[y * width + x] = 1;
    }
  }

  const components = [];
  const stack = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0) continue;
    mask[start] = 0;
    stack.push(start);
    const points = [];
    while (stack.length > 0) {
      const index = stack.pop();
      const x = index % width;
      const y = Math.floor(index / width);
      points.push({ x, y });
      for (const deltaY of [-1, 0, 1]) {
        for (const deltaX of [-1, 0, 1]) {
          if (deltaX === 0 && deltaY === 0) continue;
          const neighbourX = x + deltaX;
          const neighbourY = y + deltaY;
          if (neighbourX < 0 || neighbourX >= width || neighbourY < 0 || neighbourY >= height) continue;
          const neighbour = neighbourY * width + neighbourX;
          if (mask[neighbour] === 0) continue;
          mask[neighbour] = 0;
          stack.push(neighbour);
        }
      }
    }
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const boxWidth = Math.max(...xs) - Math.min(...xs) + 1;
    const boxHeight = Math.max(...ys) - Math.min(...ys) + 1;
    if (points.length < 2 || points.length > 12 || boxWidth > 4 || boxHeight > 4) continue;
    components.push({
      x: xs.reduce((sum, value) => sum + value, 0) / points.length,
      y: ys.reduce((sum, value) => sum + value, 0) / points.length,
      pixels: points.length,
      bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys), width: boxWidth, height: boxHeight },
    });
  }

  // JPEG antialiasing can split one tiny marker into adjacent islands. Merge
  // islands that a human would see as one dot before deriving player-up bearing.
  const merged = [];
  for (const component of components) {
    const neighbour = merged.find((candidate) => Math.hypot(candidate.x - component.x, candidate.y - component.y) <= 4);
    if (!neighbour) {
      merged.push({ ...component });
      continue;
    }
    const totalPixels = neighbour.pixels + component.pixels;
    neighbour.x = (neighbour.x * neighbour.pixels + component.x * component.pixels) / totalPixels;
    neighbour.y = (neighbour.y * neighbour.pixels + component.y * component.pixels) / totalPixels;
    neighbour.pixels = totalPixels;
  }

  const playerAnchorX = width * (options.playerAnchorXRatio ?? 0.155);
  const playerAnchorY = height * (options.playerAnchorYRatio ?? 0.54);
  return merged.map((component) => {
    const deltaX = component.x - playerAnchorX;
    const deltaY = component.y - playerAnchorY;
    return {
      ...component,
      deltaX,
      deltaY,
      distance: Math.hypot(deltaX, deltaY),
      bearingRadians: Math.atan2(deltaX, -deltaY),
      detector: 'visible-player-up-minimap-v1',
    };
  }).sort((left, right) => left.distance - right.distance);
}

export function findPurpleOperatorCandidates(raw, width, height, channels = 3, options = {}) {
  if (!raw || raw.length < width * height * channels) throw new Error('Vision frame is smaller than its declared dimensions');
  const globalRedFlashMaximum = Number(options.globalRedFlashMaximum ?? 0.08);
  let redTintPixels = 0;
  for (let index = 0; index < width * height; index += 1) {
    const pixel = index * channels;
    if (isOperatorPalettePixel(raw[pixel], raw[pixel + 1], raw[pixel + 2])) redTintPixels += 1;
  }
  const redTintRatio = redTintPixels / (width * height);
  if (redTintRatio > globalRedFlashMaximum) {
    const empty = [];
    Object.defineProperties(empty, {
      rejectedReason: { value: 'global-red-flash', enumerable: true },
      paletteRatio: { value: 0, enumerable: true },
      redTintRatio: { value: redTintRatio, enumerable: true },
    });
    return empty;
  }

  const minimumX = Math.floor(width * (options.minimumXRatio ?? 0.12));
  const maximumX = Math.ceil(width * (options.maximumXRatio ?? 0.82));
  const minimumY = Math.floor(height * (options.minimumYRatio ?? 0.25));
  const maximumY = Math.ceil(height * (options.maximumYRatio ?? 0.75));
  const exclusions = options.exclusions ?? DEFAULT_EXCLUDED_REGIONS;
  const minimumPixels = Math.max(3, Math.floor(options.minimumPixels ?? 12));
  const mask = new Uint8Array(width * height);
  let palettePixels = 0;
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const excluded = exclusions.some((region) => x / width >= region.minimumXRatio
        && x / width <= region.maximumXRatio
        && y / height >= region.minimumYRatio
        && y / height <= region.maximumYRatio);
      if (excluded) continue;
      const pixel = (y * width + x) * channels;
      const red = raw[pixel];
      const green = raw[pixel + 1];
      const blue = raw[pixel + 2];
      // Pass 63 draws hostile bot bodies/outlines in a visible lavender-purple:
      // both red and blue lead green. Aqua scenery has green/blue dominance,
      // while the map's red posts lack the blue lead.
      if (red >= 55 && blue >= 55 && red - green >= 12 && blue - green >= 12) {
        mask[y * width + x] = 1;
        palettePixels += 1;
      }
    }
  }

  const candidates = [];
  const stack = [];
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
      for (const neighbour of [index - 1, index + 1, index - width, index + width]) {
        if (neighbour < 0 || neighbour >= mask.length || mask[neighbour] === 0) continue;
        const neighbourX = neighbour % width;
        if (Math.abs(neighbourX - x) > 1) continue;
        mask[neighbour] = 0;
        stack.push(neighbour);
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const aspect = boxWidth / boxHeight;
    const density = pixels / (boxWidth * boxHeight);
    if (pixels < minimumPixels || pixels > 500) continue;
    if (boxWidth < 2 || boxWidth > 50 || boxHeight < 3 || boxHeight > 70) continue;
    if (aspect < 0.15 || aspect > 1.5) continue;
    const x = sumX / pixels;
    const y = sumY / pixels;
    const centreDistance = Math.hypot((x - width / 2) / width, (y - height / 2) / height);
    candidates.push({
      x,
      y,
      pixels,
      density,
      aspect,
      score: centreDistance + Math.abs(aspect - 0.8) * 0.025 - Math.min(0.04, pixels / 5000),
      bounds: { minX, minY, maxX, maxY, width: boxWidth, height: boxHeight },
      detector: 'pass63-visible-purple-operator-v1',
    });
  }
  candidates.sort((left, right) => left.score - right.score);
  Object.defineProperties(candidates, {
    rejectedReason: { value: null, enumerable: true },
    paletteRatio: { value: palettePixels / (width * height), enumerable: true },
    redTintRatio: { value: redTintRatio, enumerable: true },
  });
  return candidates;
}

export function findOperatorCandidates(raw, width, height, channels = 3, options = {}) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('Vision frame dimensions must be positive integers');
  }
  if (!Number.isInteger(channels) || channels < 3) throw new Error('Vision frame must have at least three channels');
  if (!raw || raw.length < width * height * channels) throw new Error('Vision frame is smaller than its declared dimensions');

  const minimumY = Math.max(0, Math.floor(height * (options.minimumYRatio ?? 0.18)));
  const maximumY = Math.min(height - 1, Math.ceil(height * (options.maximumYRatio ?? 0.72)));
  const minimumX = Math.max(0, Math.floor(width * (options.minimumXRatio ?? 0.10)));
  const maximumX = Math.min(width - 1, Math.ceil(width * (options.maximumXRatio ?? 0.95)));
  const excludedRegions = options.excludedRegions ?? DEFAULT_EXCLUDED_REGIONS;
  const mask = new Uint8Array(width * height);
  let palettePixels = 0;

  // A damage flash tints most of the frame red and can make unrelated props
  // satisfy any colour-only rule. Abstain while that transient overlay exists.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = (y * width + x) * channels;
      if (isOperatorPalettePixel(raw[pixel], raw[pixel + 1], raw[pixel + 2], options.mask ?? DEFAULT_OPERATOR_MASK)) {
        palettePixels += 1;
      }
    }
  }
  const paletteRatio = palettePixels / Math.max(1, width * height);
  const maximumPaletteRatio = Number(options.maximumPaletteRatio ?? 0.08);
  if (paletteRatio > maximumPaletteRatio) {
    return Object.assign([], { paletteRatio, rejectedReason: 'global-red-flash' });
  }

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const excluded = excludedRegions.some((region) => x / width >= region.minimumXRatio
        && x / width <= region.maximumXRatio
        && y / height >= region.minimumYRatio
        && y / height <= region.maximumYRatio);
      if (excluded) continue;
      const pixel = (y * width + x) * channels;
      if (isOperatorPalettePixel(raw[pixel], raw[pixel + 1], raw[pixel + 2], options.mask ?? DEFAULT_OPERATOR_MASK)) {
        mask[y * width + x] = 1;
      }
    }
  }

  const minimumPixels = Math.max(2, Math.floor(options.minimumPixels ?? 8));
  const maximumPixels = Math.max(minimumPixels, Math.floor(options.maximumPixels ?? 120));
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
      for (const neighbour of [index - 1, index + 1, index - width, index + width]) {
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
    if (boxWidth < 2 || boxWidth > (options.maximumWidth ?? 12)) continue;
    if (boxHeight < 5 || boxHeight > (options.maximumHeight ?? 30)) continue;
    if (aspect < (options.minimumAspect ?? 0.18) || aspect > (options.maximumAspect ?? 1.05)) continue;
    if (density < (options.minimumDensity ?? 0.18) || density > (options.maximumDensity ?? 0.95)) continue;

    const x = sumX / pixels;
    const y = sumY / pixels;
    const centreDistance = Math.hypot((x - centreX) / width, (y - centreY) / height);
    const shapePenalty = Math.abs(aspect - 0.45) * 0.12;
    const narrowPenalty = boxWidth === 2 ? 0.12 : 0;
    const sizePenalty = Math.abs(Math.log(pixels / 18)) * 0.02;
    candidates.push({
      x,
      y,
      pixels,
      bounds: { minX, minY, maxX, maxY, width: boxWidth, height: boxHeight },
      density,
      aspect,
      paletteRatio,
      centreDistance,
      score: centreDistance + shapePenalty + narrowPenalty + sizePenalty,
      detector: 'operator-palette-geometry-v1',
    });
  }

  const sorted = candidates.sort((left, right) => left.score - right.score || right.pixels - left.pixels);
  return Object.assign(sorted, { paletteRatio, rejectedReason: null });
}

export function findCoralTargets(raw, width, height, channels = 3, options = {}) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('Vision frame dimensions must be positive integers');
  }
  if (!Number.isInteger(channels) || channels < 3) throw new Error('Vision frame must have at least three channels');
  if (!raw || raw.length < width * height * channels) throw new Error('Vision frame is smaller than its declared dimensions');

  // Pass 63 puts team markers in the minimap and counters along the top.
  // Exclude the actual HUD rectangles while preserving world pixels below the minimap.
  const minimumY = Math.max(0, Math.floor(height * (options.minimumYRatio ?? 0.18)));
  const maximumY = Math.min(height - 1, Math.ceil(height * (options.maximumYRatio ?? 0.72)));
  const minimumX = Math.max(0, Math.floor(width * (options.minimumXRatio ?? 0.04)));
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

export function createPurpleTargetTracker(options = {}) {
  const confirmationFrames = Math.max(2, Math.floor(options.confirmationFrames ?? 2));
  const maximumTrackDistanceRatio = Number(options.maximumTrackDistanceRatio ?? 0.12);
  const maximumSizeRatio = Math.max(1.5, Number(options.maxSizeRatio ?? 8));
  let previous = null;
  let age = 0;

  const reset = () => {
    previous = null;
    age = 0;
  };

  return {
    reset,
    update(candidates, { width, height, active } = {}) {
      if (!active || !Array.isArray(candidates) || candidates.length === 0) {
        reset();
        return {
          rawTarget: candidates?.[0] ?? null,
          confirmedTarget: null,
          reason: active ? 'no-purple-operator' : 'inactive-match',
          age: 0,
          stableFrames: 0,
          evidenceFrames: 0,
          fireAuthorized: false,
        };
      }
      const diagonal = Math.hypot(width, height);
      let candidate = candidates[0];
      if (previous) {
        candidate = [...candidates].sort((left, right) => {
          const leftDistance = Math.hypot(left.x - previous.x, left.y - previous.y) / diagonal;
          const rightDistance = Math.hypot(right.x - previous.x, right.y - previous.y) / diagonal;
          return leftDistance - rightDistance || left.score - right.score;
        })[0];
        const distanceRatio = Math.hypot(candidate.x - previous.x, candidate.y - previous.y) / diagonal;
        const sizeRatio = candidate.pixels / Math.max(1, previous.pixels);
        if (distanceRatio > maximumTrackDistanceRatio || sizeRatio < 1 / maximumSizeRatio || sizeRatio > maximumSizeRatio) reset();
      }
      age = previous ? age + 1 : 1;
      previous = candidate;
      const confirmed = age >= confirmationFrames;
      return {
        rawTarget: candidate,
        confirmedTarget: confirmed ? candidate : null,
        reason: confirmed ? 'purple-operator-confirmed' : 'observing-purple-operator',
        age,
        stableFrames: Math.max(0, age - 1),
        evidenceFrames: Math.max(0, age - 1),
        fireAuthorized: confirmed,
      };
    },
    snapshot: () => ({ previous, age }),
  };
}

export function createOperatorTargetTracker(options = {}) {
  const confirmationFrames = Math.max(3, Math.floor(options.confirmationFrames ?? 3));
  const minimumStableFrames = Math.max(2, Math.floor(options.minimumStableFrames ?? 2));
  const settlingFrames = Math.max(2, Math.floor(options.settlingFrames ?? 4));
  const requiredEvidenceFrames = Math.max(1, Math.floor(options.requiredEvidenceFrames ?? 2));
  const maximumObservationFrames = Math.max(settlingFrames + requiredEvidenceFrames + 1, Math.floor(options.maximumObservationFrames ?? 10));
  const maximumTrackDistanceRatio = Number(options.maximumTrackDistanceRatio ?? 0.08);
  const maximumSizeRatio = Math.max(1.1, Number(options.maxSizeRatio ?? 3.6));
  const minimumMotionRatio = Number(options.minimumMotionRatio ?? 0.003);
  const minimumShapeChange = Number(options.minimumShapeChange ?? 0.14);
  let previous = null;
  let age = 0;
  let stableFrames = 0;
  let evidenceFrames = 0;
  let confirmed = false;
  let observationAnchor = null;

  const reset = () => {
    previous = null;
    age = 0;
    stableFrames = 0;
    evidenceFrames = 0;
    confirmed = false;
    observationAnchor = null;
  };

  return {
    reset,
    update(candidates, { width, height, active, cameraMoved = false, movementMoved = false } = {}) {
      if (!active || !Array.isArray(candidates) || candidates.length === 0) {
        reset();
        return {
          rawTarget: candidates?.[0] ?? null,
          confirmedTarget: null,
          reason: active ? 'no-operator-candidate' : 'inactive-match',
          age: 0,
          stableFrames: 0,
          evidenceFrames: 0,
          fireAuthorized: false,
        };
      }

      const frameDiagonal = Math.hypot(width, height);
      let candidate = candidates[0];
      let distanceRatio = null;
      let shapeChange = null;
      if (previous) {
        candidate = [...candidates].sort((left, right) => {
          const leftDistance = Math.hypot(left.x - previous.x, left.y - previous.y) / frameDiagonal;
          const rightDistance = Math.hypot(right.x - previous.x, right.y - previous.y) / frameDiagonal;
          return leftDistance - rightDistance || left.score - right.score;
        })[0];
        distanceRatio = Math.hypot(candidate.x - previous.x, candidate.y - previous.y) / frameDiagonal;
        const sizeRatio = candidate.pixels / Math.max(1, previous.pixels);
        shapeChange = Math.abs(Math.log(sizeRatio));
        if (distanceRatio > maximumTrackDistanceRatio || sizeRatio < 1 / maximumSizeRatio || sizeRatio > maximumSizeRatio) {
          reset();
        }
      }

      if (!previous) {
        age = 1;
      } else {
        age += 1;
        if (!cameraMoved && !movementMoved) {
          stableFrames += 1;
          if (stableFrames === settlingFrames) observationAnchor = { ...candidate };
          if (stableFrames > settlingFrames && observationAnchor) {
            const anchorDistance = Math.hypot(candidate.x - observationAnchor.x, candidate.y - observationAnchor.y) / frameDiagonal;
            const anchorShapeChange = Math.abs(Math.log(candidate.pixels / Math.max(1, observationAnchor.pixels)));
            if (anchorDistance >= minimumMotionRatio || anchorShapeChange >= minimumShapeChange) evidenceFrames += 1;
          }
        }
      }
      previous = candidate;

      if (!confirmed && age >= confirmationFrames && stableFrames >= Math.max(minimumStableFrames, settlingFrames + requiredEvidenceFrames)
        && evidenceFrames >= requiredEvidenceFrames) {
        confirmed = true;
      }
      if (!confirmed && stableFrames >= maximumObservationFrames) {
        const rejected = candidate;
        const rejectedAge = age;
        reset();
        return {
          rawTarget: rejected,
          confirmedTarget: null,
          reason: 'static-geometry-rejected',
          age: rejectedAge,
          stableFrames: maximumObservationFrames,
          evidenceFrames: 0,
          fireAuthorized: false,
        };
      }

      return {
        rawTarget: candidate,
        confirmedTarget: confirmed ? candidate : null,
        reason: confirmed ? 'operator-motion-confirmed' : 'observing-operator-candidate',
        age,
        stableFrames,
        evidenceFrames,
        distanceRatio,
        shapeChange,
        fireAuthorized: confirmed,
      };
    },
    snapshot: () => ({ previous, age, stableFrames, evidenceFrames, confirmed, observationAnchor }),
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
