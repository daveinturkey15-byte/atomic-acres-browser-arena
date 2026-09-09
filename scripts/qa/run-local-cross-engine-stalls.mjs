#!/usr/bin/env node
// ===========================================================================
// LOCAL-BUILD CROSS-ENGINE STALL SWEEP.
//
// scripts/qa/measure-cross-engine-stalls.mjs measures a URL. Its default is
// the PUBLISHED pass81 channel, which is the right target for describing what
// the owner is playing and the wrong one for verifying a fix that has not
// shipped. This wrapper points that instrument at a LOCAL dist/ over a plain
// static server, so a before/after pair is two builds of this working tree
// rather than a build compared against a release.
//
// IT ALSO CLEARS THE MIRROR CACHE, which is the whole reason this is a script
// and not a shell one-liner. The mirror caches upstream bodies on disk keyed
// by (target URL, path) - deliberately, so all three engines are handed
// identical bytes. Two builds served from the SAME localhost URL therefore
// collide in that cache, and the second sweep silently re-measures the first
// build's JavaScript. A false "fixed" is the exact failure mode this removes.
// ===========================================================================
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};

const DIST = resolve(arg('--dist', 'dist'));
const SERVE_PORT = Number(arg('--serve-port', '4193'));
const LABEL = arg('--label', 'local');
const LANES = arg('--lanes', 'chrome,edge,firefox');
const SECONDS = arg('--seconds', '75');
const WARMUP = arg('--warmup', '12');
const MIRROR_PORT = arg('--port', '4187');
const passthrough = [];
for (const name of ['--arena', '--stall-ms', '--profile', '--window-x', '--window-y', '--window-w', '--window-h']) {
  const value = arg(name, null);
  if (value !== null) passthrough.push(name, value);
}
if (argv.includes('--idle')) passthrough.push('--idle');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}: run vite build first`);

const TARGET = `http://127.0.0.1:${SERVE_PORT}/`;
const cacheDir = join(tmpdir(), 'atomic-acres-xengine-mirror', createHash('sha1').update(TARGET).digest('hex').slice(0, 12));
rmSync(cacheDir, { recursive: true, force: true });
mkdirSync(cacheDir, { recursive: true });
console.log(`Cleared mirror cache ${cacheDir}`);

const server = createServer((request, response) => {
  const url = new URL(request.url, TARGET);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  const file = join(DIST, relative);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  const body = readFileSync(file);
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
});
await new Promise((ready) => server.listen(SERVE_PORT, '127.0.0.1', ready));
console.log(`Serving ${DIST} on ${TARGET}`);

const meter = spawn(process.execPath, [
  join(import.meta.dirname, 'measure-cross-engine-stalls.mjs'),
  '--url', TARGET,
  '--lanes', LANES,
  '--seconds', SECONDS,
  '--warmup', WARMUP,
  '--port', MIRROR_PORT,
  '--label', LABEL,
  '--out', `artifacts/qa/cross-engine-stalls/${LABEL}.json`,
  ...passthrough,
], { stdio: 'inherit', windowsHide: true });

const code = await new Promise((settle) => meter.on('exit', settle));
server.close();
process.exitCode = code ?? 1;
