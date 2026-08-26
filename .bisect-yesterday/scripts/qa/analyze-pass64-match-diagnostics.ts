import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_BAD_FRAME_P95_MS,
  analyzePass64DiagnosticsJsonl,
  formatPass64DiagnosticsAnalysis,
} from '../../src/pass64-diagnostics-analyzer';

type CliOptions = Readonly<{
  inputFile: string;
  json: boolean;
  badFrameP95Ms: number;
  help: boolean;
}>;

const USAGE = `Usage: npm run qa:pass64:diagnostics:analyze -- [file] [--json] [--bad-frame-p95-ms <ms>]

Reads validated collector JSONL without modifying it. The default file is
artifacts/pass64/match-diagnostics.jsonl.`;

export function parsePass64DiagnosticsAnalyzerArgs(args: readonly string[]): CliOptions {
  let inputFile = resolve(process.cwd(), 'artifacts', 'pass64', 'match-diagnostics.jsonl');
  let json = false;
  let help = false;
  let badFrameP95Ms = DEFAULT_BAD_FRAME_P95_MS;
  let inputSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--json') json = true;
    else if (argument === '--text') json = false;
    else if (argument === '--help' || argument === '-h') help = true;
    else if (argument === '--bad-frame-p95-ms') {
      const value = args[index + 1];
      if (!value) throw new Error('missing value for --bad-frame-p95-ms');
      badFrameP95Ms = Number(value);
      index += 1;
    } else if (argument.startsWith('--bad-frame-p95-ms=')) {
      badFrameP95Ms = Number(argument.slice('--bad-frame-p95-ms='.length));
    } else if (argument.startsWith('-')) throw new Error('unknown option');
    else if (inputSeen) throw new Error('only one diagnostics file may be analyzed');
    else {
      inputFile = resolve(argument);
      inputSeen = true;
    }
  }
  if (!Number.isSafeInteger(badFrameP95Ms) || badFrameP95Ms < 1 || badFrameP95Ms > 1_000) {
    throw new Error('bad frame p95 threshold must be an integer from 1 to 1000 milliseconds');
  }
  return { inputFile, json, badFrameP95Ms, help };
}

export async function runPass64DiagnosticsAnalyzer(args: readonly string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parsePass64DiagnosticsAnalyzerArgs(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'invalid arguments');
    console.error(USAGE);
    return 1;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  let jsonl: string;
  try {
    jsonl = await readFile(options.inputFile, 'utf8');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
    console.error(`Unable to read diagnostics input (${code}).`);
    return 1;
  }
  const report = analyzePass64DiagnosticsJsonl(jsonl, { badFrameP95Ms: options.badFrameP95Ms });
  console.log(options.json ? JSON.stringify(report, null, 2) : formatPass64DiagnosticsAnalysis(report));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runPass64DiagnosticsAnalyzer(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
