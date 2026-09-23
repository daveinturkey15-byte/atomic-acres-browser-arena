/**
 * Source 5 — "Local H3 video to sprite animation".
 *
 * Primary sources read 2026-09-12: the owner-shared post (served by x.com), the
 * MiniMax H3 blog page and the Hugging Face model page. The post states the
 * workflow in four steps, verbatim from the page's own og:description:
 *   "1. one character design still, on a flat magenta background
 *    2. one 5s H3 clip per move (walk, jump, punch, kick, block...)
 *    3. cut each clip down to its pose extremes
 *    4. key out the magenta, pack into a sprite atlas"
 *
 * THE MODEL ITSELF IS NOT USABLE HERE. The published Community License excludes
 * use of the model *and its output* in the UK, EU, US and Korea without separate
 * written authorization, and this machine is in the UK. The register re-verified
 * that position on 2026-08-26 and it still stands; row 30's correction changed
 * H3's ROLE, not its licence. No H3 model, weights or output were fetched, and
 * none are used below.
 *
 * What IS reusable is the provider-neutral half of the workflow: pose-extreme
 * selection, chroma keying, atlas packing, and the frame timing that decides
 * whether the result reads as animation. That half is demonstrated here on
 * inputs generated locally in code, on the same flat magenta background the post
 * specifies, so the keying step is real rather than assumed.
 *
 * BEFORE: the raw clip played back at uniform spacing, magenta still present.
 * AFTER: pose extremes only, keyed to transparency, packed into one atlas and
 * played on per-extreme hold times.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  makeRng,
  sideBySide,
  type Demo,
  type DemoContext,
} from './_shared';

const TILE = 32;
const CLIP_FRAMES = 16;
const ATLAS_COLS = 4;

/** The "flat magenta background" the source names, as an exact key colour. */
const KEY = [255, 0, 255] as const;

/**
 * Stand-in for the generated clip: a deterministic stick figure drawn per frame
 * on a magenta field. Locally authored pixels, no model involved.
 */
function drawFrame(out: Uint8Array, offset: number, phase: number): void {
  const px = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = offset + (y * TILE + x) * 4;
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
  };
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) px(x, y, KEY[0], KEY[1], KEY[2]);
  }
  const swing = Math.sin(phase * Math.PI * 2);
  const lift = Math.max(0, Math.sin(phase * Math.PI * 2)) * 3;
  const cx = 16;
  const hip = 18 - Math.round(lift);
  for (let y = 6; y <= hip; y += 1) px(cx, y, 230, 210, 180); // torso
  for (let dy = 0; dy < 4; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) px(cx + dx, 4 + dy, 240, 225, 195); // head
  }
  for (let t = 0; t < 8; t += 1) {
    const k = t / 7;
    px(cx + Math.round(swing * 5 * k), hip + t, 200, 160, 120); // near leg
    px(cx - Math.round(swing * 5 * k), hip + t, 170, 130, 95); // far leg
    px(cx + Math.round(swing * 6 * k), 9 + t, 210, 175, 135); // near arm
  }
}

/** Step 3: keep only the pose extremes — the frames where motion reverses. */
function poseExtremes(frames: number[]): number[] {
  const picks: number[] = [];
  for (let i = 1; i < frames.length - 1; i += 1) {
    const a = frames[i] - frames[i - 1];
    const b = frames[i + 1] - frames[i];
    if (a === 0 || b === 0 || a * b < 0) picks.push(i);
  }
  if (picks.length === 0) picks.push(0);
  return picks;
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();
  const rng = makeRng(context.seed ^ 0x5717e);

  // Step 1+2: the "clip".
  const clip = new Uint8Array(CLIP_FRAMES * TILE * TILE * 4);
  const signal: number[] = [];
  for (let f = 0; f < CLIP_FRAMES; f += 1) {
    const phase = f / CLIP_FRAMES;
    drawFrame(clip, f * TILE * TILE * 4, phase);
    signal.push(Math.sin(phase * Math.PI * 2));
  }

  const extremes = poseExtremes(signal);
  const rows = Math.ceil(extremes.length / ATLAS_COLS);
  const atlasW = ATLAS_COLS * TILE;
  const atlasH = Math.max(1, rows) * TILE;

  // Step 4: key out the magenta while packing. Keying happens here, on the CPU,
  // and the alpha it writes is what the atlas material samples.
  const atlas = new Uint8Array(atlasW * atlasH * 4);
  let keyedTexels = 0;
  extremes.forEach((frameIndex, slot) => {
    const col = slot % ATLAS_COLS;
    const row = Math.floor(slot / ATLAS_COLS);
    for (let y = 0; y < TILE; y += 1) {
      for (let x = 0; x < TILE; x += 1) {
        const src = frameIndex * TILE * TILE * 4 + (y * TILE + x) * 4;
        const dst = ((row * TILE + y) * atlasW + (col * TILE + x)) * 4;
        const isKey = clip[src] === KEY[0] && clip[src + 1] === KEY[1] && clip[src + 2] === KEY[2];
        atlas[dst] = clip[src];
        atlas[dst + 1] = clip[src + 1];
        atlas[dst + 2] = clip[src + 2];
        atlas[dst + 3] = isKey ? 0 : 255;
        if (isKey) keyedTexels += 1;
      }
    }
  });

  const atlasTexture = registry.track(new THREE.DataTexture(atlas, atlasW, atlasH, THREE.RGBAFormat));
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.repeat.set(1 / ATLAS_COLS, 1 / Math.max(1, rows));
  atlasTexture.needsUpdate = true;

  const rawTexture = registry.track(new THREE.DataTexture(clip.slice(0, TILE * TILE * 4), TILE, TILE, THREE.RGBAFormat));
  rawTexture.colorSpace = THREE.SRGBColorSpace;
  rawTexture.magFilter = THREE.NearestFilter;
  rawTexture.minFilter = THREE.NearestFilter;
  rawTexture.needsUpdate = true;

  const quad = registry.track(new THREE.PlaneGeometry(0.9, 0.9));
  const rawMaterial = registry.track(new THREE.MeshBasicMaterial({ map: rawTexture, toneMapped: false }));
  const atlasMaterial = registry.track(
    new THREE.MeshBasicMaterial({ map: atlasTexture, transparent: true, alphaTest: 0.5, toneMapped: false }),
  );

  const before = new THREE.Mesh(quad, rawMaterial);
  before.name = 'before:raw-clip-uniform-timing-magenta-present';
  before.position.y = 0.5;
  const after = new THREE.Mesh(quad, atlasMaterial);
  after.name = 'after:pose-extremes-keyed-atlas';
  after.position.y = 0.5;

  const root = sideBySide(THREE, registry, before, after, 2.2);
  root.name = 'source-05:sprite-atlas-from-clip';
  root.rotation.y = (rng() - 0.5) * 0.02;

  // Per-extreme hold times: the timing half of step 3. Extremes are held longer
  // than pass-throughs, which is what makes a 4-frame atlas read as a move.
  const holds = extremes.map((_, i) => (i % 2 === 0 ? 0.18 : 0.1));
  const totalHold = holds.reduce((a, b) => a + b, 0);

  let rawFrame = 0;
  let atlasSlot = 0;

  const metadata = {
    sourceId: 5,
    title: 'Local H3 video to sprite animation',
    method:
      'Provider-neutral half of the published workflow: flat-key background, pose-extreme selection by motion reversal, chroma key to alpha during atlas packing, and per-extreme hold timing on a UV-offset billboard.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/victormustar/status/2089310616854892818',
      'https://www.minimax.io/blog/minimax-h3',
      'https://huggingface.co/MiniMaxAI/MiniMax-H3',
    ],
    limitation:
      'MiniMax H3 is licence-blocked on this machine: the Community License excludes use of the model and its output in the UK, and this machine is in the UK. No H3 model, weights or output were downloaded or used. The input frames here are drawn locally in code, so this demonstrates the atlas and timing half only - it is not evidence that the generator works or is available. The result is a 2D sprite/billboard animation, never a 3D skinned rig; prefer source 16 for character motion.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      clipFrames: CLIP_FRAMES,
      poseExtremes: extremes.length,
      keyedTexels,
    },
  };

  return {
    root,
    update(time: number) {
      // BEFORE: every frame, uniform spacing.
      const next = Math.floor(time * 12) % CLIP_FRAMES;
      if (next !== rawFrame) {
        rawFrame = next;
        (rawTexture.image.data as Uint8Array).set(clip.subarray(next * TILE * TILE * 4, (next + 1) * TILE * TILE * 4));
        rawTexture.needsUpdate = true;
      }
      // AFTER: extremes only, on their own hold times, by UV offset.
      let t = time % totalHold;
      let slot = 0;
      for (; slot < holds.length - 1 && t > holds[slot]; slot += 1) t -= holds[slot];
      if (slot !== atlasSlot) {
        atlasSlot = slot;
        atlasTexture.offset.set(
          (slot % ATLAS_COLS) / ATLAS_COLS,
          1 - (Math.floor(slot / ATLAS_COLS) + 1) / Math.max(1, rows),
        );
      }
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
