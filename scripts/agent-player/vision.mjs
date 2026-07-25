export const DEFAULT_CORAL_MASK = Object.freeze({
  redMinimum: 150,
  greenMinimum: 42,
  greenMaximum: 195,
  blueMaximum: 175,
  redGreenLead: 28,
  redBlueLead: 32,
});

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
  const minimumPixels = Math.max(2, Math.floor(options.minimumPixels ?? 4));
  const maximumPixels = Math.max(minimumPixels, Math.floor(options.maximumPixels ?? width * height * 0.035));
  const mask = new Uint8Array(width * height);

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
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
    if (boxHeight < 2 || aspect < 0.1 || aspect > 3.2 || density < 0.055) continue;

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
