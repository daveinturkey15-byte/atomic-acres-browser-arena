#!/usr/bin/env node
/**
 * VIEWMODEL / SURFACE PENETRATION - THE CORRECTED METRIC.
 *
 * The previous pass graded on the authored muzzle socket. It closed that
 * number (worst +1.087 m to -0.041 m) and the owner still saw the gun through
 * the wall, because a socket is one authored point and the player sees the
 * SILHOUETTE. The corrected criterion, and the only one this script grades:
 *
 *     penetration = max(over every VISIBLE viewmodel mesh:
 *                       furthest-forward VERTEX along cameraForward)
 *                 - distanceToSurface
 *     accept when penetration <= 0
 *
 * Three things here are deliberately different from `measure-muzzle-contact.mjs`,
 * and each one changed a number:
 *
 *  1. VERTICES, not bounding-box corners. The arms are SkinnedMeshes, so their
 *     `geometry.boundingBox` is the BIND-POSE box and describes a volume the
 *     posed anatomy never occupies. Measured open-ground: the sleeve's box
 *     corner reads 2.93 m while its furthest real vertex is 1.72 m - 1.21 m of
 *     phantom. It is not conservative either: in the folded wall pose the same
 *     mesh's real vertices reach 0.86 m while its box corner reads 0.79 m, so
 *     the old number UNDER-reported the failure by 7 cm.
 *  2. The MOUNTED model's muzzle socket. `traverse` finds whichever weapon was
 *     added to the root first, and the presentation freezes the matrices of
 *     hidden models, so the old probe reported a socket frozen at load for
 *     every weapon except the first one measured.
 *  3. The applied CUT is reported. Where the fold cannot close the gap the
 *     renderer clips the rig at the contacting surface, so both numbers are
 *     published: `rigFwdMaxM` is what the pose achieved and `visibleFwdMaxM`
 *     is what actually reaches the screen. The grade is on what reaches the
 *     screen; the gap between them is stated rather than hidden.
 *
 * Installed Chrome only (`channel: 'chrome'`, `--mute-audio`): bundled
 * Chromium cannot get a WebGPU device here.
 *
 * Usage:
 *   node measure-viewmodel-penetration.mjs --url http://127.0.0.1:41988 \
 *     --out docs/assets/viewmodel-clipping-fix-2026-08-31 --tag extent-after
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41988');
const OUT = resolve(arg('--out', 'artifacts/qa/viewmodel-clip'));
const TAG = arg('--tag', 'extent-after');
const WEAPONS = arg('--weapons', 'carbine,sniper,explosive-crossbow,flamethrower').split(',');
const STANCES = arg('--stances', 'stand,crouch,prone').split(',');
const SHOTS = arg('--shots', '1') !== '0';
const WIDTH = Number(arg('--width', '2560'));
const HEIGHT = Number(arg('--height', '1440'));

mkdirSync(OUT, { recursive: true });

/** Anchor points to sweep for a contacting surface, per arena. */
const SITES = {
  'atomic-acres': [
    { site: 'flat-wall', anchor: [-35.0, 23.0], heading: Math.PI / 2, pitch: 0, label: 'long perimeter wall x=-37, faced head-on' },
    { site: 'post', anchor: [-34.5, 12.0], heading: 0, pitch: 0, label: '0.61 m square post (crate scale)' },
    { site: 'corner', anchor: [-35.4, 28.4], heading: 2.356, pitch: 0, label: 'inside corner of the x=-37 and z=30 walls' },
    { site: 'floor-down', anchor: [-18.041, 20.003], heading: 4.712, pitch: -1.2, label: 'open ground, steep down-pitch (no wall)', noSurfaceRay: true },
    { site: 'open', anchor: [-18.041, 20.003], heading: 4.712, pitch: 0, label: 'open ground, level - the no-fold control', noSurfaceRay: true },
  ],
  test2: [
    { site: 'flat-wall', anchor: [-36.0, -21.5], heading: 0, pitch: 0, label: 'nearest structural wall found by sweep' },
    { site: 'floor-down', anchor: [-36.0, -21.5], heading: 0, pitch: -1.2, label: 'open ground, steep down-pitch (no wall)', noSurfaceRay: true },
    { site: 'open', anchor: [-36.0, -21.5], heading: 0, pitch: 0, label: 'open ground, level - the no-fold control', noSurfaceRay: true },
  ],
};

const EYE_HEIGHT = { stand: 1.7, crouch: 1.16, prone: 0.61 };
/** Eye standoffs from the discovered surface, metres. 0.40 is the failing case. */
const STANDOFFS = [0.4];

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--mute-audio',
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const errors = [];
let stalled = 0;
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=vmclip&previewTime=0`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[vmclip] backend=${backend} tag=${TAG} viewport=${WIDTH}x${HEIGHT}`);
if (backend !== 'webgpu') console.error('[vmclip] WARNING: not on the WebGPU route');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measure(context) {
  return page.evaluate((ctx) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const scene = api.sampleSceneGraph();
    let camera = null;
    let vmRoot = null;
    scene.traverse((n) => {
      if (!camera && n.isCamera && n.isPerspectiveCamera) camera = n;
      if (!vmRoot && n.name === 'original-weapon-view') vmRoot = n;
    });
    if (!camera || !vmRoot) return { ok: false, error: `camera=${Boolean(camera)} vmRoot=${Boolean(vmRoot)}` };
    scene.updateMatrixWorld(true);
    const V3 = scene.position.constructor;

    const eye = camera.getWorldPosition(new V3());
    const fwd = camera.getWorldDirection(new V3());
    const fwdOf = (p) => (p.x - eye.x) * fwd.x + (p.y - eye.y) * fwd.y + (p.z - eye.z) * fwd.z;

    // The MOUNTED model, not merely the first one in the tree: hidden weapons
    // keep matrices frozen at load, and their sockets read as world garbage.
    let mounted = null;
    for (const child of vmRoot.children) {
      if (child.visible && child.getObjectByName && child.getObjectByName('muzzle-socket')) { mounted = child; break; }
    }
    const muzzle = mounted ? mounted.getObjectByName('muzzle-socket') : null;
    const muzzleWorld = muzzle ? muzzle.getWorldPosition(new V3()) : null;

    // Furthest-forward VERTEX per visible mesh, skinning applied.
    let weaponFwdMax = -Infinity;
    let weaponFwdPart = null;
    let armsFwdMax = -Infinity;
    let armsFwdPart = null;
    let meshes = 0;
    let vertices = 0;
    const scratch = new V3();
    vmRoot.traverse((n) => {
      if (!n.isMesh || !n.visible) return;
      for (let p = n; p && p !== vmRoot; p = p.parent) if (!p.visible) return;
      const g = n.geometry;
      const pos = g && g.attributes && g.attributes.position;
      if (!pos) return;
      meshes += 1;
      vertices += pos.count;
      const skinned = Boolean(n.isSkinnedMesh && typeof n.applyBoneTransform === 'function');
      let localMax = -Infinity;
      for (let i = 0; i < pos.count; i += 1) {
        scratch.fromBufferAttribute(pos, i);
        if (skinned) n.applyBoneTransform(i, scratch);
        scratch.applyMatrix4(n.matrixWorld);
        const d = (scratch.x - eye.x) * fwd.x + (scratch.y - eye.y) * fwd.y + (scratch.z - eye.z) * fwd.z;
        if (d > localMax) localMax = d;
      }
      const arms = /arm|sleeve|hand|glove|finger|skin|wrist/i.test(n.name);
      if (arms) { if (localMax > armsFwdMax) { armsFwdMax = localMax; armsFwdPart = n.name; } }
      else if (localMax > weaponFwdMax) { weaponFwdMax = localMax; weaponFwdPart = n.name; }
    });

    // The contacting surface: first ballistic impact straight down the camera
    // axis. World truth, independent of anything presentation does.
    let surfaceDistanceM = null;
    let surfaceKind = null;
    if (!ctx.noSurfaceRay) {
      try {
        const trace = api.traceBallistics('carbine', [eye.x, eye.y, eye.z], [fwd.x, fwd.y, fwd.z], 12);
        const impact = trace && trace.impacts && trace.impacts[0];
        if (impact && Number.isFinite(impact.entryDistance)) {
          surfaceDistanceM = impact.entryDistance;
          surfaceKind = impact.kind ?? impact.surface ?? 'impact';
        }
      } catch (e) { surfaceKind = `trace-failed:${String(e).slice(0, 60)}`; }
    } else {
      const snap0 = api.snapshot();
      const eyeHeight = snap0.player.stance === 'prone' ? 0.61 : snap0.player.stance === 'crouch' ? 1.16 : 1.7;
      const footY = snap0.player.position[1] - eyeHeight;
      if (fwd.y < -0.001) { surfaceDistanceM = (eye.y - footY) / -fwd.y; surfaceKind = 'stance-ground-plane'; }
    }

    const diag = api.sampleFireAdmissionDiagnostics();
    const snap = api.snapshot();
    const fold = diag.contactFold ?? null;
    const clipM = fold && Number.isFinite(fold.clipPlaneDistanceMeters)
      ? fold.clipPlaneDistanceMeters - 0.02
      : null;
    const rigFwdMax = Math.max(
      Number.isFinite(weaponFwdMax) ? weaponFwdMax : -Infinity,
      Number.isFinite(armsFwdMax) ? armsFwdMax : -Infinity,
    );
    return {
      ok: true,
      eye: [eye.x, eye.y, eye.z],
      forward: [fwd.x, fwd.y, fwd.z],
      cameraNear: camera.near,
      stance: snap.player.stance,
      weapon: snap.player.weapon,
      mountedModel: mounted ? mounted.name : null,
      surfaceDistanceM,
      surfaceKind,
      muzzleForwardM: muzzleWorld ? fwdOf(muzzleWorld) : null,
      weaponFwdMaxM: Number.isFinite(weaponFwdMax) ? weaponFwdMax : null,
      weaponFwdPart,
      armsFwdMaxM: Number.isFinite(armsFwdMax) ? armsFwdMax : null,
      armsFwdPart,
      rigFwdMaxM: Number.isFinite(rigFwdMax) ? rigFwdMax : null,
      clipPlaneDistanceM: clipM,
      visibleFwdMaxM: Number.isFinite(rigFwdMax)
        ? (clipM === null ? rigFwdMax : Math.min(rigFwdMax, clipM))
        : null,
      vmMeshes: meshes,
      vmVertices: vertices,
      rootLocal: vmRoot.position.toArray(),
      rootRot: [vmRoot.rotation.x, vmRoot.rotation.y, vmRoot.rotation.z],
      rootScale: vmRoot.scale.x,
      clipEnabled: vmRoot.enabled === true && vmRoot.isClippingGroup === true,
      diag: {
        retreat: diag.retreat ?? null,
        nearestForwardMeters: diag.nearestForwardMeters ?? null,
        probeLengthMeters: diag.probeLengthMeters ?? null,
        fireAdmission: diag.fireAdmission ?? null,
        dressingBoxCount: diag.dressingBoxCount ?? null,
        contactDepthMeters: diag.contactDepthMeters ?? null,
        contactFold: fold,
      },
    };
  }, context);
}

const rows = [];
const ARENAS = arg('--arenas', '').split(',').map((a) => a.trim()).filter(Boolean);
const OUT_JSON = resolve(OUT, `measurements-${TAG}.json`);
/**
 * Write after every row. A long 2560x1440 WebGPU run occasionally loses the
 * page ("Target page, context or browser has been closed"), and a run that
 * only writes at the end then produces nothing at all - which is how the first
 * before-run of this pass lost 84 good rows.
 */
const flush = () => writeFileSync(OUT_JSON, JSON.stringify(rows, null, 1));

/**
 * Resolve only once the page has actually PRESENTED frames.
 *
 * The renderer stalls occasionally on a long run, and a stalled frame loop is
 * silent: `snapshot()` keeps answering, the pose keeps its last value, and the
 * run fills with plausible-looking identical rows. It did exactly that - an
 * entire test2 leg reported the same three numbers for every site, weapon and
 * stance. Blocking on real animation frames turns that into a loud failure.
 */
async function awaitFrames(count = 3, timeoutMs = 8_000) {
  return page.evaluate(async ({ count, timeoutMs }) => await new Promise((done) => {
    let seen = 0;
    const deadline = setTimeout(() => done(false), timeoutMs);
    const tick = () => {
      seen += 1;
      if (seen >= count) { clearTimeout(deadline); done(true); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { count, timeoutMs });
}

for (const [arena, sites] of Object.entries(SITES)) {
  if (ARENAS.length > 0 && !ARENAS.includes(arena)) continue;
  await page.evaluate(async (id) => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena(id);
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  }, arena);
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await sleep(5_000);
  console.error(`[vmclip] ${arena} active`);

  for (const site of sites) {
    const found = await page.evaluate(({ site }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setStance('stand');
      api.teleportPlayer(site.anchor[0], 1.7, site.anchor[1], site.heading, site.pitch);
      if (site.noSurfaceRay) return { ok: true, hitPoint: null, yaw: site.heading };
      const base = [site.anchor[0], 1.7, site.anchor[1]];
      let best = null;
      for (let a = 0; a < 32; a += 1) {
        const yaw = site.heading + ((a % 2 === 0 ? 1 : -1) * Math.ceil(a / 2)) * (Math.PI / 32);
        const dir = [-Math.sin(yaw), 0, -Math.cos(yaw)];
        let trace;
        try { trace = api.traceBallistics('carbine', base, dir, 14); } catch { continue; }
        const entry = trace?.impacts?.[0]?.entryDistance;
        if (Number.isFinite(entry) && entry >= 0.6 && entry <= 12) {
          if (!best || entry < best.distance) best = { yaw, distance: entry };
          if (a === 0) break;
        }
      }
      if (!best) return { ok: false };
      return {
        ok: true,
        yaw: best.yaw,
        distance: best.distance,
        hitPoint: [base[0] - Math.sin(best.yaw) * best.distance, 1.7, base[2] - Math.cos(best.yaw) * best.distance],
      };
    }, { site });
    if (!found.ok) { console.error(`[vmclip] ${arena}/${site.site}: no surface found`); continue; }

    for (const standoff of STANDOFFS) {
      for (const weapon of WEAPONS) {
        for (const stance of STANCES) {
          const eyeY = EYE_HEIGHT[stance];
          const place = found.hitPoint
            ? [found.hitPoint[0] + Math.sin(found.yaw) * standoff, eyeY, found.hitPoint[2] + Math.cos(found.yaw) * standoff]
            : [site.anchor[0], eyeY, site.anchor[1]];
          await page.evaluate(({ weapon, stance, place, yaw, pitch }) => {
            const api = window.__ATOMIC_ACRES_DEBUG__;
            api.equipWeapon(weapon);
            api.setStance(stance);
            api.teleportPlayer(place[0], place[1], place[2], yaw, pitch);
          }, { weapon, stance, place, yaw: found.yaw, pitch: site.pitch });
          await sleep(1400);
          const live = await awaitFrames();
          await page.evaluate(({ place, yaw, pitch }) => {
            window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(place[0], place[1], place[2], yaw, pitch);
          }, { place, yaw: found.yaw, pitch: site.pitch });
          await sleep(700);

          // The surface is discovered at standing eye height; a plinth or low
          // return can put the crouch/prone eye INSIDE it, and a surface
          // distance of zero makes the penetration figure meaningless. Back
          // the eye off until the stance genuinely stands `standoff` off it.
          let m = await measure({ noSurfaceRay: Boolean(site.noSurfaceRay) });
          for (let attempt = 0; attempt < 3 && !site.noSurfaceRay; attempt += 1) {
            const measured = m.ok ? m.surfaceDistanceM : null;
            if (measured !== null && measured >= standoff - 0.06) break;
            const back = measured === null ? standoff : standoff - measured;
            place[0] += Math.sin(found.yaw) * back;
            place[2] += Math.cos(found.yaw) * back;
            await page.evaluate(({ place, yaw, pitch }) => {
              window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(place[0], place[1], place[2], yaw, pitch);
            }, { place, yaw: found.yaw, pitch: site.pitch });
            await sleep(600);
            m = await measure({ noSurfaceRay: Boolean(site.noSurfaceRay) });
          }
          if (!m.ok) { console.error(`[vmclip] measure failed: ${m.error}`); continue; }
          if (!live) {
            console.error(`[vmclip] STALLED at ${arena}/${site.site}/${weapon}/${stance} - row dropped`);
            stalled += 1;
            continue;
          }
          const surface = m.surfaceDistanceM;
          const pen = (v) => (v !== null && surface !== null ? v - surface : null);
          const name = `${TAG}-${arena}-${site.site}-${weapon}-${stance}`;
          if (SHOTS) await page.screenshot({ path: resolve(OUT, `${name}.png`) });
          const row = {
            tag: TAG, arena, site: site.site, siteLabel: site.label, standoffRequestedM: standoff,
            weapon, stance, ...m,
            muzzlePenetrationM: pen(m.muzzleForwardM),
            weaponPenetrationM: pen(m.weaponFwdMaxM),
            armsPenetrationM: pen(m.armsFwdMaxM),
            rigPenetrationM: pen(m.rigFwdMaxM),
            penetrationM: pen(m.visibleFwdMaxM),
            screenshot: `${name}.png`,
          };
          rows.push(row);
          flush();
          console.error(`[vmclip] ${name}  surface=${surface === null ? 'n/a' : surface.toFixed(3)}`
            + ` muzzle=${m.muzzleForwardM?.toFixed(3)} weapon=${m.weaponFwdMaxM?.toFixed(3)}`
            + ` arms=${m.armsFwdMaxM?.toFixed(3)} visible=${m.visibleFwdMaxM?.toFixed(3)}`
            + ` PEN=${row.penetrationM === null ? 'n/a' : row.penetrationM.toFixed(3)}`);
        }
      }
    }
  }
}

flush();
const graded = rows.filter((r) => r.penetrationM !== null && r.surfaceDistanceM > 0.05);
const bad = graded.filter((r) => r.penetrationM > 0);
console.error(`[vmclip] ${rows.length} rows, ${graded.length} graded, ${bad.length} with VISIBLE geometry past the surface. stalled=${stalled} errors=${errors.length}`);
for (const r of bad.slice(0, 12)) {
  console.error(`[vmclip]   FAIL ${r.arena}/${r.site}/${r.weapon}/${r.stance} pen=${r.penetrationM.toFixed(3)}`);
}
if (errors.length) console.error(errors.slice(0, 5).join('\n'));
await browser.close();
