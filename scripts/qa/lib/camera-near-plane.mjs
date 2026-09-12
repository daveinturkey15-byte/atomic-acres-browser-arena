import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The shipped first-person camera's REAL near plane, read from the source.
 *
 * Extracted from scripts/qa/verify-eye-clearance-runtime.mjs by PASS 87 Lane
 * AR (item 9) so it can be tested: that file launches a browser at module
 * scope, so nothing could import the function and nothing did.
 *
 * Lane J's original rule stands and is why this is a scrape rather than a
 * constant: a frozen copy of a value that lives somewhere else is how every
 * stale roster in this pipeline started, so this reads the shipped source and
 * THROWS rather than guessing. It is a floor for judging clearance - below the
 * near plane the player literally sees through a surface - never a budget.
 *
 * What Lane AR changed: the scrape matched a NUMERIC third argument only.
 * HF-410 replaced that literal with a named constant, so since PASS 85 the
 * shipped line has read
 *   `new THREE.PerspectiveCamera(76, 1, FIRST_PERSON_CAMERA_NEAR_METERS, 180)`
 * and this threw on every call - `--check`, the verdict stage 3 exists for, was
 * dead for two passes. It now follows a named constant to its definition,
 * which is what the doc comment always claimed it did.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const CAMERA_CONSTRUCTION = /const camera = new THREE\.PerspectiveCamera\(\s*[\d.]+,\s*[\d.]+,\s*([A-Za-z_$][\w$]*|[\d.]+),/u;

/** Modules a named near-plane constant may be defined in, most likely first. */
export const NEAR_PLANE_DEFINITION_MODULES = Object.freeze([
  '../../../src/viewmodel-body-fit.ts',
  '../../../src/legacy-main.ts',
]);

export function readCameraNearPlaneM({
  legacyMainSource = readFileSync(resolvePath(HERE, '../../../src/legacy-main.ts'), 'utf8'),
  readModule = (relative) => readFileSync(resolvePath(HERE, relative), 'utf8'),
  modules = NEAR_PLANE_DEFINITION_MODULES,
} = {}) {
  const construction = CAMERA_CONSTRUCTION.exec(legacyMainSource);
  if (!construction) {
    throw new Error(
      'eye-clearance stage 3: could not read the player camera near plane from src/legacy-main.ts. '
      + 'Refusing to judge runtime clearance against a guessed threshold.',
    );
  }
  const argument = construction[1];
  if (/^[\d.]+$/u.test(argument)) return Number(argument);
  const definition = new RegExp('export const ' + argument + ' = ([0-9.]+);', 'u');
  for (const module of modules) {
    let source;
    try {
      source = readModule(module);
    } catch {
      continue;
    }
    const found = definition.exec(source);
    if (found) return Number(found[1]);
  }
  throw new Error(
    `eye-clearance stage 3: the player camera near plane is ${argument}, and no module this script `
    + 'knows about defines it. Refusing to judge runtime clearance against a guessed threshold.',
  );
}
