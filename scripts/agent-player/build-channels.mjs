#!/usr/bin/env node

import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');

export function parseReleaseChannelConfig(source) {
  const match = String(source).match(/__ATOMIC_ACRES_RELEASE_CHANNELS__\s*=\s*(\{.*\})\s*;?\s*$/s);
  if (!match) throw new Error('Could not locate __ATOMIC_ACRES_RELEASE_CHANNELS__ assignment');
  const parsed = JSON.parse(match[1]);
  for (const key of ['experimental', 'stable']) {
    if (!parsed[key]?.pass || !parsed[key]?.path) throw new Error(`Release config is missing ${key}.pass/path`);
  }
  return parsed;
}

export function passNumber(passLabel) {
  const match = String(passLabel).match(/PASS\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function channelReport(config, rootUrl) {
  const root = new URL(rootUrl);
  const build = (role, key) => {
    const channel = config[key];
    const url = new URL(`${channel.path.replace(/^\/+|\/+$/g, '')}/`, root);
    url.searchParams.set('release', 'latest');
    return {
      role,
      configKey: key,
      pass: String(channel.pass).toUpperCase(),
      passNumber: passNumber(channel.pass),
      label: channel.label,
      description: channel.description,
      path: channel.path,
      url: url.toString(),
    };
  };
  return [build('latest', 'experimental'), build('stable', 'stable')];
}

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const rootUrl = valueAfter('--root') ?? 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/';
  const configUrl = new URL('release-channel-config.js', rootUrl).toString();
  const response = await fetch(configUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Release config fetch failed: HTTP ${response.status}`);
  const channels = channelReport(parseReleaseChannelConfig(await response.text()), rootUrl);
  for (const channel of channels) {
    const manifest = resolve(repositoryRoot, `acceptance/pass-${channel.passNumber}.json`);
    channel.localAcceptanceManifest = await access(manifest).then(() => `acceptance/pass-${channel.passNumber}.json`).catch(() => null);
  }
  const report = {
    schemaVersion: 1,
    kind: 'atomic-player-live-build-channels',
    observedAt: new Date().toISOString(),
    selectorUrl: rootUrl,
    configUrl,
    channels,
  };
  const output = valueAfter('--output');
  if (output) {
    const outputPath = resolve(repositoryRoot, output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  const requiredLatest = Number(valueAfter('--require-latest-pass'));
  if (Number.isFinite(requiredLatest) && channels[0].passNumber !== requiredLatest) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
