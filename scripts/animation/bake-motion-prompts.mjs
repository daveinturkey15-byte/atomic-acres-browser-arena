/**
 * Bake the prompt library into portable LLM2Vec embeddings, then generate
 * motion from those embeddings alone.
 *
 * THE POINT. `kmd-generate` takes a prompt, so it must load the LLM2Vec text
 * bundle: ~15 GB in F32, against a 1.1 GB motion model. On a 16 GB card the
 * text runtime alone does not fit, and upstream states quantised models are
 * not implemented, so there is no smaller bundle to fetch.
 *
 * Splitting the two stages removes the problem entirely rather than shrinking
 * it:
 *
 *   bake      kmd-encode           text bundle resident, CPU, once per prompt
 *             -> 4096 F32 values, 16 KB, committed to the repo
 *   generate  kmd-generate-embed   motion model only (1.1 GB), no text runtime
 *
 * Verified byte-identical to the text path at the same seed, so this is a
 * substitution, not an approximation.
 *
 * Usage:
 *   node scripts/animation/bake-motion-prompts.mjs --kimodo <dir> [--only <id>] [--skip-bake] [--device cpu|vulkan|auto]
 *
 * `--skip-bake` regenerates motion from embeddings already committed, which is
 * the normal path and needs no text bundle on disk at all.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(name);

const kimodoDir = flag('--kimodo', 'C:/Users/david/projects/kimodo.cpp');
const only = flag('--only');
const device = flag('--device', 'auto');
const skipBake = has('--skip-bake');

const REPO = resolve(join(import.meta.dirname, '..', '..'));
const LIBRARY = join(REPO, 'source-assets', 'motion', 'prompt-library.json');
const EMBED_DIR = join(REPO, 'source-assets', 'motion', 'embeddings');
const OUT_DIR = join(REPO, 'artifacts', 'motion', 'raw');

const library = JSON.parse(readFileSync(LIBRARY, 'utf8'));
const bin = (name) => join(kimodoDir, 'build-msvc', 'Release', `${name}.exe`);
const motionModel = join(kimodoDir, 'weights', 'models', `${library.generator.motionModel}`);
const textBundle = join(kimodoDir, 'weights', 'generated', 'llm2vec-text-bundle');

mkdirSync(EMBED_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const prompts = library.prompts.filter((p) => !only || p.id === only);
if (prompts.length === 0) { console.error(`no prompt matched --only ${only}`); process.exit(2); }

const { steps, textCfgWeight, constraintCfgWeight } = library.generationDefaults;
const results = [];

for (const prompt of prompts) {
  const embedding = join(EMBED_DIR, `${prompt.id}.f32`);

  if (!skipBake && !existsSync(embedding)) {
    if (!existsSync(textBundle)) {
      console.error(`text bundle absent at ${textBundle}; cannot bake ${prompt.id}.`);
      console.error('Either restore it, or commit the embedding and re-run with --skip-bake.');
      process.exit(1);
    }
    const promptFile = join(OUT_DIR, `${prompt.id}.prompt.txt`);
    writeFileSync(promptFile, prompt.text, 'utf8');
    console.log(`bake     ${prompt.id}`);
    execFileSync(bin('kmd-encode'), [textBundle, promptFile, embedding], { stdio: 'inherit' });
  }

  if (!existsSync(embedding)) { console.error(`missing embedding ${embedding}`); process.exit(1); }
  const bytes = statSync(embedding).size;
  if (bytes !== 4096 * 4) { console.error(`${prompt.id}: embedding is ${bytes} bytes, expected ${4096 * 4}`); process.exit(1); }

  const out = join(OUT_DIR, prompt.id);
  console.log(`generate ${prompt.id}  frames=${prompt.frames} seed=${prompt.seed}`);
  execFileSync(bin('kmd-generate-embed'), [
    motionModel, embedding, String(prompt.frames), String(steps), String(prompt.seed), out,
    '--device', device,
    '--text-cfg', String(textCfgWeight),
    '--constraint-cfg', String(constraintCfgWeight),
  ], { stdio: 'inherit' });

  results.push({ id: prompt.id, out });
}

console.log(`\n${results.length} clip(s) written under ${OUT_DIR}`);
console.log('inspect each with: node scripts/animation/inspect-kimodo-motion.mjs <dir>');
