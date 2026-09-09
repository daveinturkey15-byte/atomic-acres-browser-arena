import test from 'node:test';
import assert from 'node:assert/strict';
import { blueMaskStats, luma, rosterAggregate, structuralStats } from './measure-nuketown2-vehicle-paint.mjs';

function image(width, height, pixel) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = typeof pixel === 'function'
        ? pixel(x, y)
        : Array.isArray(pixel[0]) ? pixel[y * width + x] : pixel;
      const index = (y * width + x) * 3;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
    }
  }
  return { data, width, height, channels: 3 };
}

test('flat patch has no structural edge or vertical shading', () => {
  const result = structuralStats(image(32, 32, [64, 70, 76]), [0, 0, 1280, 720]);
  assert.equal(result.coarseEdgeDensity, 0);
  assert.equal(result.verticalShadingGradient, 0);
});

test('plus or minus 4 LSB dither remains structurally flat after blur', () => {
  const result = structuralStats(image(64, 64, (x, y) => {
    const noise = ((x * 17 + y * 31) % 9) - 4;
    return [128 + noise, 132 + noise, 136 + noise];
  }), [0, 0, 1280, 720]);
  assert.ok(result.coarseEdgeDensity < 0.01, `edge density=${result.coarseEdgeDensity}`);
  assert.ok(Math.abs(result.verticalShadingGradient) < 0.25, `gradient=${result.verticalShadingGradient}`);
});

test('smooth ramp keeps its sign and produces real coarse structure', () => {
  const result = structuralStats(image(64, 64, (_x, y) => {
    const value = Math.round((y / 63) * 220 + 16);
    return [value, value, value];
  }), [0, 0, 1280, 720]);
  assert.ok(result.verticalShadingGradient < -100, `gradient=${result.verticalShadingGradient}`);
  assert.ok(result.coarseEdgeDensity > 0.8, `edge density=${result.coarseEdgeDensity}`);
});

test('blue mask rejects grey and low-value pixels', () => {
  const blue = blueMaskStats(image(4, 1, [[0, 0, 255], [0, 30, 255], [128, 128, 128], [35, 35, 35]]));
  assert.equal(blue.pixelCount, 2);
  assert.equal(blue.meanGreenOverRed, null);
});

test('green-over-red uses exact means rather than a pooled approximation', () => {
  const result = blueMaskStats(image(2, 1, [[10, 20, 40], [10, 40, 80]]));
  assert.equal(result.meanGreenOverRed, 3);
});

test('roster aggregate is an unweighted mean of station metrics', () => {
  const result = rosterAggregate([
    { pixelPercent: 1, meanSaturation: 0.8, hueP25: 210, hueP50: 220, hueP75: 230, hueWidth: 20, saturationP50: 0.7, saturationP90: 0.9, meanGreenOverRed: 1 },
    { pixelPercent: 9, meanSaturation: 0.6, hueP25: 212, hueP50: 222, hueP75: 232, hueWidth: 20, saturationP50: 0.5, saturationP90: 0.8, meanGreenOverRed: 3 },
  ]);
  assert.equal(result.pixelPercent, 5);
  assert.equal(result.meanGreenOverRed, 2);
  assert.equal(result.meanSaturation, 0.7);
  assert.equal(luma(10, 20, 30), 18.596);
});
