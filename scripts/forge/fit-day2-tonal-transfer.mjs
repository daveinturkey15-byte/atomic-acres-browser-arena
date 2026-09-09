#!/usr/bin/env node
// HF-536 day-2 tonal-transfer fit verifier.
// The lane brief supplies the frozen fit; this script re-derives and checks the
// monotone anchors before a runtime candidate is allowed to use them.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const input = [0, 10, 16, 32, 64, 96, 125, 140, 160, 180, 192, 203, 211, 235, 255];
const output = [10, 12, 18, 28, 45, 68, 93, 115, 160, 190, 205, 211, 216, 235, 255];
const sourcePath = resolve(process.argv[2] ?? 'C:/Users/david/Desktop/stuff/aa-day-2026-09-06/lanes/day2-luna17/fit.json');

const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const sourceInput = source.curve?.input8Bit ?? [];
const sourceOutput = source.curve?.output8Bit ?? [];
if (JSON.stringify(sourceInput) !== JSON.stringify(input) || JSON.stringify(sourceOutput) !== JSON.stringify(output)) {
  throw new Error('frozen fit anchors do not match the lane transfer');
}
if (input.length !== output.length || input.length < 2) throw new Error('fit must have paired anchors');
for (let i = 1; i < input.length; i += 1) {
  if (!(input[i] > input[i - 1] && output[i] >= output[i - 1])) throw new Error(`non-monotone anchor at ${i}`);
}
const sample = (value) => {
  const x = Math.max(0, Math.min(255, value));
  for (let i = 0; i < input.length - 1; i += 1) {
    if (x <= input[i + 1]) {
      const t = (x - input[i]) / (input[i + 1] - input[i]);
      return output[i] + (output[i + 1] - output[i]) * t;
    }
  }
  return output.at(-1);
};
const samples = [0, 10, 125, 211, 255].map((value) => ({ input: value, output: sample(value) }));
if (samples[2].output !== 93 || samples[3].output !== 216 || samples[0].output < 10) {
  throw new Error(`fit anchors failed: ${JSON.stringify(samples)}`);
}
console.log(JSON.stringify({ source: sourcePath, anchors: input.length, samples, monotone: true }, null, 2));
