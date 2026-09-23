import { describe, expect, it } from 'vitest';
import { minimapPlayerViewPoint, playerUpRotationRadians, playerUpScaleX } from './minimap';

/**
 * HF-399 guard. `minimapPlayerViewPoint` replaced a per-frame
 * `context.getTransform().transformPoint(new DOMPoint(x, y))` on Nuke Town's
 * minimap, so the only thing standing between a wrong landmark label position
 * and a shipped build is this algebra. The reference below is NOT the closed
 * form written a second way: it composes the canvas call sequence out of
 * generic 2x3 affine matrices and multiplies the point through it, the way
 * Canvas2D itself does. If the closed form ever drifts from the transform the
 * context is actually given, these cases fail.
 *
 * DOMMatrix is not available under the `node` vitest environment this repo
 * uses (verified: `typeof DOMMatrix === 'undefined'` on node v24), which is
 * why the reference is composed here rather than imported from the DOM.
 */
type Affine = readonly [number, number, number, number, number, number]; // a b c d e f

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

/** m1 then m2 applied to a point == multiply(m1, m2), matching Canvas2D's post-multiply order. */
function multiply(m1: Affine, m2: Affine): Affine {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

const translate = (m: Affine, x: number, y: number): Affine => multiply(m, [1, 0, 0, 1, x, y]);
const scale = (m: Affine, x: number, y: number): Affine => multiply(m, [x, 0, 0, y, 0, 0]);
const rotate = (m: Affine, radians: number): Affine =>
  multiply(m, [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0]);

function apply(m: Affine, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

/** The exact sequence src/legacy-main.ts issues on the minimap context before drawing landmarks. */
function canvasReferencePoint(
  anchorX: number,
  anchorY: number,
  view: { width: number; height: number; playerX: number; playerY: number; rotation: number; scaleX: number },
): [number, number] {
  let matrix = IDENTITY;
  matrix = translate(matrix, view.width / 2, view.height / 2);
  matrix = rotate(matrix, view.rotation);
  matrix = scale(matrix, view.scaleX, 1);
  matrix = translate(matrix, -view.playerX, -view.playerY);
  return apply(matrix, anchorX, anchorY);
}

const VIEW_SIZES = [
  { width: 220, height: 220 },
  { width: 256, height: 192 },
  { width: 331, height: 331 },
];
const YAWS = [0, 0.37, Math.PI / 2, 2.3757998210495495, Math.PI, -1.2, 5.9, Math.PI * 2 - 0.001];
const PLAYERS = [
  { playerX: 0, playerY: 0 },
  { playerX: 110, playerY: 110 },
  { playerX: 12.5, playerY: 203.75 },
  { playerX: -40, playerY: 260 },
];
const ANCHORS: Array<[number, number]> = [
  [0, 0],
  [110, 110],
  [37.5, 12],
  [201.25, 188.5],
  [-16, 340],
];

describe('minimapPlayerViewPoint', () => {
  it('matches a Canvas2D-composed affine chain for every yaw, view size, player and anchor', () => {
    let cases = 0;
    for (const size of VIEW_SIZES) {
      for (const yaw of YAWS) {
        for (const player of PLAYERS) {
          const view = {
            ...size,
            ...player,
            rotation: playerUpRotationRadians(yaw),
            scaleX: playerUpScaleX(),
          };
          for (const [anchorX, anchorY] of ANCHORS) {
            const [x, y] = minimapPlayerViewPoint(anchorX, anchorY, view);
            const [refX, refY] = canvasReferencePoint(anchorX, anchorY, view);
            expect(x).toBeCloseTo(refX, 10);
            expect(y).toBeCloseTo(refY, 10);
            cases += 1;
          }
        }
      }
    }
    expect(cases).toBe(VIEW_SIZES.length * YAWS.length * PLAYERS.length * ANCHORS.length);
  });

  it('maps the player position itself to the centre of the minimap', () => {
    const view = { width: 220, height: 220, playerX: 73.5, playerY: 19.25, rotation: playerUpRotationRadians(1.1), scaleX: playerUpScaleX() };
    const [x, y] = minimapPlayerViewPoint(view.playerX, view.playerY, view);
    expect(x).toBeCloseTo(110, 10);
    expect(y).toBeCloseTo(110, 10);
  });

  it('keeps the horizontal reflection playerUpScaleX() demands, so labels are not mirrored onto the wrong side', () => {
    // At rotation 0 with scaleX -1, a landmark to the player's +x lands LEFT of centre.
    const view = { width: 200, height: 200, playerX: 100, playerY: 100, rotation: 0, scaleX: playerUpScaleX() };
    const [right] = minimapPlayerViewPoint(140, 100, view);
    expect(right).toBeCloseTo(60, 10);
    const [, above] = minimapPlayerViewPoint(100, 60, view);
    expect(above).toBeCloseTo(60, 10);
  });
});
