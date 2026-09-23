import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

/**
 * Browser-side companion to audio-offline-render.test.ts. The deterministic
 * Node probe gives stable CI numbers; this small headless probe proves that
 * the same recipe is also legal in a real browser OfflineAudioContext.
 */
describe('native OfflineAudioContext audio probe', () => {
  it('renders five asset-free category buses without NaN or clipping', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const result = await page.evaluate(async () => {
        const rate = 8_000;
        const seconds = 20;
        const size = rate * seconds;
        type Category = 'weapons' | 'movement' | 'impacts' | 'ui' | 'music';
        const seed = (initial: number) => {
          let state = initial >>> 0;
          return () => {
            state = Math.imul(state ^ (state >>> 16), 0x21f0aaad);
            state = Math.imul(state ^ (state >>> 15), 0x735a2d97);
            state ^= state >>> 15;
            return (state >>> 0) / 0x1_0000_0000;
          };
        };
        const tone = (
          context: OfflineAudioContext,
          destination: AudioNode,
          at: number,
          duration: number,
          startHz: number,
          endHz: number,
          gainValue: number,
          type: OscillatorType,
        ) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(startHz, at);
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endHz), at + duration);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.linearRampToValueAtTime(gainValue, at + Math.min(0.004, duration * 0.2));
          gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
          oscillator.connect(gain).connect(destination);
          oscillator.start(at);
          oscillator.stop(at + duration + 0.01);
        };
        const noise = (
          context: OfflineAudioContext,
          destination: AudioNode,
          at: number,
          duration: number,
          frequency: number,
          gainValue: number,
          initial: number,
        ) => {
          const buffer = context.createBuffer(1, Math.ceil(rate * 0.5), rate);
          const data = buffer.getChannelData(0);
          const random = seed(initial);
          for (let index = 0; index < data.length; index += 1) data[index] = random() * 2 - 1;
          const source = context.createBufferSource();
          const filter = context.createBiquadFilter();
          const gain = context.createGain();
          source.buffer = buffer;
          filter.type = 'bandpass';
          filter.frequency.value = frequency;
          filter.Q.value = 0.8;
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.linearRampToValueAtTime(gainValue, at + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
          source.connect(filter).connect(gain).connect(destination);
          source.start(at, 0, duration);
        };
        const render = async (category: Category, variant = 0) => {
          const context = new OfflineAudioContext(1, size, rate);
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -1;
          limiter.knee.value = 0;
          limiter.ratio.value = 20;
          limiter.attack.value = 0.001;
          limiter.release.value = 0.1;
          const bus = context.createGain();
          bus.gain.value = category === 'music' ? 0.22 : 0.5;
          bus.connect(limiter).connect(context.destination);
          if (category === 'weapons') {
            for (let index = 0; index < 5; index += 1) {
              const at = 0.5 + index * 1.45;
              tone(context, bus, at, 0.008, 4_800 + variant * 23, 3_400, 0.16, 'square');
              tone(context, bus, at, 0.24, 128 + variant, 46, 0.38, 'sawtooth');
              noise(context, bus, at, 0.2, 1_800, 0.22, 1_000 + index + variant);
            }
          } else if (category === 'movement') {
            for (let index = 0; index < 10; index += 1) {
              const at = 0.35 + index * 0.62;
              tone(context, bus, at, 0.07, 82 + index * 7, 42, 0.11, 'sine');
              noise(context, bus, at, 0.055, 650 + index * 170, 0.14, 2_000 + index);
            }
          } else if (category === 'impacts') {
            tone(context, bus, 0.6, 0.16, 5_400, 2_600, 0.2, 'square');
            tone(context, bus, 2.1, 0.14, 960, 420, 0.16, 'triangle');
            tone(context, bus, 3.6, 0.2, 1_900, 820, 0.15, 'triangle');
            noise(context, bus, 0.6, 0.22, 3_600, 0.1, 3_000);
            noise(context, bus, 3.63, 0.22, 2_600, 0.1, 3_001);
          } else if (category === 'ui') {
            tone(context, bus, 0.8, 0.15, 660, 880, 0.18, 'triangle');
            tone(context, bus, 0.89, 0.17, 880, 1_320, 0.16, 'sine');
            tone(context, bus, 0.98, 0.24, 1_320, 1_760, 0.2, 'sine');
          } else {
            for (let index = 0; index < 20; index += 1) {
              tone(context, bus, index, 1.02, 92 + (index % 4) * 2, 96, 0.045, 'sine');
              tone(context, bus, index, 1.02, 184 + (index % 5) * 3, 188, 0.028, 'triangle');
            }
          }
          const rendered = await context.startRendering();
          const data = rendered.getChannelData(0);
          let peak = 0;
          let sum = 0;
          let signature = 0;
          let finite = true;
          for (let index = 0; index < data.length; index += 1) {
            const sample = data[index]!;
            finite = finite && Number.isFinite(sample);
            peak = Math.max(peak, Math.abs(sample));
            sum += sample * sample;
            if (index % 97 === 0) signature += sample * (index + 1);
          }
          return {
            peak,
            rms: Math.sqrt(sum / data.length),
            finite,
            clipped: peak > 0.999,
            signature,
          };
        };
        const categories: Category[] = ['weapons', 'movement', 'impacts', 'ui', 'music'];
        const metrics: Record<string, Awaited<ReturnType<typeof render>>> = {};
        for (const category of categories) metrics[category] = await render(category);
        const first = await render('weapons', 0);
        const second = await render('weapons', 1);
        return { metrics, differentVariants: first.signature !== second.signature };
      });
      for (const metrics of Object.values(result.metrics)) {
        expect(metrics.finite).toBe(true);
        expect(metrics.clipped).toBe(false);
        expect(metrics.peak).toBeGreaterThan(0);
        expect(metrics.rms).toBeGreaterThan(0);
      }
      expect(result.differentVariants).toBe(true);
    } finally {
      await browser.close();
    }
  }, 120_000);
});
