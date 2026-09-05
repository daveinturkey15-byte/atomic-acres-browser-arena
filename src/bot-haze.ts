import * as THREE from 'three';

/**
 * HF-399, hoisted out of `legacy-main.ts` by PASS 95 lane `v8-bot-behaviour`
 * under the standing streamline cadence and the legacy-main size ratchet.
 *
 * The haze sprite is attached by `addNeonBotHaze` when the bot rig is built and
 * never moves within it, so it is resolved once per rig instead of with a
 * `getObjectByName` walk over ~190 rig nodes per bot per frame.
 *
 * INVARIANT THIS CACHE DEPENDS ON: `addNeonBotHaze` (the only site in src/ that
 * creates a node named 'neon-purple-bot-haze') runs exactly once per rig, in
 * the bot rig builder immediately after buildOperator, and no code re-attaches
 * or replaces it afterwards - the other three read sites only set `visible` or
 * test `instanceof`. A cached sprite that has been detached from its rig is
 * re-resolved below, so a future change that swaps the sprite still works; a
 * haze attached to a rig that had NONE at build time would still be missed,
 * which is why the invariant is stated here rather than only assumed.
 */
const botHazeSpriteByRoot = new WeakMap<THREE.Object3D, THREE.Sprite | null>();

export function botHazeSprite(root: THREE.Object3D): THREE.Sprite | null {
  let haze = botHazeSpriteByRoot.get(root);
  if (haze === undefined || (haze !== null && haze.parent === null)) {
    const found = root.getObjectByName('neon-purple-bot-haze');
    haze = found instanceof THREE.Sprite && found.material instanceof THREE.SpriteMaterial ? found : null;
    botHazeSpriteByRoot.set(root, haze);
  }
  return haze;
}
