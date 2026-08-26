import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const AUTHORING_TARGETS = Object.freeze([
  'arena',
  'tower',
  'drone',
  'semtex',
  'crossbow',
  'operator-arms',
  'operator-body',
  'weapon-families',
  'weapon-preview-reconcile',
  'field-knife',
  'pass65-weapon-tranche',
  'support-vehicles',
  'support-aircraft-visibility',
]);

describe('Blender authoring process contract', () => {
  it.each(AUTHORING_TARGETS)('%s fails closed on an unhandled Python error', (target) => {
    const result = spawnSync(process.execPath, ['scripts/blender/run-authoring.mjs', target], {
      cwd: path.resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      env: { ...process.env, AUTHORING_DRY_RUN: '1' },
    });

    expect(result.status, result.stderr).toBe(0);
    const commands = result.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { command: string; args: string[] });
    const blenderCommands = commands.filter(({ command }) => /(?:^|[\\/])blender(?:\.exe)?$/iu.test(command));
    expect(blenderCommands.length).toBeGreaterThan(0);

    for (const { args } of blenderCommands) {
      const exitCodeIndex = args.indexOf('--python-exit-code');
      const pythonIndex = Math.max(args.indexOf('--python'), args.indexOf('--python-expr'));
      expect(exitCodeIndex).toBeGreaterThanOrEqual(0);
      expect(args[exitCodeIndex + 1]).toBe('1');
      expect(exitCodeIndex).toBeLessThan(pythonIndex);
    }
  });

  it('pins the hashed operator-arms contact receipt to LF bytes', () => {
    const repository = path.resolve(import.meta.dirname, '..');
    const runner = readFileSync(path.join(repository, 'scripts/blender/run-authoring.mjs'), 'utf8');
    const exporter = readFileSync(
      path.join(repository, 'scripts/blender/export-pass69-3-first-person-operator-arms.py'),
      'utf8',
    );

    expect(runner).toContain("`${reviews}/pass69-3-first-person-arms-contact-receipt.json`");
    expect(runner).toContain('bytes.includes(13)');
    expect(exporter).toContain('newline="\\n"');
  });
});
