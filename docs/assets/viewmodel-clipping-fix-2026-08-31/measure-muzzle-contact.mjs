#!/usr/bin/env node
/**
 * VIEWMODEL MUZZLE / SURFACE PENETRATION MEASUREMENT
 *
 * The single number that matters: how far PAST the contacting surface does the
 * on-screen muzzle end up, measured along the camera-forward axis.
 *
 *     penetrationM = dot(muzzleWorld - eye, forward) - surfaceDistanceM
 *
 * Anything > 0 is the owner's complaint. Runs on INSTALLED Chrome (channel
 * 'chrome') because the bundled Chromium cannot get a WebGPU device here.
 *
 * Usage:
 *   node measure-muzzle-contact.mjs --url http://127.0.0.1:41988 \
 *     --out docs/assets/viewmodel-clipping-fix-2026-08-31 --tag before
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
const TAG = arg('--tag', 'before');
const WEAPONS = arg('--weapons', 'carbine,sniper,explosive-crossbow,flamethrower').split(',');
const STANCES = arg('--stances', 'stand,crouch,prone').split(',');
const SHOTS = arg('--shots', '1') !== '0';

mkdirSync(OUT, { recursive: true });

const EYE_HEIGHT = { stand: 1.7, crouch: 1.16, prone: 0.61 };

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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=vmclip&previewTime=0`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[vmclip] backend=${backend} tag=${TAG}`);
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

    // Muzzle socket: the authored barrel exit of the mounted model.
    let muzzle = null;
    vmRoot.traverse((n) => { if (!muzzle && n.name === 'muzzle-socket') muzzle = n; });
    const muzzleWorld = muzzle ? muzzle.getWorldPosition(new V3()) : null;

    // Per-mesh world-corner maximum: much tighter than one world AABB of the
    // rotated rig, and it names the offending part.
    let weaponFwdMax = -Infinity;
    let weaponFwdPart = null;
    let armsFwdMax = -Infinity;
    let meshes = 0;
    vmRoot.traverse((n) => {
      if (!n.isMesh || !n.visible) return;
      let hidden = false;
      for (let p = n; p && p !== vmRoot; p = p.parent) if (!p.visible) hidden = true;
      if (hidden) return;
      const g = n.geometry;
      if (!g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      if (!bb) return;
      meshes += 1;
      const m = n.matrixWorld.elements;
      let localMax = -Infinity;
      for (let i = 0; i < 8; i += 1) {
        const x = (i & 1) ? bb.max.x : bb.min.x;
        const y = (i & 2) ? bb.max.y : bb.min.y;
        const z = (i & 4) ? bb.max.z : bb.min.z;
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        const d = (wx - eye.x) * fwd.x + (wy - eye.y) * fwd.y + (wz - eye.z) * fwd.z;
        if (d > localMax) localMax = d;
      }
      const arms = /arm|sleeve|hand|glove|finger/i.test(n.name);
      if (arms) { if (localMax > armsFwdMax) armsFwdMax = localMax; }
      else if (localMax > weaponFwdMax) { weaponFwdMax = localMax; weaponFwdPart = n.name; }
    });

    // The contacting surface: first ballistic impact straight down the camera
    // axis. This is world truth, independent of anything presentation does.
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
      // Steep down-pitch over open ground: the surface is the stance floor plane.
      const snap = api.snapshot();
      const eyeHeight = snap.player.stance === 'prone' ? 0.61 : snap.player.stance === 'crouch' ? 1.16 : 1.7;
      const footY = snap.player.position[1] - eyeHeight;
      if (fwd.y < -0.001) { surfaceDistanceM = (eye.y - footY) / -fwd.y; surfaceKind = 'stance-ground-plane'; }
    }

    const diag = api.sampleFireAdmissionDiagnostics();
    const snap = api.snapshot();
    return {
      ok: true,
      eye: [eye.x, eye.y, eye.z],
      forward: [fwd.x, fwd.y, fwd.z],
      cameraNear: camera.near,
      fov: camera.fov,
      stance: snap.player.stance,
      weapon: snap.player.weapon,
      surfaceDistanceM,
      surfaceKind,
      muzzleWorld: muzzleWorld ? [muzzleWorld.x, muzzleWorld.y, muzzleWorld.z] : null,
      muzzleForwardM: muzzleWorld ? fwdOf(muzzleWorld) : null,
      weaponFwdMaxM: Number.isFinite(weaponFwdMax) ? weaponFwdMax : null,
      weaponFwdPart,
      armsFwdMaxM: Number.isFinite(armsFwdMax) ? armsFwdMax : null,
      vmMeshes: meshes,
      mountedModels: (() => {
        const names = [];
        for (const child of vmRoot.children) if (child.visible) names.push(child.name || child.type);
        return names;
      })(),
      rootLocal: vmRoot.position.toArray(),
      rootRot: [vmRoot.rotation.x, vmRoot.rotation.y, vmRoot.rotation.z],
      rootScale: vmRoot.scale.x,
      diag: {
        retreat: diag.retreat ?? null,
        nearestForwardMeters: diag.nearestForwardMeters ?? null,
        probeLengthMeters: diag.probeLengthMeters ?? null,
        probePaddingMeters: diag.probePaddingMeters ?? null,
        fireAdmission: diag.fireAdmission ?? null,
        dressingBoxCount: diag.dressingBoxCount ?? null,
        contactDepthMeters: diag.contactDepthMeters ?? null,
        contactEnvelope: diag.contactEnvelope ?? null,
        contactFold: diag.contactFold ?? null,
      },
      presentation: (() => {
        try { return api.samplePresentationTelemetry?.() ? null : null; } catch { return null; }
      })(),
    };
  }, context);
}

const rows = [];

const ARENAS = arg('--arenas', '').split(',').map((a) => a.trim()).filter(Boolean);

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
    // Discover the contacting surface from the anchor, then park the eye at
    // each standoff so every arena gets the SAME geometric test.
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
          // Re-assert the pose: stance changes re-derive eye height.
          await page.evaluate(({ place, yaw, pitch }) => {
            window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(place[0], place[1], place[2], yaw, pitch);
          }, { place, yaw: found.yaw, pitch: site.pitch });
          await sleep(700);

          // The surface is discovered at standing eye height; a plinth, kerb or
          // low return can put the CROUCH/PRONE eye inside it, and a surface
          // distance of zero makes the penetration number meaningless. Back the
          // eye off along -forward until the stance actually stands `standoff`
          // metres off whatever it is looking at.
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
          const penetrationM = (m.muzzleForwardM !== null && m.surfaceDistanceM !== null)
            ? m.muzzleForwardM - m.surfaceDistanceM : null;
          const weaponPenetrationM = (m.weaponFwdMaxM !== null && m.surfaceDistanceM !== null)
            ? m.weaponFwdMaxM - m.surfaceDistanceM : null;
          const name = `${TAG}-${arena}-${site.site}-${weapon}-${stance}`;
          if (SHOTS) await page.screenshot({ path: resolve(OUT, `${name}.png`) });
          const row = {
            tag: TAG, arena, site: site.site, siteLabel: site.label, standoffRequestedM: standoff,
            weapon, stance, ...m, penetrationM, weaponPenetrationM, screenshot: `${name}.png`,
          };
          rows.push(row);
          console.error(`[vmclip] ${name}  surface=${m.surfaceDistanceM?.toFixed(3)} muzzle=${m.muzzleForwardM?.toFixed(3)} PEN=${penetrationM === null ? 'n/a' : penetrationM.toFixed(3)}`);
        }
      }
    }
  }
}

writeFileSync(resolve(OUT, `measurements-${TAG}.json`), JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => r.penetrationM !== null && r.penetrationM > 0);
console.error(`[vmclip] ${rows.length} rows, ${bad.length} with muzzle past the surface. errors=${errors.length}`);
if (errors.length) console.error(errors.slice(0, 5).join('\n'));
await browser.close();
