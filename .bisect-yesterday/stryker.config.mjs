/** @type {import('@stryker-mutator/api/core').StrykerOptions} */
export default {
  mutate: [
    'src/deterministic-rng.ts',
    'src/canonical-state.ts',
    'src/gameplay-replay.ts',
  ],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vite.config.ts',
    related: true,
  },
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: {
    fileName: 'artifacts/pass25a/mutation/mutation.json',
  },
  thresholds: {
    high: 90,
    low: 85,
    break: 85,
  },
  concurrency: 2,
  timeoutMS: 10000,
  tempDirName: '.stryker-tmp',
};
