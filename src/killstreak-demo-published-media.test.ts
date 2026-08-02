import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  KILLSTREAK_DEMO_CAPTURE_IDS,
  killstreakDemoPosterPath,
  killstreakDemoVideoPath,
} from './killstreak-demo-capture-contract';
import { verifyFinalizedKillstreakDemoMedia } from '../scripts/qa/finalize-pass66-killstreak-demo-media';
import { KILLSTREAK_DEMO_MEDIA } from './ui/killstreak-demo-presentation';

describe('Pass 66 published real test-bay killstreak media', () => {
  it('retains exact capture provenance, unique bytes and source-drift protection', async () => {
    await expect(verifyFinalizedKillstreakDemoMedia(process.cwd())).resolves.toMatchObject({
      mediaCount: KILLSTREAK_DEMO_CAPTURE_IDS.length,
      aggregateSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it('wires every menu definition to its verified real-bay video and poster fallback', () => {
    const publicManifest = JSON.parse(readFileSync('public/assets/original/killstreak-demo/manifest.json', 'utf8'));
    expect(publicManifest.media.map(({ id }: { id: string }) => id)).toEqual(KILLSTREAK_DEMO_CAPTURE_IDS);
    for (const id of KILLSTREAK_DEMO_CAPTURE_IDS) {
      expect(KILLSTREAK_DEMO_MEDIA[id].media).toEqual({
        posterPath: killstreakDemoPosterPath(id),
        videoPath: killstreakDemoVideoPath(id),
      });
    }
  });
});
