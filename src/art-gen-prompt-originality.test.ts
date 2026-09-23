import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner 2026-08-30 playtest: "still have icons for laracroft, black
 * panther/venom and its just diff coloured normal skins".
 *
 * The HF-380 orchestration task DID instruct the swarm to "build distinctive
 * ORIGINAL operators ... do not attempt likenesses of trademarked characters"
 * (scripts/orchestration/teams.py). The swarm complied in words and broke it
 * in practice: the shipped explorer prompt read "athletic woman adventurer and
 * former archaeologist turned mercenary ... auburn hair in one practical braid
 * ... amber-tinted goggles pushed up onto her forehead", and the symbiote
 * prompt read "hulking human soldier fused with a living alien symbiote ...
 * glossy wet black bio-armored carapace ... jagged bone-white markings". Those
 * are feature-for-feature descriptions of trademarked characters, and nothing
 * mechanical stopped them reaching the menu.
 *
 * An instruction is not a gate. This is the gate.
 *
 * SCOPE, deliberately narrow so it stays true rather than noisy:
 *  - It reads PROMPT TEXT only. Internal archetype ids (the 'symbiote' key,
 *    the symbiote-card.webp filename) are naming, not likeness, and renaming
 *    them ripples through the asset manifest; that is tracked separately.
 *  - It reads LIVE prompt sources only. Generation receipts under
 *    source-assets/art-gen/*receipt*.json and *.provenance.json are historical
 *    records of what was actually generated - editing those to satisfy a test
 *    would be falsifying a record, which this repo forbids outright.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..');

/** Live prompt sources: files a future regeneration would actually read. */
const LIVE_PROMPT_SOURCES = [
  'scripts/art-gen/lane_i_jobs.json',
  'source-assets/art-gen/hf380-jobs.json',
];

/**
 * Phrases that describe a specific trademarked character rather than an
 * archetype. Each entry names the likeness it guards against, so a future
 * reader can judge whether the rule is still fair rather than deleting it.
 */
const FRANCHISE_CODED_PHRASES: ReadonlyArray<{ phrase: string; guards: string }> = Object.freeze([
  { phrase: 'archaeologist', guards: 'tomb-raiding archaeologist-adventurer likeness' },
  { phrase: 'tomb raid', guards: 'tomb-raiding archaeologist-adventurer likeness' },
  { phrase: 'symbiote', guards: 'alien-symbiote antihero likeness' },
  { phrase: 'fused with a living', guards: 'alien-symbiote antihero likeness' },
  { phrase: 'bone-white markings', guards: 'alien-symbiote antihero likeness' },
  { phrase: 'glossy wet black', guards: 'alien-symbiote antihero likeness' },
  { phrase: 'vibranium', guards: 'panther-suit likeness' },
  { phrase: 'wakand', guards: 'panther-suit likeness' },
  { phrase: 'panther suit', guards: 'panther-suit likeness' },
  { phrase: 'web-sling', guards: 'spider-hero likeness' },
  { phrase: 'super hero', guards: 'generic trademarked-hero framing' },
  { phrase: 'superhero', guards: 'generic trademarked-hero framing' },
  { phrase: 'marvel', guards: 'named rights-holder' },
  { phrase: 'dc comics', guards: 'named rights-holder' },
  { phrase: 'call of duty', guards: 'named rights-holder' },
  { phrase: 'activision', guards: 'named rights-holder' },
]);

function collectPrompts(filePath: string): Array<{ id: string; prompt: string }> {
  const absolute = resolve(REPO_ROOT, filePath);
  if (!existsSync(absolute)) return [];
  const parsed = JSON.parse(readFileSync(absolute, 'utf8')) as unknown;
  const found: Array<{ id: string; prompt: string }> = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const id = String(record.id ?? record.name ?? '(unnamed)');
    for (const key of ['prompt', 'positive', 'positive_prompt']) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) found.push({ id, prompt: value });
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(parsed);
  return found;
}

describe('art-gen prompt originality gate (owner 2026-08-30)', () => {
  it('finds prompts to check, so a rename cannot silently disarm this gate', () => {
    const total = LIVE_PROMPT_SOURCES.flatMap(collectPrompts);
    expect(total.length).toBeGreaterThan(0);
  });

  it.each(LIVE_PROMPT_SOURCES)('describes only original characters in %s', (source) => {
    const offences: string[] = [];
    for (const { id, prompt } of collectPrompts(source)) {
      const lowered = prompt.toLowerCase();
      for (const { phrase, guards } of FRANCHISE_CODED_PHRASES) {
        if (lowered.includes(phrase)) {
          offences.push(`${id}: "${phrase}" (guards against ${guards})`);
        }
      }
    }
    expect(
      offences,
      `${source} describes a trademarked likeness. Rewrite the PROMPT to an original archetype - `
      + 'never delete the rule to get green:\n  ' + offences.join('\n  '),
    ).toEqual([]);
  });

  it('keeps every prompt explicitly self-identify as an original design', () => {
    const missing: string[] = [];
    for (const source of LIVE_PROMPT_SOURCES) {
      for (const { id, prompt } of collectPrompts(source)) {
        // Only character/operator cards carry a likeness risk; environment and
        // loading art cannot resemble a person.
        if (!/skin-card|operator/i.test(id)) continue;
        if (!/original character design/i.test(prompt)) missing.push(`${source} :: ${id}`);
      }
    }
    expect(
      missing,
      'every operator/skin prompt must end with an explicit "original character design" clause: ' + missing.join(', '),
    ).toEqual([]);
  });
});
