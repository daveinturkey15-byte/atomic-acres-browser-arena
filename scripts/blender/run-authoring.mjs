import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const env = { ...process.env, PYTHONHASHSEED: '0' };
const blenderCandidates = [
  process.env.BLENDER_EXECUTABLE,
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
].filter(Boolean);
const blenderCommand = blenderCandidates.find((candidate) => existsSync(candidate)) ?? 'blender';
const gltfTransformCli = path.join(process.cwd(), 'node_modules/@gltf-transform/cli/bin/cli.js');

function run(command, args) {
  const pythonFlagIndex = command === blenderCommand
    ? args.findIndex((argument) => argument === '--python' || argument === '--python-expr')
    : -1;
  const runArgs = pythonFlagIndex >= 0 && !args.includes('--python-exit-code')
    ? [...args.slice(0, pythonFlagIndex), '--python-exit-code', '1', ...args.slice(pythonFlagIndex)]
    : args;
  if (process.env.AUTHORING_DRY_RUN === '1') {
    console.log(JSON.stringify({ command, args: runArgs, pythonHashSeed: env.PYTHONHASHSEED }));
    return;
  }
  const result = spawnSync(command, runArgs, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function optimizeGlb(input, output) {
  run(process.execPath, [
    gltfTransformCli, 'optimize', input, output,
    '--compress', 'meshopt', '--meshopt-level', 'high',
    '--flatten', 'false', '--join', 'false', '--instance', 'false',
    '--palette', 'false', '--prune', 'false', '--simplify', 'false',
    '--texture-compress', 'webp', '--texture-size', '512',
  ]);
}

function runBlenderPython(script) {
  // Blender otherwise reports status 0 after an unhandled --python exception,
  // which can let stale raw files proceed into optimization and provenance.
  run(blenderCommand, [
    '--background', '--factory-startup', '--python-exit-code', '1', '--python', script,
  ]);
}

function authorCrossbow() {
  mkdirSync('public/assets/original/models/weapons/pass65-crossbow', { recursive: true });
  runBlenderPython('scripts/blender/create-pass65-explosive-crossbow.py');
  for (const name of [
    'pass65-crossbow-fp-lod0', 'pass65-crossbow-fp-lod1',
    'pass65-crossbow-world-lod0', 'pass65-crossbow-world-lod1', 'pass65-crossbow-world-lod2',
    'pass65-crossbow-drop-lod0',
  ]) optimizeGlb(`artifacts/blender-crossbow/raw/${name}.glb`, `public/assets/original/models/weapons/pass65-crossbow/${name}.glb`);
}

function authorOperatorArms() {
  mkdirSync('public/assets/original/models/operators', { recursive: true });
  runBlenderPython('scripts/blender/create-pass65-first-person-arms.py');
  for (const lod of [0, 1]) optimizeGlb(
    `artifacts/blender-operator-arms/raw/pass65-first-person-arms-lod${lod}.glb`,
    `public/assets/original/models/operators/pass65-first-person-arms-lod${lod}.glb`,
  );
}

function authorSupportVehicles() {
  mkdirSync('public/assets/original/models/support', { recursive: true });
  runBlenderPython('scripts/blender/create-pass65-support-vehicles.py');
  for (const lod of [0, 1, 2]) {
    optimizeGlb(
      `artifacts/blender-support-vehicles/raw/chopper/pass65-chopper-gunner-lod${lod}.glb`,
      `public/assets/original/models/support/pass65-chopper-gunner-lod${lod}.glb`,
    );
    optimizeGlb(
      `artifacts/blender-support-vehicles/raw/aircraft/pass65-care-aircraft-lod${lod}.glb`,
      `public/assets/original/models/support/pass65-care-aircraft-lod${lod}.glb`,
    );
    optimizeGlb(
      `artifacts/blender-support-vehicles/raw/aircraft/pass65-carpet-aircraft-lod${lod}.glb`,
      `public/assets/original/models/support/pass65-carpet-aircraft-lod${lod}.glb`,
    );
  }
  for (const lod of [0, 1]) {
    optimizeGlb(
      `artifacts/blender-support-vehicles/raw/aircraft/pass65-care-crate-lod${lod}.glb`,
      `public/assets/original/models/support/pass65-care-crate-lod${lod}.glb`,
    );
  }
}

function authorWeaponFamilies() {
  const spec = JSON.parse(readFileSync('source-assets/blender/pass65-weapon-family-specs.json', 'utf8'));
  const previewIds = new Set((process.env.PASS65_WEAPON_PREVIEW_IDS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean));
  const previewDeliverySuffixes = new Set((process.env.PASS65_WEAPON_PREVIEW_DELIVERY_SUFFIXES ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean));
  const weapons = previewIds.size > 0
    ? spec.weapons.filter((weapon) => previewIds.has(weapon.id))
    : spec.weapons;
  const deliveries = previewDeliverySuffixes.size > 0
    ? spec.deliveries.filter((delivery) => previewDeliverySuffixes.has(delivery.suffix))
    : spec.deliveries;
  if (weapons.length !== (previewIds.size || spec.weapons.length)) {
    throw new Error('PASS65_WEAPON_PREVIEW_IDS contains an unknown weapon ID');
  }
  if (deliveries.length !== (previewDeliverySuffixes.size || spec.deliveries.length)) {
    throw new Error('PASS65_WEAPON_PREVIEW_DELIVERY_SUFFIXES contains an unknown delivery suffix');
  }
  runBlenderPython('scripts/blender/create-pass65-weapon-families.py');
  for (const weapon of weapons) {
    const directory = `public/assets/original/models/weapons/pass65-firearms/${weapon.id}`;
    mkdirSync(directory, { recursive: true });
    for (const delivery of deliveries) {
      const name = `${weapon.id}-${delivery.suffix}`;
      optimizeGlb(
        `artifacts/blender-weapon-families/raw/${name}.glb`,
        `${directory}/${name}.glb`,
      );
    }
  }
}

function authorFieldKnife() {
  mkdirSync('public/assets/original/models/weapons/pass65-field-knife', { recursive: true });
  runBlenderPython('scripts/blender/create-pass65-field-knife.py');
  for (const suffix of ['fp-lod0', 'fp-lod1', 'world-lod0', 'world-lod1', 'drop-lod0']) {
    optimizeGlb(
      `artifacts/blender-field-knife/raw/pass65-field-knife-${suffix}.glb`,
      `public/assets/original/models/weapons/pass65-field-knife/pass65-field-knife-${suffix}.glb`,
    );
  }
}

function authorThirdPersonOperator() {
  mkdirSync('public/assets/original/models/operators', { recursive: true });
  runBlenderPython('scripts/blender/create-pass65-third-person-operator.py');
  for (const lod of [0, 1, 2]) optimizeGlb(
    `artifacts/blender-third-person-operator/raw/pass65-third-person-operator-lod${lod}.glb`,
    `public/assets/original/models/operators/pass65-third-person-operator-lod${lod}.glb`,
  );
  run(process.execPath, ['scripts/blender/finalize-pass65-third-person-operator.mjs']);
}

if (target === 'arena') {
  run(npxCommand, [
    'vite-node',
    'scripts/blender/export-atomic-acres-arena-spec.ts',
    'source-assets/blender/atomic-acres-arena-spec.json',
  ]);
  runBlenderPython('scripts/blender/create-atomic-acres-blender-arena.py');
} else if (target === 'tower') {
  runBlenderPython('scripts/blender/create-rustworks-central-tower.py');
} else if (target === 'drone') {
  mkdirSync('public/assets/original/models/support', { recursive: true });
  runBlenderPython('scripts/blender/create-hunter-drone-family.py');
  for (const lod of [0, 1, 2]) {
    run(process.execPath, [
      gltfTransformCli,
      'optimize',
      `artifacts/blender-drone/raw/hunter-drone-lod${lod}.glb`,
      `public/assets/original/models/support/hunter-drone-lod${lod}.glb`,
      '--compress', 'meshopt',
      '--meshopt-level', 'high',
      '--flatten', 'false',
      '--join', 'false',
      '--instance', 'false',
      '--palette', 'false',
      '--prune', 'false',
      '--simplify', 'false',
      '--texture-compress', 'webp',
      '--texture-size', '512',
    ]);
  }
  run(process.execPath, ['scripts/blender/finalize-hunter-drone-assets.mjs']);
} else if (target === 'semtex') {
  mkdirSync('public/assets/original/models/ordnance', { recursive: true });
  mkdirSync('artifacts/blender-semtex/optimized', { recursive: true });
  runBlenderPython('scripts/blender/create-semtex-bundle.py');
  for (const lod of [0, 1, 2]) {
    run(process.execPath, [
      gltfTransformCli,
      'webp',
      `artifacts/blender-semtex/raw/semtex-bundle-lod${lod}.glb`,
      `artifacts/blender-semtex/optimized/semtex-bundle-lod${lod}-webp.glb`,
      '--lossless', 'true',
      '--formats', 'png',
    ]);
    run(process.execPath, [
      gltfTransformCli,
      'meshopt',
      `artifacts/blender-semtex/optimized/semtex-bundle-lod${lod}-webp.glb`,
      `public/assets/original/models/ordnance/semtex-bundle-lod${lod}.glb`,
      '--level', 'high',
    ]);
  }
  run(process.execPath, ['scripts/blender/finalize-semtex-bundle-assets.mjs']);
} else if (target === 'crossbow') {
  authorCrossbow();
  run(process.execPath, ['scripts/blender/finalize-pass65-crossbow-arms-assets.mjs']);
} else if (target === 'operator-arms') {
  authorOperatorArms();
  run(process.execPath, ['scripts/blender/finalize-pass65-crossbow-arms-assets.mjs']);
} else if (target === 'operator-body') {
  authorThirdPersonOperator();
} else if (target === 'weapon-families') {
  authorWeaponFamilies();
  if (process.env.PASS65_WEAPON_PREVIEW_IDS) {
    console.log('PASS65_WEAPON_PREVIEW_COMPLETE: production provenance/finalizer intentionally skipped');
  } else {
    run(process.execPath, ['scripts/blender/finalize-pass65-weapon-family-assets.mjs']);
  }
} else if (target === 'weapon-preview-reconcile') {
  runBlenderPython('scripts/blender/reconcile-pass65-weapon-preview.py');
} else if (target === 'field-knife') {
  authorFieldKnife();
  run(process.execPath, ['scripts/blender/finalize-pass65-field-knife-assets.mjs']);
} else if (target === 'pass65-weapon-tranche') {
  authorCrossbow();
  // Arms v4 imports the actual consolidated M4A1 delivery for strict neutral,
  // ADS and reload socket/digit contact review, so firearm sources must exist first.
  authorWeaponFamilies();
  authorOperatorArms();
  authorFieldKnife();
  run(process.execPath, ['scripts/blender/finalize-pass65-crossbow-arms-assets.mjs']);
  run(process.execPath, ['scripts/blender/finalize-pass65-weapon-family-assets.mjs']);
  run(process.execPath, ['scripts/blender/finalize-pass65-field-knife-assets.mjs']);
} else if (target === 'support-vehicles') {
  authorSupportVehicles();
  run(process.execPath, ['scripts/blender/finalize-pass65-support-vehicle-assets.mjs']);
} else {
  console.error(`Unknown authoring target: ${target ?? '<missing>'}`);
  process.exit(2);
}
