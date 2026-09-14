/**
 * Source 26 - Arcade attract-loop game-select menu (AMIX GAMES).
 *
 * Primary source, read on 2026-09-12: https://amix-design.com/tl/web-g-games/ returned HTTP
 * 200 and 73,881 bytes of real HTML, with an unminified ES module at
 * https://amix-design.com/tl/web-g-games/js/main.js (51,967 bytes) and the site's own
 * https://amix-design.com/tl/web-g-games/license.html (8,158 bytes). All three were fetched
 * and read; hashes are in docs/technique-lab/group-b/url-attempts.json.
 *
 * LICENCE POSITION: the site's licence page reserves the design of the page, its key visuals,
 * the gamepad model and its audio. NOTHING of its markup, CSS, art, audio or code may be
 * taken. What is reproduced below is BEHAVIOUR described in our own words and implemented in
 * our own code - the route the carrier skill `game-hud-menu-overhaul` (v1.1.0, lines 30-77)
 * already records for this row.
 *
 * The two pieces of arithmetic were confirmed against the source module rather than trusted
 * from the register summary: `const TAU = Math.PI * 2` (main.js line 11), and the ring
 * geometry `const R = (N * (W + GAP)) / TAU; const STEP = TAU / N;` (main.js lines 101-102).
 * Deriving the radius from item count is what keeps card spacing constant as a roster grows,
 * and it is the reason one card-width of pointer travel can equal exactly one step.
 *
 * Demonstrated here: ring geometry from item count, short-way rotation modulo N, two-stage
 * commit (activating a side card only brings it to the front; only the front card launches),
 * and the content-derived accent colour WITH the saturation/lightness clamp that guarantees
 * contrast instead of hoping for it. The clamp is shown as an explicit before/after pair of
 * swatches, because the clamp is the part that is easy to drop and expensive to lose.
 */

import { createRng } from './rng';
import { disposeGroup, type Demo, type DemoContext } from './types';

const ITEM_COUNT = 8;
const CARD_WIDTH = 1.0;
const CARD_HEIGHT = 0.64;
const CARD_GAP = 0.34;
const TAU = Math.PI * 2;

/** Ring radius derived from item count, not hand-tuned: R = N (W + GAP) / TAU. */
const RING_RADIUS = (ITEM_COUNT * (CARD_WIDTH + CARD_GAP)) / TAU;
const STEP = TAU / ITEM_COUNT;

interface Hsl { h: number; s: number; l: number }

/**
 * Deterministic stand-in for cover art: a few coloured bands, one of which is a strong hue
 * and one of which is deliberately washed out, so the clamp has something to correct.
 */
function makeCoverPixels(index: number, seed: number): { data: Uint8Array; size: number } {
  const size = 16;
  const random = createRng(seed + index * 7919);
  const data = new Uint8Array(size * size * 4);
  const hue = (index / ITEM_COUNT + 0.06) % 1;
  // Every third card is a near-neutral cover: those are the ones a naive extractor turns into
  // an unreadable grey accent.
  const washed = index % 3 === 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const band = Math.floor((y / size) * 4);
      const saturation = washed ? 0.06 + random() * 0.05 : 0.35 + band * 0.16;
      const lightness = 0.16 + band * 0.17 + random() * 0.05;
      const [r, g, b] = hslToRgb(hue + band * 0.02, Math.min(0.95, saturation), Math.min(0.92, lightness));
      const i = (y * size + x) * 4;
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }
  return { data, size };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(hue * 6) % 6;
  const table: [number, number, number][] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ];
  const [r, g, b] = table[sector];
  return [r + m, g + m, b + m];
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

/**
 * Accent extraction: score every pixel by saturation weighted against its distance from
 * mid-lightness, take the winner, then CLAMP saturation and lightness into a band that is
 * legible whatever the art does. A cover too neutral to score falls back to a fixed accent.
 */
function extractAccent(pixels: { data: Uint8Array; size: number }): { raw: Hsl; clamped: Hsl; fellBack: boolean } {
  let best: Hsl = { h: 0, s: 0, l: 0.5 };
  let bestScore = -1;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const hsl = rgbToHsl(pixels.data[i] / 255, pixels.data[i + 1] / 255, pixels.data[i + 2] / 255);
    const score = hsl.s * (1 - Math.abs(hsl.l - 0.5) * 1.4);
    if (score > bestScore) {
      bestScore = score;
      best = hsl;
    }
  }
  const fellBack = best.s < 0.18;
  const clamped: Hsl = fellBack
    ? { h: 0.55, s: 0.74, l: 0.55 }
    : { h: best.h, s: Math.max(0.72, best.s), l: Math.min(0.6, Math.max(0.5, best.l)) };
  return { raw: best, clamped, fellBack };
}

/** Shortest signed angular distance, modulo N - the "rotate the short way round" rule. */
export function shortWayDelta(fromIndex: number, toIndex: number, count: number): number {
  let delta = (toIndex - fromIndex) % count;
  if (delta > count / 2) delta -= count;
  if (delta < -count / 2) delta += count;
  return delta;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-26-game-select-ring';

  const ring = new THREE.Group();
  ring.name = 'ring';
  root.add(ring);

  const textures: import('three').DataTexture[] = [];
  const cards: import('three').Mesh[] = [];
  const accents: { raw: Hsl; clamped: Hsl; fellBack: boolean }[] = [];
  const cardGeometry = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);

  for (let i = 0; i < ITEM_COUNT; i += 1) {
    const pixels = makeCoverPixels(i, seed);
    accents.push(extractAccent(pixels));
    const texture = new THREE.DataTexture(pixels.data, pixels.size, pixels.size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    textures.push(texture);

    const card = new THREE.Mesh(
      cardGeometry,
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }),
    );
    card.name = `card-${i}`;
    const angle = i * STEP;
    // Cards sit on the ring facing outwards; the front slot is the one nearest the viewer.
    card.position.set(Math.sin(angle) * RING_RADIUS, 1.2, Math.cos(angle) * RING_RADIUS);
    card.rotation.y = angle;
    ring.add(card);
    cards.push(card);
  }

  // Two swatches: what a naive extractor would ship, and what the clamp guarantees.
  const swatchGeometry = new THREE.PlaneGeometry(0.5, 0.3);
  const rawSwatchMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  const clampedSwatchMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  const rawSwatch = new THREE.Mesh(swatchGeometry, rawSwatchMaterial);
  const clampedSwatch = new THREE.Mesh(swatchGeometry, clampedSwatchMaterial);
  rawSwatch.name = 'accent-raw-unclamped';
  clampedSwatch.name = 'accent-clamped';
  rawSwatch.position.set(-0.32, 0.35, RING_RADIUS + 0.9);
  clampedSwatch.position.set(0.32, 0.35, RING_RADIUS + 0.9);
  root.add(rawSwatch, clampedSwatch);

  // The focus rail: one element whose colour is the live accent, standing in for the
  // `--accent` custom property the source writes on its root element.
  const railMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
  const rail = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH * 1.12, 0.045), railMaterial);
  rail.name = 'focus-rail';
  rail.position.set(0, 1.2 - CARD_HEIGHT * 0.62, RING_RADIUS + 0.02);
  root.add(rail);

  let focusIndex = 0;
  let committedIndex = -1;
  let ringAngle = 0;
  let targetAngle = 0;
  let nextEventAt = 1.2;
  /** Two-stage commit: a side card must first become the focus; only the focus launches. */
  let pendingActivation: number | null = null;

  function applyAccent(index: number): void {
    const accent = accents[index];
    const raw = hslToRgb(accent.raw.h, accent.raw.s, accent.raw.l);
    const clamped = hslToRgb(accent.clamped.h, accent.clamped.s, accent.clamped.l);
    rawSwatchMaterial.color.setRGB(raw[0], raw[1], raw[2]);
    clampedSwatchMaterial.color.setRGB(clamped[0], clamped[1], clamped[2]);
    railMaterial.color.setRGB(clamped[0], clamped[1], clamped[2]);
  }
  applyAccent(focusIndex);

  function update(time: number, dt: number): void {
    if (time >= nextEventAt) {
      nextEventAt = time + 1.6;
      if (pendingActivation === null) {
        // Stage 1: a non-focused card is activated. It rotates to the front. It does NOT launch.
        pendingActivation = (focusIndex + 3) % ITEM_COUNT;
        targetAngle -= shortWayDelta(focusIndex, pendingActivation, ITEM_COUNT) * STEP;
        focusIndex = pendingActivation;
        committedIndex = -1;
        applyAccent(focusIndex);
      } else {
        // Stage 2: the same activation on the focus slot is the launch.
        committedIndex = pendingActivation;
        pendingActivation = null;
      }
    }

    // Critically damped approach to the target so the ring settles on a step boundary.
    const rate = Math.min(1, dt * 6);
    ringAngle += (targetAngle - ringAngle) * rate;
    ring.rotation.y = ringAngle;

    for (let i = 0; i < cards.length; i += 1) {
      const isFocus = i === focusIndex;
      const isCommitted = i === committedIndex;
      const scale = isCommitted ? 1.16 : isFocus ? 1.08 : 1;
      cards[i].scale.setScalar(scale);
    }
    rail.scale.x = committedIndex >= 0 ? 1.2 : 1;
  }

  return {
    root,
    update,
    dispose: () => {
      disposeGroup(root);
      cardGeometry.dispose();
      swatchGeometry.dispose();
      rawSwatchMaterial.dispose();
      clampedSwatchMaterial.dispose();
      railMaterial.dispose();
      for (const texture of textures) texture.dispose();
    },
    metadata: {
      sourceId: 26,
      title: 'Arcade attract-loop game-select menu (AMIX GAMES)',
      method:
        'Game-select ring whose geometry is derived from item count (R = N(W+GAP)/TAU, '
        + 'STEP = TAU/N, confirmed at main.js lines 101-102), rotated the short way round '
        + 'modulo N, with two-stage commit - activating a side card only brings it to the focus '
        + 'slot, and only the focus slot launches - and a content-derived accent colour scored '
        + 'by saturation against distance from mid-lightness, then clamped into a legible '
        + 'saturation/lightness band with a fixed fallback for near-neutral art. The two '
        + 'swatches show the unclamped extraction beside the clamped one.',
      adaptation: 'adapted',
      sources: [
        'https://amix-design.com/tl/web-g-games/',
        'https://amix-design.com/tl/web-g-games/js/main.js',
        'https://amix-design.com/tl/web-g-games/license.html',
      ],
      limitation:
        'The source page is all rights reserved for its design, markup, art, audio and code; '
        + 'this reproduces described behaviour in our own implementation and none of its '
        + 'expression. A demo owns no DOM, so the source\'s most portable idea - the semantic '
        + '<li> roster as the single data source with the 3D ring as a view over it - is stated '
        + 'but NOT demonstrated here, and neither are its degradation branches, entry gate, '
        + 'audio fork or deterministic capture mode. Selection advances on a timer because a '
        + 'demo may not register input listeners.',
      localLights: [],
    },
  };
}

export default createDemo;
