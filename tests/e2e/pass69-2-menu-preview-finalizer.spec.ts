import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('Pass 69.2 menu finalizer selects a verified Opus encoder with an explicit native fallback', () => {
  const finalizer = readFileSync(
    resolve(process.cwd(), 'scripts/assets/finalize_pass65_menu_previews.mjs'),
    'utf8',
  );

  expect(finalizer).toContain("ffmpegSupportsEncoder('libopus')");
  expect(finalizer).toContain("? 'libopus'");
  expect(finalizer).toContain("webmAudioEncoder === 'opus' ? ['-strict', '-2'] : []");
  expect(finalizer).toContain("'-c:a', webmAudioEncoder");
  expect(finalizer).toContain('colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited');
  expect(finalizer).toContain("'-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709'");
  expect(finalizer).toContain('webm?.crf !== 20');
  const choreography = JSON.parse(readFileSync(
    resolve(process.cwd(), 'source-assets/menu/pass65-preview-masters/choreography.json'),
    'utf8',
  ));
  expect(choreography.media.encodingProfiles.webm.crf).toBe(20);
});
