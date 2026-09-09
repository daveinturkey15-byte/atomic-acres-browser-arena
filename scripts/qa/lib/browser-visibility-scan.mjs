// Finds every browser launch under scripts/ and tests/ and reports how each one
// would appear on the owner's screen.
//
// This is the derivation behind browser-visibility-contract.test.mjs. It is a
// SCAN, never a roster: a hardcoded list of launcher files is the exact bug this
// repo has spent the week removing (the cross-browser gate's frozen arena list,
// the eye-clearance sweep's five-arena array, the menu-preview roster). A new
// probe script must be covered the moment it is written, without anyone
// remembering to add it anywhere.
//
// It parses each launch CALL SITE rather than grepping the file, because the
// previous sweep of this kind failed in a way grepping cannot see: it added a
// second `args:` key to object literals that already had one. The file still
// contained '--mute-audio', a grep still said "muted", and the flag silently
// never reached Chrome, because a duplicate key in an object literal wins by
// being last. `duplicateArgsKeys` below exists solely to catch that.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SOURCE_EXTENSIONS = ['.mjs', '.cjs', '.js', '.ts', '.mts', '.cts'];

/** Directories that hold dependencies or build output, never our launchers. */
const SKIP_DIRECTORIES = new Set([
  'node_modules', '.git', 'dist', 'build', 'playwright-report', 'artifacts', 'coverage',
]);

/** Playwright's launch entry points. This detection is exact. */
const LAUNCH_CALL = /\.(launch|launchPersistentContext)\s*\(/gu;
/** A spawned child process. Narrowed to a browser by BROWSER_SPAWN_EVIDENCE. */
const SPAWNS_PROCESS = /spawn\s*\(/u;
/** ...and the evidence that what was spawned is in fact a browser. */
const BROWSER_SPAWN_EVIDENCE = /--remote-debugging-port|--user-data-dir|installed-browser-lanes/u;

/** Captures the value written for `headless:` at each launch site. */
const HEADLESS_VALUE = /headless\s*:\s*([^,\n}]*)/gu;

/**
 * "This launch can produce a window."
 *
 * Stated as the safe inverse rather than as a list of headed spellings: a lane
 * is hidden ONLY if its headless value is the literal `true`. Everything else -
 * `false`, `!headed`, `QA_HEADFUL !== '1'`, `cond ? false : undefined` - can end
 * up headed on some invocation, and a lane that is headed on ANY invocation has
 * to carry the flags.
 *
 * Enumerating the headed spellings instead is how this got it wrong once
 * already: /\b(false|!)/ silently never matches `!headed`, because there is no
 * word boundary in front of `!`.
 */
function canBeHeaded(scope) {
  HEADLESS_VALUE.lastIndex = 0;
  let match = HEADLESS_VALUE.exec(scope);
  while (match !== null) {
    if (match[1].trim() !== 'true') return true;
    match = HEADLESS_VALUE.exec(scope);
  }
  return false;
}

export const MUTE_FLAG = '--mute-audio';
export const OFFSCREEN_FLAG = '--window-position=-32000,-32000';

/**
 * Names exported by lib/browser-launch-flags.mjs that carry the mute flag.
 *
 * `installed-browser-lanes` is here because it builds the argv for the installed
 * -browser lanes itself, so its consumers never spell the flag. That module is
 * pinned to keep muting - both engines - by browser-visibility-contract.test.mjs,
 * so trusting it here is a checked delegation and not an assumption.
 */
const MUTING_HELPERS = ['SILENT_ARGS', 'OFFSCREEN_ARGS', 'presentationArgs', 'MUTE_AUDIO'];

/**
 * Delegation, not a flag: these lanes never spell an argument themselves because
 * installed-browser-lanes.mjs builds their whole argv, mute included. Requiring
 * BROWSER_LANES in the body (not just the import) keeps this from rubber-
 * stamping a file that imports the module and then spawns its own browser -
 * which run-hf331-installed-browser-fps.mjs actually does.
 *
 * That module is pinned to keep muting BOTH engines by
 * browser-visibility-contract.test.mjs, so this is a checked delegation.
 */
const MUTING_DELEGATION = 'BROWSER_LANES';
/** ...and the subset that also parks the window off-screen. */
const OFFSCREEN_HELPERS = ['OFFSCREEN_ARGS', 'OFFSCREEN_POSITION', 'presentationArgs'];

export function collectSourceFiles(root) {
  const found = [];
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(full);
      } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

/**
 * Slice the balanced `( ... )` argument list starting at `open`.
 * String and template literals are tracked so a brace inside a URL or a regex
 * cannot end the slice early.
 */
function sliceBalanced(source, open) {
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (character === quote && previous !== '\\') quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '{' || character === '[') depth += 1;
    else if (character === ')' || character === '}' || character === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return source.slice(open);
}

/**
 * Count top-level `args:` keys in a launch options object literal.
 *
 * Depth 1 is the parenthesis, depth 2 the object body, so a key of the options
 * object itself sits at depth 2; anything deeper belongs to a nested object and
 * is somebody else's key. Two at that depth is the silent-drop bug.
 */
export function countTopLevelArgsKeys(optionsText) {
  let depth = 0;
  let quote = null;
  let count = 0;
  for (let index = 0; index < optionsText.length; index += 1) {
    const character = optionsText[index];
    const previous = optionsText[index - 1];
    if (quote) {
      if (character === quote && previous !== '\\') quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '{' || character === '[') {
      depth += 1;
      continue;
    }
    if (character === ')' || character === '}' || character === ']') {
      depth -= 1;
      continue;
    }
    if (depth === 2 && /[\s{,]/u.test(previous ?? ' ') && optionsText.startsWith('args', index)) {
      if (/^\s*:/u.test(optionsText.slice(index + 4))) count += 1;
    }
  }
  return count;
}

/** Strip line and block comments so a quoted flag in prose is not read as code. */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/[^\n]*/gmu, '');
}

/**
 * Classify one file.
 *
 * @returns {null|{
 *   launches: boolean, headedPossible: boolean, alwaysHeaded: boolean,
 *   mutes: boolean, offscreen: boolean, usesHelper: boolean,
 *   duplicateArgsKeys: boolean, firefox: boolean, sites: number,
 * }}
 */
export function classifySource(source, { isContractTest = false, isPlaywrightConfig = false } = {}) {
  const code = stripComments(source);
  const sites = [];
  LAUNCH_CALL.lastIndex = 0;
  let match = LAUNCH_CALL.exec(code);
  while (match !== null) {
    sites.push(sliceBalanced(code, code.indexOf('(', match.index)));
    match = LAUNCH_CALL.exec(code);
  }

  // The direct-CDP path: spawn installed Chrome and drive it over the wire
  // instead of through Playwright. Detected separately because it is the fuzzy
  // one - the Playwright call site above is exact.
  //
  // `isContractTest` suppresses ONLY this fuzzy path. A contract test quotes the
  // flags of the launcher it guards, so it trips every keyword its subject does
  // while launching nothing. It does not suppress the exact path: a test file
  // that genuinely calls .launch() still has a call site above and is still
  // classified, so a real launcher can never hide behind a `.test.` filename.
  const directSpawn = !isContractTest
    && SPAWNS_PROCESS.test(code) && BROWSER_SPAWN_EVIDENCE.test(code);

  // A Playwright config launches every browser its projects use, but through
  // `use.launchOptions` rather than a call site, so it needs its own detector.
  const playwrightConfig = isPlaywrightConfig && /launchOptions|headless\s*:/u.test(code);

  if (sites.length === 0 && !directSpawn && !playwrightConfig) return null;

  const scope = sites.length > 0 ? sites.join('\n') : code;

  // Import lines are stripped before looking for helper usage. Otherwise a file
  // that imports SILENT_ARGS and never spreads it reads as "muted" on the
  // strength of the import alone - which is the same class of lie as the
  // duplicate `args` key: the source mentions the flag, the browser never sees
  // it. Verified by mutation: deleting the spread while leaving the import must
  // turn this file red.
  const body = code.replace(/^import\s[\s\S]*?from\s['"][^'"]*['"];$/gmu, '');
  const helperUsed = (names) => names.some((name) => new RegExp(`\\b${name}\\b`, 'u').test(body));

  const headedPossible = canBeHeaded(scope)
    || (playwrightConfig && canBeHeaded(code))
    // A spawned browser with no --headless flag is headed by definition.
    || (directSpawn && !/--headless/u.test(code));

  return {
    launches: true,
    headedPossible,
    alwaysHeaded: /headless\s*:\s*false/u.test(scope),
    mutes: body.includes(MUTE_FLAG)
      || helperUsed(MUTING_HELPERS)
      || (/installed-browser-lanes/u.test(code) && body.includes(MUTING_DELEGATION)),
    offscreen: body.includes(OFFSCREEN_FLAG) || helperUsed(OFFSCREEN_HELPERS),
    usesHelper: /browser-launch-flags\.mjs/u.test(code),
    duplicateArgsKeys: sites.some((site) => countTopLevelArgsKeys(site) > 1),
    firefox: /\bfirefox\b/u.test(code),
    sites: sites.length,
  };
}

const CONTRACT_TEST = /\.test\.(mjs|cjs|js|ts|mts|cts)$/u;

/**
 * Scan the repository. Returns one row per launching file, path-normalised so
 * the contract test reads the same ids on Windows and POSIX.
 *
 * `extraFiles` carries playwright.config.ts, which launches every browser the
 * e2e suite uses and lives at the root rather than under scripts/ or tests/.
 */
export function scanBrowserLaunchers(
  repositoryRoot,
  roots = ['scripts', 'tests'],
  extraFiles = ['playwright.config.ts'],
) {
  const rows = [];
  const consider = (file) => {
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      return;
    }
    const classified = classifySource(source, {
      isContractTest: CONTRACT_TEST.test(file),
      isPlaywrightConfig: /playwright\.config\./u.test(file),
    });
    if (!classified) return;
    rows.push({ file: relative(repositoryRoot, file).split(sep).join('/'), ...classified });
  };
  for (const root of roots) for (const file of collectSourceFiles(join(repositoryRoot, root))) consider(file);
  for (const extra of extraFiles) consider(join(repositoryRoot, extra));
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

/** Present only so a caller can prove the scan still reaches the tree. */
export function repositoryRootExists(repositoryRoot) {
  try {
    return statSync(repositoryRoot).isDirectory();
  } catch {
    return false;
  }
}
