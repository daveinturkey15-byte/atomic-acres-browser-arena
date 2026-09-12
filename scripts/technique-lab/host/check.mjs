/**
 * scripts/technique-lab/host/check.mjs — focused pure checks for the
 * Technique Lab HOST (no GPU, no browser, no dependencies beyond node).
 *
 * Verifies: 50 numbered manifest records + alias honesty; required host
 * exports and honesty/disposal mechanics present in runtime.ts; frozen factory
 * contract in types.ts; scoped responsive CSS in lab.css.
 *
 * Usage: node scripts/technique-lab/host/check.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const lab = join(root, 'src', 'map3', 'technique-lab');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`ok   ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function typesIncludesDisposeHandle() {
  return (
    runtime.includes('TechniqueLabHandle') && runtime.includes('dispose(): void')
  );
}

const manifest = readFileSync(join(lab, 'manifest.ts'), 'utf8');
const runtime = readFileSync(join(lab, 'runtime.ts'), 'utf8');
const types = readFileSync(join(lab, 'types.ts'), 'utf8');
const css = readFileSync(join(lab, 'lab.css'), 'utf8');

// Manifest: 50 numbered records, row 21 aliases 19, all pending.
const ids = [...manifest.matchAll(/rec\((\d+),/g)].map((m) => Number(m[1]));
check(
  'manifest has records 1..50 in order',
  ids.length === 50 && ids.every((id, i) => id === i + 1),
  `found [${ids.join(',')}]`,
);
check(
  'row 21 aliases row 19',
  /rec\(21,[\s\S]*?,\s*\[\],\s*19\)/.test(manifest),
);
check(
  'all records Pending / Not yet delivered',
  !/state:\s*['"`]((?!Pending \/ Not yet delivered).)*['"`]/.test(manifest) &&
    manifest.includes("'Pending / Not yet delivered'"),
);
check(
  'no claim of 50 distinct techniques',
  /WITHOUT claiming 50 distinct techniques/.test(manifest),
);

// Runtime: required export + discovery + honesty mechanics.
check(
  'exports mountTechniqueLab returning dispose',
  runtime.includes('export async function mountTechniqueLab(') &&
    runtime.includes('Promise<TechniqueLabHandle>') &&
    typesIncludesDisposeHandle(),
);
check(
  'discovers demos via import.meta.glob, no static demo imports',
  runtime.includes("import.meta.glob<GroupModule>('./demos/group-*/index.ts')") &&
    !/from '\.\/demos\//.test(runtime),
);
check('single host-owned WebGPURenderer', (() => {
  const creations = (runtime.match(/new WebGPURenderer\(/g) ?? []).length;
  return creations === 1;
})(), 'expected exactly one `new WebGPURenderer(`');
check('awaits renderer init before reading backend flags', runtime.includes('await renderer.init()'));
check(
  'backend honesty: WebGPU/WebGL fallback/unknown',
  runtime.includes("'WebGPU'") &&
    runtime.includes("'WebGL fallback'") &&
    runtime.includes("'unknown'"),
);
check('fixed deterministic seed', /LAB_SEED = 20260912/.test(runtime));
check('no innerHTML anywhere (textContent only)', !runtime.includes('innerHTML'));
check(
  'links validated to http/https with safe rel',
  runtime.includes("url.protocol === 'http:'") &&
    runtime.includes("url.protocol === 'https:'") &&
    runtime.includes("'noopener noreferrer'"),
);
for (const stage of [
  'Link saved',
  'Source inspected',
  'Technique extracted',
  'Implemented',
  'Result tested',
]) {
  check(`stage label present: ${stage}`, runtime.includes(stage));
}
for (const piece of [
  'cancelAnimationFrame',
  'resizeObserver?.disconnect',
  "removeEventListener('error'",
  "removeEventListener('unhandledrejection'",
  'controls?.dispose',
  'demo.dispose',
  'renderer.dispose',
  'generation',
]) {
  check(`disposal/guard piece present: ${piece}`, runtime.includes(piece));
}
check('clamped delta', /dt > 0\.1/.test(runtime));
check('bounded pixel ratio', /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/.test(runtime));
check('Recenter control', runtime.includes('Recenter'));
check('Missing/not delivered path', /Missing \/ not delivered/.test(runtime));

// Types: frozen factory contract.
for (const piece of [
  'context: DemoContext',
  'THREE: typeof import',
  'seed: number',
  'root: THREE.Group',
  'update?: (time: number, dt: number)',
  'dispose: () => void',
  "Adaptation = 'exact' | 'adapted' | 'blocked'",
  'DemoManifestEntry',
  'createDemo?: DemoFactory',
]) {
  check(`contract piece present: ${piece}`, types.includes(piece));
}

// CSS: scoped + responsive.
check('css scoped under .tl-root', css.includes('.tl-root'));
check(
  'css has no global element selectors',
  !/^(html|body|canvas|h1|button|a)\s*[{,]/m.test(css),
);
check('css has narrow-layout media query', /@media\s*\(max-width:\s*900px\)/.test(css));
check('css bounds the stage canvas', css.includes('.tl-canvas-wrap'));

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll technique-lab host checks passed.');
