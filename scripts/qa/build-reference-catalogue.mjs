// Build a single browsable HTML catalogue over the WHOLE reference corpus.
//
// WHY THIS EXISTS (2026-09-16). The owner's verdict on two to three days of lane
// output was that it "doesn't feel like it's done much at all", and the cause was
// structural: ~600 reference images existed and nothing in the pipeline ever put a
// render beside one. There was an asset gallery (atomic-acres-catalog/assets-batch1/
// index.html, 85 turnaround renders) but no catalogue of the REFERENCES themselves,
// so there was no way to see the corpus, and no way to see which parts of it the
// build is actually being graded against.
//
// So this is not decoration. Every reference is tagged with the capture station it
// is paired to, and the top of the page reports how much of the corpus has no
// station at all - which is the number that decides what the next lane does.
//
// Thumbnails are generated to WebP (sharp, already a dependency) because the corpus
// is ~1.2 GB of PNG; the page links each thumbnail to the original file.
//
// Usage:
//   node scripts/qa/build-reference-catalogue.mjs [--catalog <dir>] [--out <file>]
//     [--captures <dir>] [--thumb-width 360] [--force]

import { readdirSync, statSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, extname, basename, dirname } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const val = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i === -1 ? dflt : args[i + 1];
};
const CATALOG = val('--catalog', 'C:/Users/david/Desktop/stuff/atomic-acres-catalog');
const OUT = val('--out', join(CATALOG, 'catalogue.html'));
const CAPTURES = val('--captures', 'artifacts/viewpoint-regression/final-pm3/atomic-acres-rebuild');
const THUMB_W = Number(val('--thumb-width', '360'));
const FORCE = args.includes('--force');
const THUMBS = join(CATALOG, '.thumbs');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// The corpus, grouped the way the loop actually uses it. `role` is what the set is
// FOR, which is the part that stops a reference being mistaken for an output.
const SETS = [
  {
    id: 'judge', dir: '_judge/refs', title: 'The frozen bar',
    role: 'reference', blurb: 'The 18 plates every station is graded against. This is the bar; nothing here is negotiable without the owner.',
  },
  {
    id: 'graybox', dir: 'batch-4-nuketown-graybox', title: 'Layout authority',
    role: 'reference', blurb: 'The greybox/blueprint set the map layout was actually built from. Owner-confirmed as the governing layout reference.',
  },
  {
    id: 'plates', dir: 'batch-3', title: 'Photoreal plates', recurse: false,
    role: 'reference', blurb: 'Full-size photoreal renders. Same shots as the frozen bar plus probes.',
  },
  {
    id: 'variants', dir: 'batch-3/variants', title: 'Time-of-day variants',
    role: 'reference', blurb: 'dawn-mist / golden-dusk / night-rain / overcast per plate. This is the lighting and PBR target, and it is what the dynamic time-of-day goal has to hit.',
  },
  {
    id: 'layout2', dir: 'batch-2-layout', title: 'Layout pass 2',
    role: 'reference', blurb: 'Earlier layout studies.',
  },
  {
    id: 'weapons', dir: 'batch-1b', title: 'Weapons + POV',
    role: 'reference', blurb: 'Weapon side profiles and first-person POV framing.',
  },
  {
    id: 'weapons1', dir: 'batch-1', title: 'Weapons (first pass)',
    role: 'reference', blurb: 'Superseded by batch-1b; kept for provenance.',
  },
  {
    id: 'video', dir: 'videos', title: 'Video reference frames',
    role: 'reference', blurb: 'Frames pulled from X/Twitter posts carrying promising techniques. Motion, effects and camera-move material rather than static composition.',
  },
  {
    id: 'assets', dir: 'assets-batch1', title: 'Our output — NOT reference',
    role: 'output', blurb: 'Baked PBR maps and Blender turnarounds we produced. Included so it is never again mistaken for something to match TO. Every file here is dated 2026-09-14 - one day of output, then nothing.',
  },
];

// Reference -> capture station. Only the frozen bar is authoritatively paired; the
// rest is honestly reported as unpaired rather than guessed at.
const PAIRING = {
  'layout-topdown.png': 'atomic-acres-rebuild-topdown',
  'layout-angle.png': 'atomic-acres-rebuild-overview',
  'road-entrance.png': 'atomic-acres-rebuild-street-south',
  'teal-backyard.png': 'atomic-acres-rebuild-yard-geometry',
  'living-room-eye.png': 'atomic-acres-rebuild-interior-west',
  'hero-vehicles.png': 'atomic-acres-rebuild-bus-closeup',
  'street-teal.png': 'atomic-acres-rebuild-street-north',
  'street-yellow.png': 'atomic-acres-rebuild-street-south',
  'bedroom-eye.png': 'atomic-acres-rebuild-upper-landing',
  'teal-side-lane.png': 'atomic-acres-rebuild-side-lane-west',
  'yellow-side-lane.png': 'atomic-acres-rebuild-side-lane-east',
  'yellow-backyard.png': 'atomic-acres-rebuild-backyard-east',
  'road-far-end.png': 'atomic-acres-rebuild-road-far-end',
  'balcony-backyard.png': 'atomic-acres-rebuild-balcony-backyard',
  // Not in _judge/refs - this one lives in batch-2-layout, and it is the most
  // complete single statement of the map's intended composition in the corpus.
  'map__center-loop.png': 'atomic-acres-rebuild-center-loop',
};

function walk(dir, recurse = true, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) { if (recurse) walk(p, true, out); }
    else if (IMAGE_EXT.has(extname(entry.name).toLowerCase())) out.push(p);
  }
  return out;
}

async function thumb(src) {
  const rel = relative(CATALOG, src).split('\\').join('/');
  const dest = join(THUMBS, `${rel.replace(/[\\/]/g, '__')}.webp`);
  if (!FORCE && existsSync(dest)) return dest;
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(src).resize({ width: THUMB_W, withoutEnlargement: true }).webp({ quality: 72 }).toFile(dest);
  return dest;
}

// Captures live in the game repo, not under CATALOG, so they get their own
// namespace in the thumb store rather than a relative path that would escape it.
async function captureThumb(src) {
  const dest = join(THUMBS, `capture__${basename(src)}.webp`);
  if (!FORCE && existsSync(dest)) return dest;
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(src).resize({ width: THUMB_W, withoutEnlargement: true }).webp({ quality: 72 }).toFile(dest);
  return dest;
}

/**
 * The in-engine counterpart for a paired reference, if one has been captured.
 * A station with no capture renders as an explicit "not captured" panel rather
 * than as an empty slot - the same honesty rule compare-refs-vs-render.mjs
 * follows, for the same reason: a missing render is a finding, and a blank is
 * indistinguishable from one that simply looks like nothing.
 */
function captureFor(station) {
  if (!station || !CAPTURES) return null;
  const file = join(CAPTURES, `${station}.png`);
  return existsSync(file) ? file : null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

console.log(`catalogue: ${CATALOG}`);
mkdirSync(THUMBS, { recursive: true });

const sections = [];
let totalRefs = 0, totalOutput = 0, paired = 0, unpaired = 0, withCapture = 0;

for (const set of SETS) {
  const dir = join(CATALOG, set.dir);
  const files = walk(dir, set.recurse !== false).sort();
  if (files.length === 0) continue;
  const items = [];
  for (const f of files) {
    let t = null;
    try { t = await thumb(f); } catch { /* unreadable image: reported, not skipped silently */ }
    const name = basename(f);
    const station = set.role === 'reference' ? (PAIRING[name] ?? null) : null;
    if (set.role === 'reference') { totalRefs += 1; if (station) paired += 1; else unpaired += 1; }
    else totalOutput += 1;
    const { size } = statSync(f);
    let dims = '';
    try { const m = await sharp(f).metadata(); dims = `${m.width}x${m.height}`; } catch { dims = '?'; }
    const capFile = captureFor(station);
    let capThumb = null;
    if (capFile) {
      try { capThumb = await captureThumb(capFile); } catch { capThumb = null; }
    }
    items.push({
      href: relative(dirname(OUT), f).split('\\').join('/'),
      thumb: t ? relative(dirname(OUT), t).split('\\').join('/') : null,
      capHref: capFile ? relative(dirname(OUT), capFile).split('\\').join('/') : null,
      capThumb: capThumb ? relative(dirname(OUT), capThumb).split('\\').join('/') : null,
      name, station, dims, kb: Math.round(size / 1024),
      sub: relative(dir, dirname(f)).split('\\').join('/'),
    });
    if (capFile) withCapture += 1;
  }
  sections.push({ ...set, items });
  console.log(`  ${set.id.padEnd(10)} ${String(files.length).padStart(4)} images`);
}

const cards = sections.map((s) => {
  const figs = s.items.map((it) => {
    const tag = it.station
      ? `<em class="ok" title="graded against this capture station">${esc(it.station.replace('atomic-acres-rebuild-', ''))}</em>`
      : s.role === 'output' ? '<em class="out">output</em>' : '<em class="no">no station</em>';
    const img = it.thumb
      ? `<img src="${esc(it.thumb)}" loading="lazy" alt="${esc(it.name)}">`
      : '<div class="broken">unreadable</div>';
    // Paired references show the in-engine frame beside the plate, so the page
    // IS the comparison rather than an index pointing at one.
    const pair = it.station
      ? (it.capThumb
        ? `<a href="${esc(it.capHref)}" target="_blank" class="cap"><img src="${esc(it.capThumb)}" loading="lazy" alt="in-engine"><b>IN-ENGINE</b></a>`
        : '<div class="cap nocap">station authored, not captured in this set</div>')
      : '';
    const cls = it.station ? 'pairwrap' : '';
    return `<figure class="${cls}"><div class="shots"><a href="${esc(it.href)}" target="_blank" class="ref"><img src="${esc(it.thumb ? it.thumb : '')}" loading="lazy" alt="${esc(it.name)}">${it.station ? '<b>REFERENCE</b>' : ''}</a>${pair}</div>`
      + `<figcaption>${esc(it.name)}<span>${it.dims} · ${it.kb} KB${it.sub && it.sub !== '.' ? ` · ${esc(it.sub)}` : ''}</span>${tag}</figcaption></figure>`;
  }).join('');
  return `<section id="${s.id}" class="${s.role}">
<h2>${esc(s.title)} <small>${s.items.length}</small></h2>
<p class="blurb">${esc(s.blurb)}</p>
<div class="grid">${figs}</div></section>`;
}).join('\n');

const nav = sections.map((s) => `<a href="#${s.id}">${esc(s.title)} <b>${s.items.length}</b></a>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atomic Acres — reference catalogue</title>
<style>
:root{--bg:#0b0e14;--card:#121724;--line:#232c44;--ink:#dbe2f1;--mute:#8b93a7;--warn:#ffb454;--ok:#7ddc9a;--bad:#ff7a7a}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,sans-serif;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:var(--mute);font-size:12px;margin-bottom:16px;max-width:90ch}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 12px;min-width:120px}
.stat b{display:block;font-size:19px}.stat span{font-size:11px;color:var(--mute)}
.stat.alert b{color:var(--warn)}
nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px;position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:5;border-bottom:1px solid var(--line)}
nav a{color:var(--ink);text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 11px;font-size:12px}
nav a:hover{border-color:var(--warn)}nav a b{color:var(--mute);font-weight:400}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px;scroll-margin-top:60px}
section.output{border-color:#4a3520;background:#171208}
h2{font-size:15px;margin:0 0 4px}h2 small{color:var(--mute);font-weight:400;font-size:12px}
.blurb{color:var(--mute);font-size:12px;margin:0 0 12px;max-width:100ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
figure.pairwrap{grid-column:span 2}
.shots{display:grid;grid-template-columns:1fr;gap:0}
figure.pairwrap .shots{grid-template-columns:1fr 1fr;gap:2px}
.shots a{position:relative;display:block}
.shots a b{position:absolute;left:4px;bottom:4px;font-size:8px;letter-spacing:.06em;background:rgba(0,0,0,.72);color:#dbe2f1;padding:1px 5px;border-radius:3px;font-weight:600}
.shots a.cap b{color:#7ddc9a}
.cap.nocap{display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;color:#ff7a7a;background:#2e1616;padding:8px;aspect-ratio:16/10}
figure{margin:0;background:#0d111b;border:1px solid var(--line);border-radius:8px;overflow:hidden}
figure img{width:100%;display:block;aspect-ratio:16/10;object-fit:cover;background:#000}
.broken{padding:30px 8px;text-align:center;color:var(--bad);font-size:11px}
figcaption{font-size:10px;color:var(--ink);padding:6px;word-break:break-all}
figcaption span{display:block;color:var(--mute);margin-top:2px}
figcaption em{display:inline-block;font-style:normal;margin-top:4px;font-size:9px;padding:1px 6px;border-radius:999px}
em.ok{background:#12301f;color:var(--ok)}em.no{background:#2e1616;color:var(--bad)}em.out{background:#33260f;color:var(--warn)}
a{color:var(--warn)}
</style></head><body>
<h1>Atomic Acres — reference catalogue</h1>
<p class="sub">Every reference image in the corpus, grouped by what it is FOR, each tagged with the capture station it is graded against. Click a thumbnail for the original. Regenerate with <code>npm run qa:catalogue</code>. The pairing tags are the point: an unpaired reference is one the build is not being measured against, and that count is what decides the next lane.</p>
<div class="stats">
<div class="stat"><b>${totalRefs}</b><span>reference images</span></div>
<div class="stat"><b>${paired}</b><span>paired to a station</span></div>
<div class="stat alert"><b>${unpaired}</b><span>NO station — ungraded</span></div>
<div class="stat"><b>${totalOutput}</b><span>our output (not reference)</span></div>
<div class="stat"><b>${(100 * paired / Math.max(1, totalRefs)).toFixed(1)}%</b><span>corpus coverage</span></div>
<div class="stat"><b>${withCapture}</b><span>shown beside a live capture</span></div>
</div>
<nav>${nav}</nav>
${cards}
<p class="sub">Generated ${new Date().toISOString()} · thumbnails ${THUMB_W}px WebP in <code>.thumbs/</code></p>
</body></html>`;

writeFileSync(OUT, html, 'utf8');
console.log(`\nwrote ${OUT}`);
console.log(`references ${totalRefs} | paired ${paired} | UNPAIRED ${unpaired} | output ${totalOutput}`);
console.log(`corpus coverage: ${(100 * paired / Math.max(1, totalRefs)).toFixed(1)}%`);
