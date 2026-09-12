#!/usr/bin/env node
/**
 * scripts/forge/gen-references.mjs
 *
 * ART FORGE (HF-536) - REFERENCE stage.
 *
 * Produces one generated concept-target board per review station: our own fixed
 * review-camera capture repainted at the target look, same camera and layout, so
 * critics and workers hill-climb toward a per-station picture instead of a vibe.
 *
 * Owner authorisation: 2026-09-06 15:25 BST ("the trick is image gen"), recorded in
 * aa-day-2026-09-06/OWNER-INPUTS-2026-09-06.md. The look definition comes from
 * ART-FORGE-RULESET.md section 0 (thesis) and section 4 F (colour/value for combat).
 * Manifest shape comes from ART-FORGE-RULESET.md section 3, "References as the target".
 *
 * IMPORTANT provenance rule (ruleset R35): a generated image is a BAR (allowedUse
 * "bar"). It is never evidence that anything was implemented, and it is never a
 * texture or mesh source.
 *
 * Route: OpenRouter chat/completions with modalities ["image","text"].
 * Secret: read at run time by spawning Get-Secret.ps1. Never printed, logged or written.
 *
 * Usage:
 *   node scripts/forge/gen-references.mjs --dry-run
 *   node scripts/forge/gen-references.mjs --stations overhead,street-centre
 *   node scripts/forge/gen-references.mjs --max-images 29
 *   node scripts/forge/gen-references.mjs --sheets-only
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Hard limits. These are budget fences, not tuning knobs (AGENTS.md: never
// weaken a fence to get a result).
// ---------------------------------------------------------------------------
export const HARD_MAX_CALLS = 35;
export const HARD_MAX_COST_USD = 4.0;

export const DEFAULT_MODEL = 'google/gemini-3.1-flash-image';
export const FALLBACK_MODEL = 'google/gemini-3-pro-image';
export const PROVIDER = 'openrouter';
export const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const LICENCE = 'owner-authorised AI concept 2026-09-06';
export const ALLOWED_USE = 'bar';

export const OUT_W = 1280;
export const OUT_H = 720;
export const SEND_W = 1024;
export const CELL_W = 640;
export const CELL_H = 360;
export const ROWS_PER_SHEET = 8;

const SECRET_SCRIPT = 'C:/Users/david/.secrets/Get-Secret.ps1';
const SECRET_NAME = 'openrouter_key';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

export const DEFAULTS = {
  captures: 'C:/Users/david/Desktop/stuff/aa-day-2026-09-06/root-captures/final-3/nuketown2',
  style:
    'C:/Users/david/Documents/Codex/2026-09-05/read-only-and-plan-launch-nothing/outputs/Nuke-Town-Visual-Target.png',
  out: path.join(REPO_ROOT, 'docs', 'forge', 'references'),
  arena: 'nuketown2',
};

// ---------------------------------------------------------------------------
// The look definition (ruleset sec. 0 thesis + sec. 4 F value plan).
// ---------------------------------------------------------------------------
export const LOOK_LINES = [
  'Low poly, HIGH QUALITY: few triangles, but every silhouette breaks at three scales - a primary mass, three to seven mid-scale bumps, and a jagged edge.',
  'Mountains: jagged two-tone rock, a broken ridgeline with a second ridged octave, warm sunlit faces against cool shadowed faces, layered depth from foothills to far ridge. Never one smooth flat band.',
  'Conifers: tall varied spires with leader tips, uneven heights (a standout roughly one in thirteen), slight lean, warm sun flank and cool shade flank. Never identical cones.',
  'Hedges and shrubs: clipped but organic - scalloped tops, soft broken edges, darker cores. Never boxes.',
  'Wear at three scales on every surface: 0.5-1.5 mm grain, 20-80 mm scuffs and chips, 0.5-3 m traffic polish and staining. Wear obeys gravity: tide marks at foot level, scuffs at 0.9-1.2 m on walls, moss and soil in the shaded north side, sun bleach on the sun side.',
  'Road: damp asphalt with a specular sun streak along the wheel paths, mid-value, chipped kerbs, faded markings. Not a flat grey slab.',
  'Street lamps: lit lantern heads with a glass housing, a warm emissive core and a small pool of light on the ground. Not plain boxes.',
  'Vehicles: wheels sit INSIDE their arches on the body, with a dark underbody block between the axles and a soft contact shadow on the road under each tyre. No floating or detached wheels.',
  'Lighting: golden-hour physical lighting, warm low key light with a cool sky fill, soft long shadows, and a sky that HOLDS COLOUR and is NOT blown to white (sky mid-tone roughly 150-215 of 255, graduated, with visible cloud value).',
  'Contact shadows and ambient occlusion under every grounded object - vehicles, planters, bins, tree trunks, kerbs, fence posts.',
  'Combat readability: mid-value ground (road mid-tone roughly 28-60 of 255), sunlit walls 150-210, shade walls 60-110, shadow floor at least 10; high-contrast silhouettes so a player-sized figure would read against every surface.',
  'Overall register: stylised-realistic, like Firewatch or Superliminal or a modern indie title. NOT photoreal, NOT voxel, NOT Roblox-like, NOT cartoon, no outlines, no cel shading, no illustration filter.',
];

// ---------------------------------------------------------------------------
// Station-specific weakness notes. Keys are pooled so each station gets 3-5 of
// them, chosen for what that frame actually shows.
// ---------------------------------------------------------------------------
export const NOTE_POOL = {
  WHEELS:
    'The vehicle wheels in image 1 are detached and floating clear of the body (a real defect in our build). In your version every wheel must sit inside its own arch on the body, at the correct axle position, over a dark underbody block, with a soft contact shadow where the tyre meets the road. Do not move the vehicle itself.',
  SKY: 'The sky in image 1 is blown to a flat near-white void. Give it a graded golden-hour sky that holds colour and value - warm near the sun, cooler overhead, visible cloud structure, sun bloom contained rather than clipping the whole upper frame.',
  RIDGE:
    'The mountain backdrop in image 1 is one smooth flat band of a single value. Give it a jagged broken ridgeline, two-tone rock (warm sun side, cool shade side), and layered depth between foothill, ridge and far range - still low-poly faceted rock, not a photograph.',
  LAMPS:
    'The street lamp heads in image 1 are plain rectangular boxes. Render them as lit lantern heads: a shaped housing, glass, a warm emissive core, and a small pool of warm light on the ground below.',
  ASPHALT:
    'The road in image 1 is one flat value. Make it damp asphalt with a specular sun streak along the wheel paths, aggregate grain, patching, faded markings and a chipped kerb line - while keeping the road exactly where it is.',
  CONIFERS:
    'The conifers in image 1 are identical smooth cones. Make them varied tall spires with leader tips, uneven heights, slight lean, and a warm sun flank against a cool shade flank - same positions, same count.',
  HEDGE:
    'The hedges and shrubs in image 1 are box lobes. Make them clipped-but-organic: scalloped tops, broken silhouette edges, darker interior, with soil and leaf litter at the base.',
  CONTACT:
    'Objects in image 1 read as floating because nothing is grounded. Add contact darkening and soft occlusion where every object meets the ground - vehicles, planters, bins, posts, trunks and kerbs.',
  SIDING:
    'The house siding and trim in image 1 carry one value per surface. Add three scales of wear: fine grain, 20-80 mm chips and scuffs concentrated at 0.9-1.2 m, and metre-scale weathering and sun bleach on the sun side with damp staining low down.',
  ROOF: 'The roof surfaces in image 1 are flat and uniform. Give them shingle or panel articulation, ridge and edge highlights, moss and dirt streaks running downslope, and a readable eave shadow.',
  LAWN: 'The grass and ground cover in image 1 is a uniform green sheet. Break it into value clusters - worn traffic lines, drier straw patches away from the buildings, damper darker grass in shade - without changing the ground shape.',
  INTERIOR:
    'The interior surfaces in image 1 are flat untextured planes with no bounced light. Add warm bounced light from the window openings, soft occlusion in the corners and under furniture, floor and wall wear, and dust in the light shafts, while keeping every wall, opening and prop exactly where it is.',
  CONCRETE:
    'The concrete apron, path and wall surfaces in image 1 are uniform grey. Add pour lines, edge chips, hairline cracking, damp patches and dirt collecting at the base - the kerbs read "poured and kept", the yards read worn.',
  DEPTH:
    'The mid-ground in image 1 flattens out. Keep atmospheric depth: mid-ground objects at 20-40 m must keep most of their contrast, with haze that separates the distance rather than washing everything to one value.',
};

export const DEFAULT_NOTE_KEYS = ['CONTACT', 'SIDING', 'DEPTH', 'ASPHALT'];

export const STATION_NOTES = {
  // Vehicles - the wheels defect is visible in these frames.
  'coach-elevation': ['WHEELS', 'CONTACT', 'ASPHALT', 'SKY', 'DEPTH'],
  'truck-cab-near': ['WHEELS', 'CONTACT', 'ASPHALT', 'SIDING'],
  'vehicle-near': ['WHEELS', 'CONTACT', 'ASPHALT', 'HEDGE'],
  'vehicle-mid': ['WHEELS', 'CONTACT', 'ASPHALT', 'LAMPS', 'DEPTH'],
  'vehicle-far': ['WHEELS', 'ASPHALT', 'RIDGE', 'CONIFERS', 'DEPTH'],
  // Street and sky.
  'into-sun-street': ['SKY', 'ASPHALT', 'LAMPS', 'DEPTH', 'CONTACT'],
  'nuke-street': ['SKY', 'LAMPS', 'ASPHALT', 'DEPTH', 'HEDGE'],
  'street-centre': ['LAMPS', 'ASPHALT', 'HEDGE', 'CONTACT', 'SKY'],
  // Backdrop and roofs.
  overhead: ['RIDGE', 'ROOF', 'LAWN', 'ASPHALT', 'CONIFERS'],
  'north-upper-window': ['RIDGE', 'CONIFERS', 'ROOF', 'DEPTH'],
  'south-upper-window': ['RIDGE', 'CONIFERS', 'ROOF', 'DEPTH'],
  'north-balcony': ['RIDGE', 'CONIFERS', 'SIDING', 'DEPTH'],
  'nuke-north-balcony': ['RIDGE', 'CONIFERS', 'SIDING', 'SKY'],
  'nuke-south-balcony': ['RIDGE', 'CONIFERS', 'SIDING', 'SKY'],
  // Interiors.
  'north-interior': ['INTERIOR', 'SIDING', 'CONTACT'],
  'south-interior': ['INTERIOR', 'SIDING', 'CONTACT'],
  garage: ['INTERIOR', 'CONCRETE', 'CONTACT', 'SIDING'],
  'front-porch': ['SIDING', 'CONCRETE', 'CONTACT', 'ROOF'],
  // Yards, gardens, props.
  'north-yard': ['LAWN', 'HEDGE', 'CONTACT', 'SIDING'],
  'south-yard': ['LAWN', 'HEDGE', 'CONTACT', 'SIDING'],
  'garden-pod-north-close': ['LAWN', 'HEDGE', 'CONTACT', 'CONCRETE'],
  'glasshouse-north-close': ['CONTACT', 'CONCRETE', 'LAWN', 'SIDING'],
  'sand-pit-north-close': ['CONTACT', 'CONCRETE', 'LAWN', 'HEDGE'],
  'appliance-bank-north-close': ['CONTACT', 'SIDING', 'CONCRETE', 'LAWN'],
  'appliance-bank-south-close': ['CONTACT', 'SIDING', 'CONCRETE', 'LAWN'],
  'driveway-apron-close': ['CONCRETE', 'ASPHALT', 'CONTACT', 'LAWN'],
  'border-path-close': ['CONCRETE', 'LAWN', 'HEDGE', 'CONTACT'],
  'perimeter-wall-end-close': ['CONCRETE', 'CONTACT', 'LAWN', 'DEPTH'],
  'perimeter-wall-long-close': ['CONCRETE', 'CONTACT', 'LAWN', 'CONIFERS'],
};

export function noteKeysFor(station) {
  const keys = STATION_NOTES[station] ?? DEFAULT_NOTE_KEYS;
  if (keys.length < 3 || keys.length > 5) {
    throw new Error(`station "${station}" has ${keys.length} notes; the contract is 3 to 5`);
  }
  for (const k of keys) {
    if (!NOTE_POOL[k]) throw new Error(`station "${station}" references unknown note key "${k}"`);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Prompt builder. Deterministic: same station always yields the same bytes, so
// promptSha256 in the manifest is a stable identity for the bar.
// ---------------------------------------------------------------------------
export function buildPrompt(station) {
  const keys = noteKeysFor(station);
  const notes = keys.map((k, i) => `${i + 1}. ${NOTE_POOL[k]}`);
  return [
    `Image 1 is a fixed review-camera frame from our game (review station "${station}" of the Nuke Town test-town arena). Image 2 is the style target.`,
    '',
    'Produce image 1 again with identical camera, framing, layout, object positions and proportions, but rendered at the visual quality and style of image 2.',
    '',
    'TARGET LOOK',
    ...LOOK_LINES.map((l) => `- ${l}`),
    '',
    'KEEP EXACTLY AS FRAMED',
    '- The 1950s suburban test-town layout must stay exactly as it is: the two houses, the coach and truck in the middle street, the mountains and conifers around the edge, the fences, kerbs, paths and props all in their current positions and at their current sizes.',
    '- Do not add, move or remove buildings, vehicles, roads or trees.',
    '- Do not change the aspect ratio (16:9 wide landscape). Do not crop, zoom, rotate or re-frame.',
    '- Keep the same camera position and lens, the same horizon line, and the same silhouette position of every object in the frame.',
    '- Do not add people, animals, text, captions, logos, watermarks, UI, borders, vignette frames, split screens or before/after comparisons. One single full-bleed image only.',
    '',
    'FIX IN THIS FRAME (known weaknesses of image 1)',
    ...notes,
    '',
    'Output one image only.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------
export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function stationFromFile(fileName, arena) {
  const m = new RegExp(`^${arena}-(.+)\\.png$`).exec(fileName);
  if (!m) return null;
  if (m[1].endsWith('.s1')) return null; // second sample, ignored by contract
  return m[1];
}

export function parseArgs(argv) {
  const out = {
    dryRun: false,
    sheetsOnly: false,
    skipExisting: false,
    stations: null,
    maxImages: HARD_MAX_CALLS,
    maxCostUsd: HARD_MAX_COST_USD,
    model: DEFAULT_MODEL,
    captures: DEFAULTS.captures,
    style: DEFAULTS.style,
    out: DEFAULTS.out,
    arena: DEFAULTS.arena,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    switch (a) {
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--sheets-only':
        out.sheetsOnly = true;
        break;
      case '--skip-existing':
        // Resume: a station that already has a saved target and an ok manifest
        // entry is not re-billed. Long runs are chunked, never restarted.
        out.skipExisting = true;
        break;
      case '--stations':
        out.stations = next()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case '--max-images': {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 1) throw new Error('--max-images must be a positive integer');
        // The hard cap may be lowered, never raised.
        out.maxImages = Math.min(n, HARD_MAX_CALLS);
        break;
      }
      case '--max-cost': {
        const n = Number(next());
        if (!Number.isFinite(n) || n <= 0) throw new Error('--max-cost must be a positive number');
        out.maxCostUsd = Math.min(n, HARD_MAX_COST_USD);
        break;
      }
      case '--model':
        out.model = next();
        break;
      case '--captures':
        out.captures = next();
        break;
      case '--style':
        out.style = next();
        break;
      case '--out':
        out.out = next();
        break;
      case '--arena':
        out.arena = next();
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  return out;
}

export function buildManifest({ arena, model, fallbackModel, stylePath, styleSha256, entries, runStartedAt, runFinishedAt, spendUSD, callsMade, runs }) {
  return {
    schema: 'atomic-acres/forge-references/1',
    generatedBy: 'scripts/forge/gen-references.mjs',
    authorisation:
      'Owner (Dave) authorised image generation for artwork/style/assets/textures on 2026-09-06 15:25 BST; see aa-day-2026-09-06/OWNER-INPUTS-2026-09-06.md',
    provenanceRule:
      'ART-FORGE-RULESET.md R35: a generated image is a critic BAR only. It is never evidence of implementation and is never a texture or mesh source.',
    arena,
    provider: PROVIDER,
    endpoint: ENDPOINT,
    model,
    fallbackModel,
    runStartedAt: runStartedAt ?? null,
    runFinishedAt: runFinishedAt ?? null,
    callsMade: callsMade ?? entries.length,
    spendUSD: spendUSD ?? null,
    runs: runs ?? [],
    sources: [
      {
        role: 'style-target',
        path: stylePath,
        sha256: styleSha256,
        licence: LICENCE,
        source: 'Codex 2026-09-05 outputs/Nuke-Town-Visual-Target.png (owner-authorised AI concept)',
        allowedUse: ALLOWED_USE,
      },
    ],
    entries: [...entries].sort((a, b) => a.station.localeCompare(b.station)),
  };
}

export async function writeManifest(outDir, manifest) {
  await mkdir(outDir, { recursive: true });
  const p = path.join(outDir, 'manifest.json');
  await writeFile(p, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return p;
}

// ---------------------------------------------------------------------------
// Secret. Spawned, trimmed, never printed.
// ---------------------------------------------------------------------------
export function readApiKey() {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', ['-NoProfile', '-File', SECRET_SCRIPT, SECRET_NAME], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    ps.stdout.on('data', (d) => {
      out += d;
    });
    ps.stderr.on('data', (d) => {
      err += d;
    });
    ps.on('error', reject);
    ps.on('close', (code) => {
      const key = out.trim();
      if (code !== 0 || !key) {
        reject(new Error(`Get-Secret.ps1 exited ${code}; stderr length ${err.trim().length}`));
        return;
      }
      resolve(key);
    });
  });
}

// ---------------------------------------------------------------------------
// Image IO.
// ---------------------------------------------------------------------------
async function toSendBase64(filePath) {
  const buf = await sharp(filePath).resize({ width: SEND_W, withoutEnlargement: true }).png().toBuffer();
  return buf.toString('base64');
}

export function extractImageDataUrl(body) {
  const images = body?.choices?.[0]?.message?.images;
  if (!Array.isArray(images)) return null;
  for (const im of images) {
    const url = im?.image_url?.url ?? im?.url;
    if (typeof url === 'string' && url.startsWith('data:image/')) return url;
  }
  return null;
}

export function decodeDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('malformed data url');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

async function saveTarget(buf, outPath) {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const ar = h > 0 ? w / h : 0;
  const target = OUT_W / OUT_H;
  const aspectMismatch = Math.abs(ar - target) > 0.02;
  const pipe = sharp(buf).resize(
    OUT_W,
    OUT_H,
    aspectMismatch
      ? { fit: 'contain', background: { r: 18, g: 18, b: 20, alpha: 1 } }
      : { fit: 'fill' },
  );
  await pipe.png().toFile(outPath);
  return { sourceWidth: w, sourceHeight: h, aspectMismatch };
}

// ---------------------------------------------------------------------------
// One API call, with retry-once on transport errors.
// ---------------------------------------------------------------------------
async function postOnce({ apiKey, model, prompt, baseB64, styleB64, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dave-gaming-pc.local/atomic-acres',
        'X-Title': 'Atomic Acres art forge references',
      },
      body: JSON.stringify({
        model,
        modalities: ['image', 'text'],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${baseB64}` } },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${styleB64}` } },
            ],
          },
        ],
        usage: { include: true },
      }),
      signal: controller.signal,
    });
    const dateHeader = res.headers.get('date');
    const text = await res.text();
    return { status: res.status, dateHeader, text };
  } finally {
    clearTimeout(timer);
  }
}

async function callModel(opts) {
  let last;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const r = await postOnce(opts);
      if (r.status >= 500 || r.status === 429) {
        last = new Error(`http ${r.status}: ${r.text.slice(0, 300)}`);
        if (attempt === 0) {
          await new Promise((res) => setTimeout(res, 4000));
          continue;
        }
        throw last;
      }
      return r;
    } catch (e) {
      last = e;
      if (attempt === 0) {
        await new Promise((res) => setTimeout(res, 4000));
        continue;
      }
      throw last;
    }
  }
  throw last;
}

// ---------------------------------------------------------------------------
// Contact sheets.
// ---------------------------------------------------------------------------
function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

export function sheetLayout(rowCount) {
  const pad = 8;
  const labelW = 300;
  const headerH = 60;
  const width = pad + labelW + pad + CELL_W + pad + CELL_W + pad;
  const height = headerH + rowCount * (CELL_H + pad) + pad;
  return { pad, labelW, headerH, width, height, cellW: CELL_W, cellH: CELL_H };
}

async function buildContactSheet({ rows, sheetIndex, sheetCount, arena, outPath, capturesDir }) {
  const L = sheetLayout(rows.length);
  const labels = rows
    .map((r, i) => {
      const y = L.headerH + i * (L.cellH + L.pad);
      const status = r.ok ? 'generated' : 'NO IMAGE';
      const colour = r.ok ? '#9fe8b5' : '#ff9a8a';
      return [
        `<text x="${L.pad + 12}" y="${y + 40}" font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="21" font-weight="600" fill="#f2f2f4">${xmlEscape(r.station)}</text>`,
        `<text x="${L.pad + 12}" y="${y + 70}" font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="15" fill="${colour}">${xmlEscape(status)}</text>`,
        r.note
          ? `<text x="${L.pad + 12}" y="${y + 96}" font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="13" fill="#b9b9c2">${xmlEscape(r.note)}</text>`
          : '',
        `<text x="${L.pad + 12}" y="${y + L.cellH - 8}" font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="12" fill="#7d7d88">ours (left) vs target (right)</text>`,
      ].join('');
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}">
    <rect width="${L.width}" height="${L.height}" fill="#141418"/>
    <text x="${L.pad + 12}" y="34" font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="22" font-weight="700" fill="#ffffff">ART FORGE reference boards - ${xmlEscape(arena)} - sheet ${sheetIndex} of ${sheetCount}</text>
    <text x="${L.pad + 12}" y="54" font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="14" fill="#a9a9b4">left = our current capture (final-3) | right = generated concept target (bar only, never evidence)</text>
    ${labels}
  </svg>`;

  const composites = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const y = L.headerH + i * (L.cellH + L.pad);
    const xBase = L.pad + L.labelW + L.pad;
    const xGen = xBase + L.cellW + L.pad;
    const basePath = path.join(capturesDir, `${arena}-${r.station}.png`);
    if (existsSync(basePath)) {
      composites.push({
        input: await sharp(basePath).resize(L.cellW, L.cellH, { fit: 'fill' }).png().toBuffer(),
        left: xBase,
        top: y,
      });
    }
    if (r.ok && existsSync(r.path)) {
      composites.push({
        input: await sharp(r.path).resize(L.cellW, L.cellH, { fit: 'fill' }).png().toBuffer(),
        left: xGen,
        top: y,
      });
    } else {
      const ph = `<svg xmlns="http://www.w3.org/2000/svg" width="${L.cellW}" height="${L.cellH}"><rect width="${L.cellW}" height="${L.cellH}" fill="#241a1a"/><text x="${L.cellW / 2}" y="${L.cellH / 2}" text-anchor="middle" font-family="Segoe UI, DejaVu Sans, sans-serif" font-size="24" fill="#ff9a8a">NO IMAGE RETURNED</text></svg>`;
      composites.push({ input: Buffer.from(ph), left: xGen, top: y });
    }
  }

  await sharp(Buffer.from(svg)).png().toBuffer().then((base) =>
    sharp(base).composite(composites).png().toFile(outPath),
  );
  return outPath;
}

export async function buildContactSheets({ arena, rows, outDir, capturesDir }) {
  const sheets = [];
  const chunks = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_SHEET) chunks.push(rows.slice(i, i + ROWS_PER_SHEET));
  for (let i = 0; i < chunks.length; i += 1) {
    const outPath = path.join(outDir, `CONTACT-SHEET-${i + 1}.png`);
    await buildContactSheet({
      rows: chunks[i],
      sheetIndex: i + 1,
      sheetCount: chunks.length,
      arena,
      outPath,
      capturesDir,
    });
    sheets.push(outPath);
  }
  return sheets;
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
async function discoverStations(capturesDir, arena) {
  const files = await readdir(capturesDir);
  return files
    .map((f) => stationFromFile(f, arena))
    .filter((s) => s !== null)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const arenaOutDir = path.join(args.out, args.arena);
  await mkdir(arenaOutDir, { recursive: true });

  const all = await discoverStations(args.captures, args.arena);
  const stations = args.stations ? args.stations.filter((s) => all.includes(s)) : all;
  if (args.stations) {
    const missing = args.stations.filter((s) => !all.includes(s));
    if (missing.length) console.error(`[warn] unknown stations ignored: ${missing.join(', ')}`);
  }
  const planned = stations.slice(0, args.maxImages);

  if (args.sheetsOnly) {
    const rows = planned.map((station) => {
      const p = path.join(arenaOutDir, `${station}.target.png`);
      return { station, path: p, ok: existsSync(p), note: '' };
    });
    const sheets = await buildContactSheets({
      arena: args.arena,
      rows,
      outDir: arenaOutDir,
      capturesDir: args.captures,
    });
    console.log(JSON.stringify({ mode: 'sheets-only', sheets }, null, 2));
    return;
  }

  if (args.dryRun) {
    const plan = {
      mode: 'dry-run',
      provider: PROVIDER,
      endpoint: ENDPOINT,
      model: args.model,
      fallbackModel: FALLBACK_MODEL,
      capturesDir: args.captures,
      stylePath: args.style,
      outDir: arenaOutDir,
      hardCaps: { calls: HARD_MAX_CALLS, costUSD: HARD_MAX_COST_USD },
      effectiveCaps: { calls: args.maxImages, costUSD: args.maxCostUsd },
      stationCount: planned.length,
      stations: planned.map((s) => ({
        station: s,
        outPath: path.join(arenaOutDir, `${s}.target.png`),
        noteKeys: noteKeysFor(s),
        promptSha256: sha256(buildPrompt(s)),
        promptChars: buildPrompt(s).length,
      })),
      samplePrompt: planned.length ? buildPrompt(planned[0]) : null,
    };
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  // Resume support: read whatever an earlier chunk of this same lane already
  // recorded, so a long run can be executed in bounded chunks without either
  // re-billing a station or losing its receipt.
  const manifestPath0 = path.join(args.out, 'manifest.json');
  let prior = null;
  if (existsSync(manifestPath0)) {
    try {
      prior = JSON.parse(await readFile(manifestPath0, 'utf8'));
    } catch {
      prior = null;
      console.error('[warn] existing manifest.json is unreadable; it will be replaced');
    }
  }
  const priorEntries = Array.isArray(prior?.entries) ? prior.entries : [];
  const priorRuns = Array.isArray(prior?.runs) ? prior.runs : [];
  const priorSpend = typeof prior?.spendUSD === 'number' ? prior.spendUSD : 0;
  const priorCalls = typeof prior?.callsMade === 'number' ? prior.callsMade : 0;
  const priorOk = new Set(
    priorEntries
      .filter((e) => e.ok && existsSync(path.join(REPO_ROOT, e.path)))
      .map((e) => e.station),
  );

  const attempt = args.skipExisting ? planned.filter((s) => !priorOk.has(s)) : planned;
  if (args.skipExisting && attempt.length !== planned.length) {
    console.error(`[resume] skipping ${planned.length - attempt.length} station(s) already generated`);
  }

  const runStartedAt = new Date().toISOString();
  const apiKey = await readApiKey();
  const styleBytes = await readFile(args.style);
  const styleSha = sha256(styleBytes);
  const styleB64 = await toSendBase64(args.style);

  let model = args.model;
  let noImageStreak = 0;
  let callsMade = 0;
  let spend = 0;
  const entries = [];
  const rows = [];

  for (const station of attempt) {
    if (callsMade >= args.maxImages) {
      console.error(`[cap] call cap ${args.maxImages} reached; stopping before "${station}"`);
      break;
    }
    if (spend >= args.maxCostUsd) {
      console.error(`[cap] cost cap ${args.maxCostUsd.toFixed(2)} USD reached (spent ${spend.toFixed(4)}); stopping before "${station}"`);
      break;
    }

    const basePath = path.join(args.captures, `${args.arena}-${station}.png`);
    const baseBytes = await readFile(basePath);
    const baseB64 = await toSendBase64(basePath);
    const prompt = buildPrompt(station);
    const outPath = path.join(arenaOutDir, `${station}.target.png`);

    const entry = {
      station,
      path: path.relative(REPO_ROOT, outPath).split(path.sep).join('/'),
      model,
      provider: PROVIDER,
      promptSha256: sha256(prompt),
      inputSha256: sha256(baseBytes),
      styleSha256: styleSha,
      usage: { promptTokens: null, completionTokens: null, cost: null },
      generatedAt: null,
      licence: LICENCE,
      allowedUse: ALLOWED_USE,
      ok: false,
      error: null,
    };

    let res;
    try {
      res = await callModel({
        apiKey,
        model,
        prompt,
        baseB64,
        styleB64,
        timeoutMs: 240000,
      });
    } catch (e) {
      callsMade += 1;
      entry.error = `transport: ${String(e && e.message ? e.message : e).slice(0, 300)}`;
      entries.push(entry);
      rows.push({ station, path: outPath, ok: false, note: 'transport error' });
      console.error(`[fail] ${station}: ${entry.error}`);
      continue;
    }

    callsMade += 1;
    let body;
    try {
      body = JSON.parse(res.text);
    } catch {
      entry.error = `unparseable response (http ${res.status})`;
      entries.push(entry);
      rows.push({ station, path: outPath, ok: false, note: 'bad response' });
      console.error(`[fail] ${station}: ${entry.error}`);
      continue;
    }

    const u = body?.usage ?? {};
    const cost = typeof u.cost === 'number' ? u.cost : null;
    entry.usage = {
      promptTokens: u.prompt_tokens ?? null,
      completionTokens: u.completion_tokens ?? null,
      cost,
    };
    if (cost !== null) spend += cost;
    entry.generatedAt = res.dateHeader ? new Date(res.dateHeader).toISOString() : null;

    if (res.status !== 200 || body?.error) {
      entry.error = `http ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`;
      entries.push(entry);
      rows.push({ station, path: outPath, ok: false, note: `http ${res.status}` });
      console.error(`[fail] ${station}: ${entry.error}`);
      continue;
    }

    const dataUrl = extractImageDataUrl(body);
    if (!dataUrl) {
      noImageStreak += 1;
      entry.error = 'no image in response';
      entries.push(entry);
      rows.push({ station, path: outPath, ok: false, note: 'no image returned' });
      console.error(`[fail] ${station}: no image (streak ${noImageStreak})`);
      if (noImageStreak >= 2 && model !== FALLBACK_MODEL) {
        model = FALLBACK_MODEL;
        noImageStreak = 0;
        console.error(`[route] switching to fallback model ${FALLBACK_MODEL}`);
      }
      continue;
    }
    noImageStreak = 0;

    try {
      const buf = decodeDataUrl(dataUrl);
      const saved = await saveTarget(buf, outPath);
      entry.ok = true;
      entry.sourceWidth = saved.sourceWidth;
      entry.sourceHeight = saved.sourceHeight;
      entry.aspectMismatch = saved.aspectMismatch;
      entry.outputSha256 = sha256(await readFile(outPath));
      rows.push({
        station,
        path: outPath,
        ok: true,
        note: saved.aspectMismatch ? `model returned ${saved.sourceWidth}x${saved.sourceHeight} (not 16:9)` : '',
      });
      console.error(
        `[ok]   ${station}  ${saved.sourceWidth}x${saved.sourceHeight}  cost ${cost === null ? '?' : cost.toFixed(4)}  total ${spend.toFixed(4)}`,
      );
    } catch (e) {
      entry.error = `decode/save: ${String(e && e.message ? e.message : e).slice(0, 300)}`;
      rows.push({ station, path: outPath, ok: false, note: 'decode failed' });
      console.error(`[fail] ${station}: ${entry.error}`);
    }
    entries.push(entry);
  }

  const runFinishedAt = new Date().toISOString();
  const attempted = new Set(entries.map((e) => e.station));
  const mergedEntries = [...priorEntries.filter((e) => !attempted.has(e.station)), ...entries];
  const manifest = buildManifest({
    arena: args.arena,
    model: args.model,
    fallbackModel: FALLBACK_MODEL,
    stylePath: args.style,
    styleSha256: styleSha,
    entries: mergedEntries,
    runStartedAt: prior?.runStartedAt ?? runStartedAt,
    runFinishedAt,
    spendUSD: Number((priorSpend + spend).toFixed(6)),
    callsMade: priorCalls + callsMade,
    runs: [
      ...priorRuns,
      {
        startedAt: runStartedAt,
        finishedAt: runFinishedAt,
        model: args.model,
        stations: attempt,
        callsMade,
        spendUSD: Number(spend.toFixed(6)),
      },
    ],
  });
  const manifestPath = await writeManifest(args.out, manifest);

  const sheetRows = planned.map((station) => {
    const found = rows.find((r) => r.station === station);
    if (found) return found;
    const p = path.join(arenaOutDir, `${station}.target.png`);
    if (existsSync(p)) return { station, path: p, ok: true, note: '' };
    return { station, path: p, ok: false, note: 'not attempted (cap)' };
  });
  const sheets = await buildContactSheets({
    arena: args.arena,
    rows: sheetRows,
    outDir: arenaOutDir,
    capturesDir: args.captures,
  });

  console.log(
    JSON.stringify(
      {
        mode: 'run',
        manifest: manifestPath,
        sheets,
        thisRun: {
          callsMade,
          generated: entries.filter((e) => e.ok).length,
          failed: entries.filter((e) => !e.ok).length,
          spendUSD: Number(spend.toFixed(6)),
        },
        cumulative: {
          callsMade: priorCalls + callsMade,
          generated: mergedEntries.filter((e) => e.ok).length,
          failed: mergedEntries.filter((e) => !e.ok).length,
          spendUSD: Number((priorSpend + spend).toFixed(6)),
        },
      },
      null,
      2,
    ),
  );
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => {
    console.error(String(e && e.stack ? e.stack : e));
    process.exit(1);
  });
}
