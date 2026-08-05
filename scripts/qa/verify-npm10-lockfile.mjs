import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const expectedPackageManager = 'npm@10.9.8';
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

if (packageJson.packageManager !== expectedPackageManager) {
  throw new Error(
    `packageManager must remain ${expectedPackageManager}; received ${String(packageJson.packageManager)}`,
  );
}

const npmCli = process.env.npm_execpath
  ?? resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npxCli = resolve(dirname(npmCli), 'npx-cli.js');
const expectedNpmVersion = expectedPackageManager.slice('npm@'.length);
const installedNpmVersion = JSON.parse(
  readFileSync(resolve(dirname(npmCli), '..', 'package.json'), 'utf8'),
).version;
const launcherArgs = installedNpmVersion === expectedNpmVersion
  ? [npmCli]
  : [npxCli, '--yes', expectedPackageManager];
const result = spawnSync(process.execPath, [
  ...launcherArgs,
  'ci',
  '--ignore-scripts',
  '--dry-run',
  '--no-audit',
  '--no-fund',
  '--loglevel=error',
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    npm_config_update_notifier: 'false',
  },
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  throw new Error(
    `${expectedPackageManager} rejected package-lock.json (exit ${String(result.status)}). `
    + `Regenerate it with: npx --yes ${expectedPackageManager} install --package-lock-only --ignore-scripts`,
  );
}

console.log(JSON.stringify({
  ok: true,
  packageManager: expectedPackageManager,
  mode: 'clean-install-dry-run',
  launcher: installedNpmVersion === expectedNpmVersion ? 'installed-pinned-npm' : 'pinned-npx-fallback',
}));
