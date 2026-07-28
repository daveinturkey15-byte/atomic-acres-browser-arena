export function findCyanRangeTargets(data, width, height, channels = 3) {
  const x0 = Math.floor(width * 0.29);
  const x1 = Math.ceil(width * 0.76);
  const y0 = Math.floor(height * 0.28);
  const y1 = Math.ceil(height * 0.70);
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * width + x) * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (r <= 90 && g >= 120 && b >= 125 && Math.abs(g - b) <= 95 && b - r >= 55) mask[y * width + x] = 1;
    }
  }
  const visited = new Uint8Array(width * height);
  const components = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const seed = y * width + x;
      if (!mask[seed] || visited[seed]) continue;
      const stack = [seed];
      visited[seed] = 1;
      let pixels = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (stack.length > 0) {
        const index = stack.pop();
        const cx = index % width;
        const cy = Math.floor(index / width);
        pixels += 1;
        sumX += cx;
        sumY += cy;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
          const ni = ny * width + nx;
          if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack.push(ni); }
        }
      }
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const fill = pixels / (boxWidth * boxHeight);
      const aspect = boxWidth / boxHeight;
      if (pixels < 10 || pixels > 180 || boxWidth < 4 || boxHeight < 4 || boxWidth > 22 || boxHeight > 22) continue;
      if (aspect < 0.55 || aspect > 1.8 || fill < 0.24) continue;
      components.push({
        x: sumX / pixels,
        y: sumY / pixels,
        pixels,
        bounds: { minX, minY, maxX, maxY, width: boxWidth, height: boxHeight },
        fill,
      });
    }
  }
  return components.sort((a, b) => b.pixels - a.pixels);
}

export function associateRangeTarget(previous, candidates, maximumDistance = 10) {
  if (!previous) return null;
  let best = null;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - previous.x, candidate.y - previous.y);
    if (distance <= maximumDistance && (!best || distance < best.distance)) best = { target: candidate, distance };
  }
  return best;
}
