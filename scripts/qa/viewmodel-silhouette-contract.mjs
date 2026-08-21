const VIEWMODEL_ROI = Object.freeze({
  leftFraction: 0.42,
  rightFraction: 0.78,
});
const ONE_HAND_ACTION_ROI = Object.freeze({
  leftFraction: 0.64,
  rightFraction: 0.995,
});
const SILHOUETTE_PROFILES = new Set(['dual-arm', 'dual-arm-overlap', 'heavy-overlap', 'one-hand-action']);

export function viewmodelSilhouetteRoi(profile = 'dual-arm') {
  if (!SILHOUETTE_PROFILES.has(profile)) throw new TypeError(`unknown viewmodel silhouette profile: ${profile}`);
  return profile === 'one-hand-action' ? ONE_HAND_ACTION_ROI : VIEWMODEL_ROI;
}

function columnRuns(mask, width, height, startY, endY, startX, endX) {
  const runs = [];
  let runStart = -1;
  const bandHeight = Math.max(1, endY - startY);
  for (let x = startX; x < endX; x += 1) {
    let occupied = 0;
    for (let y = startY; y < endY; y += 1) occupied += mask[y * width + x] ? 1 : 0;
    const active = occupied >= Math.max(1, Math.ceil(bandHeight * 0.28));
    if (active && runStart < 0) runStart = x;
    if (!active && runStart >= 0) {
      runs.push([runStart, x]);
      runStart = -1;
    }
  }
  if (runStart >= 0) runs.push([runStart, endX]);
  return runs;
}

function bandMetrics(mask, width, height, startFraction, endFraction, roi) {
  const startY = Math.max(0, Math.min(height - 1, Math.floor(height * startFraction)));
  const endY = Math.max(startY + 1, Math.min(height, Math.ceil(height * endFraction)));
  const startX = Math.max(0, Math.min(width - 1, Math.floor(width * roi.leftFraction)));
  const endX = Math.max(startX + 1, Math.min(width, Math.ceil(width * roi.rightFraction)));
  const runs = columnRuns(mask, width, height, startY, endY, startX, endX);
  const widths = runs.map(([start, end]) => end - start).sort((a, b) => b - a);
  let foreground = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) foreground += mask[y * width + x] ? 1 : 0;
  }
  return Object.freeze({
    startX,
    endX,
    startY,
    endY,
    runs: Object.freeze(runs.map((run) => Object.freeze(run))),
    maximumRunRatio: Number(((widths[0] ?? 0) / width).toFixed(6)),
    secondRunRatio: Number(((widths[1] ?? 0) / width).toFixed(6)),
    foregroundRatio: Number((foreground / ((endY - startY) * width)).toFixed(6)),
    roiForegroundRatio: Number((foreground / ((endY - startY) * (endX - startX))).toFixed(6)),
  });
}

/**
 * Proves that rendered viewmodel mass, rather than a projected bone or isolated
 * off-screen vertex, crosses the lower crop. The three broad bands reject a
 * detached cap and a one-pixel/tendril continuation while allowing the two
 * weapon-gripping arms to overlap into one substantial silhouette.
 */
export function analyzeViewmodelSilhouetteMask(mask, width, height, options = {}) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height || width < 64 || height < 64) {
    throw new TypeError('viewmodel silhouette requires one byte per pixel and a render-sized image');
  }
  const profile = options.profile ?? 'dual-arm';
  // The ammo/status HUD lives at the lower-right edge and the vitals HUD at
  // the lower-left. Restrict every crop measurement to the authored M4/arms
  // presentation corridor so changing HUD digits or FPS text cannot satisfy a
  // rendered-sleeve requirement.
  const roi = viewmodelSilhouetteRoi(profile);
  const lowerEdge = bandMetrics(mask, width, height, 0.985, 1, roi);
  const lowerCrop = bandMetrics(mask, width, height, 0.94, 0.975, roi);
  const lowerBody = bandMetrics(mask, width, height, 0.86, 0.91, roi);
  const violations = [];
  const separatedCropEntries = lowerEdge.maximumRunRatio >= 0.05
    && lowerEdge.secondRunRatio >= 0.04
    && lowerEdge.foregroundRatio >= 0.035;
  // High-ready can overlap the two connected sleeves and receiver at the
  // physical edge. Accept that rendered union only when it remains broad and
  // dense through the lower-crop band *and* resolves into two substantial arm
  // masses higher in the frame. A lone cap, pixel tendril, or one-arm proxy
  // cannot satisfy that topology.
  const mergedCropEntry = lowerEdge.maximumRunRatio >= 0.065
    && lowerEdge.foregroundRatio >= 0.055
    && lowerCrop.maximumRunRatio >= 0.065
    && lowerCrop.foregroundRatio >= 0.05
    && lowerBody.secondRunRatio >= 0.04;
  // Heavy support weapons can occlude both independently validated authored
  // chains into one silhouette. This is not a relaxed generic merge: it must
  // retain at least 20% of the whole viewport as one dense continuous mass in
  // every band, over three times the retained ordinary merge width.
  const ultraMergedCropEntry = profile === 'heavy-overlap'
    && lowerEdge.maximumRunRatio >= 0.2
    && lowerEdge.foregroundRatio >= 0.18
    && lowerCrop.maximumRunRatio >= 0.2
    && lowerCrop.foregroundRatio >= 0.18
    && lowerBody.maximumRunRatio >= 0.2
    && lowerBody.foregroundRatio >= 0.18;
  // Short landscape viewports make two telemetry-proven chains overlap more
  // often. Admit that union only when it remains at least 8% wide and 7.5%
  // dense in every band—strictly stronger than the ordinary 6.5%/5.5% merge.
  const dualArmOverlapEntry = profile === 'dual-arm-overlap'
    && lowerEdge.maximumRunRatio >= 0.08
    && lowerEdge.foregroundRatio >= 0.075
    && lowerCrop.maximumRunRatio >= 0.08
    && lowerCrop.foregroundRatio >= 0.075
    && lowerBody.maximumRunRatio >= 0.08
    && lowerBody.foregroundRatio >= 0.075;
  // A melee strike intentionally stows one intact full-scale chain. Its live
  // knife arm occupies the right action corridor and must remain at least as
  // broad and dense as the retained substantial-mass floor in every band all
  // the way off-screen. This profile changes topology, never the thresholds.
  const oneHandActionEntry = profile === 'one-hand-action'
    && lowerEdge.maximumRunRatio >= 0.065
    && lowerEdge.foregroundRatio >= 0.055
    && lowerCrop.maximumRunRatio >= 0.065
    && lowerCrop.foregroundRatio >= 0.055
    && lowerBody.maximumRunRatio >= 0.065
    && lowerBody.foregroundRatio >= 0.055;
  if (!separatedCropEntries && !mergedCropEntry && !ultraMergedCropEntry
    && !dualArmOverlapEntry && !oneHandActionEntry) {
    violations.push('rendered arm/viewmodel mass does not continue through the lower screen crop');
  }
  const lowerCropThin = lowerCrop.maximumRunRatio < 0.06 || lowerCrop.foregroundRatio < 0.045;
  if (lowerCropThin) {
    violations.push('lower-crop silhouette is too thin or disconnected');
  }
  const lowerBodyThin = lowerBody.maximumRunRatio < 0.065 || lowerBody.foregroundRatio < 0.045;
  if (lowerBodyThin) {
    violations.push('visible lower-arm silhouette lacks substantial authored mass');
  }
  return Object.freeze({
    contract: 'rendered-lower-crop-substantial-silhouette-v2',
    profile,
    width,
    height,
    roi,
    lowerEdge,
    lowerCrop,
    lowerBody,
    cropEntryMode: separatedCropEntries
      ? 'separated'
      : mergedCropEntry
        ? 'merged'
        : ultraMergedCropEntry
          ? 'ultra-merged'
          : dualArmOverlapEntry
            ? 'dual-arm-overlap'
            : oneHandActionEntry ? 'one-hand-action' : 'invalid',
    violations: Object.freeze(violations),
    passed: violations.length === 0,
  });
}

const ARM_ID_MINIMUM_RUN_RATIO = 0.04;
const ARM_ID_MINIMUM_FOREGROUND_RATIO = 0.012;
const ARM_ID_MINIMUM_COMPONENT_AREA_RATIO = 0.004;

function componentBandMetrics(columnCounts, width, bandHeight) {
  const active = new Uint8Array(width);
  const occupiedFloor = Math.max(1, Math.ceil(bandHeight * 0.28));
  let foreground = 0;
  for (let x = 0; x < width; x += 1) {
    foreground += columnCounts[x];
    if (columnCounts[x] >= occupiedFloor) active[x] = 1;
  }
  let maximumRun = 0;
  let run = 0;
  for (let x = 0; x < width; x += 1) {
    if (active[x]) {
      run += 1;
      maximumRun = Math.max(maximumRun, run);
    } else {
      run = 0;
    }
  }
  return Object.freeze({
    maximumRunRatio: Number((maximumRun / width).toFixed(6)),
    foregroundRatio: Number((foreground / (bandHeight * width)).toFixed(6)),
    foregroundPixels: foreground,
  });
}

/**
 * Proves one actual arm independently of the weapon and opposite arm. The
 * caller supplies a binary material/object-ID mask rendered from the shipped
 * skinned geometry. A single 8-connected component must reach from visible
 * hand/cuff mass through three substantial lower-frame bands and the physical
 * bottom edge. This rejects a floating hand, capped sleeve, or pixel tendril.
 */
export function analyzeArmIdMask(mask, width, height, side) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height || width < 64 || height < 64) {
    throw new TypeError('arm ID silhouette requires one byte per pixel and a render-sized image');
  }
  if (side !== 'left' && side !== 'right') throw new TypeError(`unknown arm ID side: ${side}`);
  const bands = Object.freeze({
    lowerEdge: Object.freeze([Math.floor(height * 0.985), height]),
    lowerCrop: Object.freeze([Math.floor(height * 0.94), Math.ceil(height * 0.975)]),
    lowerBody: Object.freeze([Math.floor(height * 0.86), Math.ceil(height * 0.91)]),
  });
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || visited[seed]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    visited[seed] = 1;
    let area = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    const counts = {
      lowerEdge: new Uint16Array(width),
      lowerCrop: new Uint16Array(width),
      lowerBody: new Uint16Array(width),
    };
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      area += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const [name, [startY, endY]] of Object.entries(bands)) {
        if (y >= startY && y < endY) counts[name][x] += 1;
      }
      for (let dy = -1; dy <= 1; dy += 1) {
        const nextY = y + dy;
        if (nextY < 0 || nextY >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          if (nextX < 0 || nextX >= width) continue;
          const next = nextY * width + nextX;
          if (mask[next] && !visited[next]) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }
    if (area < 8) continue;
    const metrics = Object.freeze({
      lowerEdge: componentBandMetrics(counts.lowerEdge, width, bands.lowerEdge[1] - bands.lowerEdge[0]),
      lowerCrop: componentBandMetrics(counts.lowerCrop, width, bands.lowerCrop[1] - bands.lowerCrop[0]),
      lowerBody: componentBandMetrics(counts.lowerBody, width, bands.lowerBody[1] - bands.lowerBody[0]),
    });
    components.push(Object.freeze({
      area,
      areaRatio: Number((area / (width * height)).toFixed(6)),
      bounds: Object.freeze({ minX, minY, maxX, maxY }),
      metrics,
    }));
  }
  components.sort((a, b) => b.area - a.area);
  const principal = components[0] ?? null;
  const violations = [];
  if (!principal) {
    violations.push(`${side} arm material-ID mask is empty`);
  } else {
    if (principal.areaRatio < ARM_ID_MINIMUM_COMPONENT_AREA_RATIO) {
      violations.push(`${side} arm connected component lacks substantial authored area`);
    }
    if (principal.bounds.maxY !== height - 1) {
      violations.push(`${side} sleeve is capped before the bottom screen edge`);
    }
    for (const [name, metrics] of Object.entries(principal.metrics)) {
      if (metrics.maximumRunRatio < ARM_ID_MINIMUM_RUN_RATIO
        || metrics.foregroundRatio < ARM_ID_MINIMUM_FOREGROUND_RATIO) {
        violations.push(`${side} arm ${name} continuation is thinner than the retained substantial-mass floor`);
      }
    }
  }
  return Object.freeze({
    contract: 'per-arm-skinned-material-id-bottom-connectivity-v1',
    side,
    width,
    height,
    thresholds: Object.freeze({
      minimumRunRatio: ARM_ID_MINIMUM_RUN_RATIO,
      minimumForegroundRatio: ARM_ID_MINIMUM_FOREGROUND_RATIO,
      minimumComponentAreaRatio: ARM_ID_MINIMUM_COMPONENT_AREA_RATIO,
      connectivity: 8,
    }),
    principalComponent: principal,
    componentCount: components.length,
    violations: Object.freeze(violations),
    passed: violations.length === 0,
  });
}

/** Negative-control mutation: cap a real arm mask while leaving every non-arm
 * source pixel (including the weapon) unchanged in the paired source frame. */
export function capArmIdMask(mask, width, height, capStartFraction = 0.94) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) {
    throw new TypeError('arm ID cap mutation requires one byte per pixel');
  }
  const result = mask.slice();
  const startY = Math.floor(height * capStartFraction);
  result.fill(0, startY * width);
  return result;
}
