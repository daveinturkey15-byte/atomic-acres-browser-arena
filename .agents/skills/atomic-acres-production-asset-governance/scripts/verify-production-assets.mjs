import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const REQUIRED_GATES = Object.freeze([
  'qa:pass65:weapon-assets',
  'qa:pass65:drone-asset',
  'qa:pass65:support-vehicles',
  'qa:pass65:operator-assets',
]);

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const missing = REQUIRED_GATES.filter((gate) => typeof packageJson.scripts?.[gate] !== 'string');
if (missing.length > 0) {
  console.error(`Pass 65 production asset governance BLOCKED: missing npm gates: ${missing.join(', ')}`);
  process.exit(1);
}

const npmCli = process.env.npm_execpath;
const npmExecutable = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const gate of REQUIRED_GATES) {
  const args = npmCli ? [npmCli, 'run', gate] : ['run', gate];
  const result = spawnSync(npmExecutable, args, {
    stdio: 'inherit',
    shell: !npmCli && process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Pass 65 production asset governance BLOCKED by ${gate}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`PASS production asset governance gates=${REQUIRED_GATES.length}`);
