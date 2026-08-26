// One description of every installed browser this machine can be asked to run,
// shared by the cross-browser gate and the frame-rate ceiling probe.
//
// It exists because the browser-launch details are where every cross-browser
// measurement on this machine has previously gone wrong, and the same mistakes
// were being re-made in each new script:
//
//   - Killing the spawned pid. Several of these browsers ship a launcher stub
//     that exits immediately and orphans the real windows; taskkill on the pid
//     reports success and leaves a browser running. Kill on the unique profile
//     token instead - it appears in every process of the tree this run started
//     and in nothing else on the machine, so a human's own browser is never at
//     risk.
//   - Assuming a launched window is focused. It usually is not, and the render
//     runtime refuses to author frames without document focus, so an unfocused
//     window reads exactly like a wedged browser. foregroundWindow() takes the
//     foreground and REPORTS WHETHER IT SUCCEEDED, so a number produced without
//     it can be marked untrustworthy instead of published.
//   - Leaving occlusion detection on. Chromium reports a freshly launched
//     window as occluded and throttles it; Firefox does the same through
//     widget.windows.window_occlusion_tracking. Both are turned off for the QA
//     window only, never machine-wide.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const LOCAL_APP_DATA = process.env.LOCALAPPDATA ?? 'C:/Users/Default/AppData/Local';
const PROGRAM_FILES = process.env.ProgramFiles ?? 'C:/Program Files';
const PROGRAM_FILES_X86 = process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)';

const CHROMIUM_PRESENTATION_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--window-position=0,0',
  '--window-size=1280,800',
  '--new-window',
];

/** Chromium's vsync limiter, off. Only used by the ceiling control run. */
const CHROMIUM_UNCAP_ARGS = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

const chromiumArgs = ({ profile, url, uncap }) => [
  `--user-data-dir=${profile}`,
  ...CHROMIUM_PRESENTATION_ARGS,
  ...(uncap ? CHROMIUM_UNCAP_ARGS : []),
  url,
];

/**
 * Firefox prefs, written into the disposable QA profile.
 *
 * privacy.reduceTimerPrecision matters more than it looks: Firefox rounds
 * performance.now() to 1 ms by default, which quantises a 5.5 ms frame into 5 or
 * 6 and makes a high-refresh cadence unreadable. Turned off for the QA profile
 * only - it is a fingerprinting defence, not a performance switch.
 *
 * layout.frame_rate = 0 makes Gecko drive rAF from a 10 kHz software timer
 * instead of vsync. That is the whole vsync-versus-GPU-bound question settled in
 * one pref: if the idle rate leaps when it is set, the default number was a
 * refresh-rate cap and not a performance ceiling.
 */
const firefoxPrefs = ({ uncap }) => [
  'user_pref("widget.windows.window_occlusion_tracking.enabled", false);',
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("browser.startup.homepage_override.mstone", "ignore");',
  'user_pref("browser.aboutwelcome.enabled", false);',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
  'user_pref("browser.sessionstore.resume_from_crash", false);',
  'user_pref("privacy.reduceTimerPrecision", false);',
  'user_pref("full-screen-api.warning.timeout", 0);',
  ...(uncap ? ['user_pref("layout.frame_rate", 0);'] : []),
].join('\n');

export const BROWSER_LANES = {
  chrome: {
    family: 'chromium',
    processName: 'chrome',
    label: 'Google Chrome',
    candidates: [
      `${PROGRAM_FILES}/Google/Chrome/Application/chrome.exe`,
      `${PROGRAM_FILES_X86}/Google/Chrome/Application/chrome.exe`,
      `${LOCAL_APP_DATA}/Google/Chrome/Application/chrome.exe`,
    ],
    args: chromiumArgs,
    prefs: () => '',
  },
  edge: {
    family: 'chromium',
    processName: 'msedge',
    label: 'Microsoft Edge',
    candidates: [
      `${PROGRAM_FILES_X86}/Microsoft/Edge/Application/msedge.exe`,
      `${PROGRAM_FILES}/Microsoft/Edge/Application/msedge.exe`,
    ],
    // ------------------------------------------------------------------
    // Edge needs more than a fresh --user-data-dir. Measured 2026-08-23: a QA
    // Edge launched with its own disposable profile still signed itself into
    // the machine account's synced "Personal" profile, restored that profile's
    // session and its extensions, and opened the QA URL as a BACKGROUND TAB -
    // window title "Help - Dark Reader and 1 more page - Personal - Microsoft
    // Edge", with the probe reporting visibilityState "hidden" for the whole
    // run. A hidden tab gets no rAF and the game's frame loop refuses to run,
    // so the lane reads as "Edge cannot run this game" when the truth is
    // "Edge never put the page in front".
    //
    // --inprivate is the load-bearing one: an InPrivate window opens with the
    // requested URL and nothing else, no restored session and no extensions.
    // The rest stop the implicit sign-in and first-run flow that dragged the
    // session in to begin with.
    // ------------------------------------------------------------------
    args: ({ profile, url, uncap }) => [
      `--user-data-dir=${profile}`,
      '--inprivate',
      '--disable-sync',
      '--disable-extensions',
      '--no-service-autorun',
      '--disable-features=msImplicitSignin,msEdgeFre,msEdgeShoppingAssistant,CalculateNativeWinOcclusion',
      ...CHROMIUM_PRESENTATION_ARGS.filter((flag) => !flag.startsWith('--disable-features=')),
      ...(uncap ? CHROMIUM_UNCAP_ARGS : []),
      url,
    ],
    prefs: () => '',
  },
  firefox: {
    family: 'gecko',
    processName: 'firefox',
    label: 'Mozilla Firefox',
    candidates: [
      `${PROGRAM_FILES}/Mozilla Firefox/firefox.exe`,
      `${PROGRAM_FILES_X86}/Mozilla Firefox/firefox.exe`,
    ],
    // ------------------------------------------------------------------
    // HF-331 ROOT CAUSE. Firefox launched with an explicit `-profile <dir>`
    // NEVER gives the content document focus on this machine: document
    // .hasFocus() stays false forever and not one focus, blur or focusin event
    // ever fires, no matter that the window is verified foreground, visible and
    // clicked in with synthesised input. Measured by bisect - four launch
    // variants using `-profile` all scored 0, the same Firefox launched against
    // its DEFAULT profile scored focus immediately (receipt:
    // artifacts/qa/lane-q/firefox-focus-variants.json).
    //
    // That single fact is the whole of the "Firefox runs at ~10 FPS" report.
    // The game's match-admission loop pauses itself whenever
    // `document.visibilityState === 'visible' && document.hasFocus()` is false
    // (src/legacy-main.ts), so under every previous harness Firefox was being
    // asked to render in a state where the product deliberately renders
    // nothing. The browser was never measured; the harness was.
    //
    // So this lane uses the DEFAULT profile with -private-window: a private
    // window persists no history or cookies, leaves the human's session
    // untouched, and is disposed of by closing that one window rather than by
    // killing firefox.exe. The cost is that user.js prefs cannot be injected -
    // notably privacy.reduceTimerPrecision stays at its default, so Firefox
    // frame times are quantised more coarsely than Chromium's. That is recorded
    // with the numbers rather than hidden.
    // ------------------------------------------------------------------
    usesDefaultProfile: true,
    identifyByTitle: true,
    args: ({ url }) => ['-private-window', url],
    // Force-killing Firefox increments its startup-crash counter, and after
    // three of those every subsequent launch opens "Open Firefox in Troubleshoot
    // Mode?" instead of the page - a modal that swallows the URL and makes the
    // NEXT run time out for a reason that has nothing to do with the run. Two
    // defences: shut the window down gracefully (see closeGracefully), and set
    // these so a counter that is already poisoned cannot hijack the launch.
    env: {
      MOZ_DISABLE_AUTO_SAFE_MODE: '1',
      MOZ_DISABLE_SAFE_MODE_KEY: '1',
    },
    prefs: firefoxPrefs,
  },
  opera: {
    family: 'chromium',
    processName: 'opera',
    label: 'Opera',
    candidates: [
      `${LOCAL_APP_DATA}/Programs/Opera/opera.exe`,
      `${LOCAL_APP_DATA}/Programs/Opera/launcher.exe`,
      `${LOCAL_APP_DATA}/Programs/Opera GX/opera.exe`,
      `${LOCAL_APP_DATA}/Programs/Opera GX/launcher.exe`,
      `${PROGRAM_FILES}/Opera/opera.exe`,
      `${PROGRAM_FILES}/Opera GX/opera.exe`,
      `${PROGRAM_FILES_X86}/Opera/opera.exe`,
    ],
    args: chromiumArgs,
    prefs: () => '',
  },
};

/**
 * Take the Windows foreground for the windows this run launched, and report
 * whether it actually happened. Never throws: a foreground failure is data the
 * caller has to publish, not a reason to lose the run.
 */
export function foregroundWindow({
  token, titleMatch, anyWindow = false, processName, scriptDir,
  click = false, realClick = false, closeOnly = false,
}) {
  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', join(scriptDir, 'win-foreground.ps1'),
      ...(token ? ['-Token', token] : []),
      ...(titleMatch ? ['-TitleMatch', titleMatch] : []),
      ...(anyWindow ? ['-AnyWindow'] : []),
      '-ProcessName', processName,
      ...(click ? ['-Click'] : []),
      ...(realClick ? ['-RealClick'] : []),
      ...(closeOnly ? ['-CloseOnly'] : []),
    ], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
    const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? '';
    return JSON.parse(line);
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 200) };
  }
}

/** True when the human already has this browser open - the lane must not kill it. */
export function processIsRunning(processName) {
  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `@(Get-Process -Name '${processName}' -ErrorAction SilentlyContinue).Count`,
    ], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
    return Number(output.trim()) > 0;
  } catch { return false; }
}

/** Kill exactly the process tree this run started, matched on its profile token. */
export function killByToken(token) {
  try {
    execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${token}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: 'ignore', timeout: 30_000, windowsHide: true });
  } catch { /* windows already gone */ }
}

/**
 * Teardown for the default-profile lane. Only ever called when the lane
 * established that the browser was NOT already running before it launched it -
 * a leftover QA instance owns the remoting handoff, so the next run's URL is
 * silently swallowed by the stale process and the lane times out reporting
 * nothing. That is a harness fault that reads as a browser fault, so the lane
 * refuses to start rather than measure through it.
 */
export function killProcessByName(processName) {
  try {
    execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Get-Process -Name '${processName}' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
    ], { stdio: 'ignore', timeout: 30_000, windowsHide: true });
  } catch { /* already gone */ }
}

/**
 * Ask every window of this browser to close, then wait for the process to
 * retire on its own; force only as a last resort.
 *
 * This is not politeness. A force-killed Firefox records a startup crash, and
 * three of those turn the next launch into a "Troubleshoot Mode?" modal that
 * eats the URL - so an impatient teardown breaks the RUN AFTER IT, which is
 * exactly the kind of fault that gets blamed on the browser.
 */
export async function closeGracefully(processName, graceMs = 12_000) {
  try {
    execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Get-Process -Name '${processName}' -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }`,
    ], { stdio: 'ignore', timeout: 20_000, windowsHide: true });
  } catch { /* no windows */ }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    await new Promise((wait) => setTimeout(wait, 750));
    if (!processIsRunning(processName)) return { forced: false };
  }
  killProcessByName(processName);
  await new Promise((wait) => setTimeout(wait, 1_500));
  return { forced: true };
}


/**
 * Other QA automation currently driving a browser on this machine.
 *
 * The Windows foreground is a single global resource and the game refuses to
 * render without it, so a second lane running a capture or a Playwright sweep at
 * the same time steals it back between this harness's attempts. That is not
 * hypothetical: measured 2026-08-23, the Edge lane held the foreground for only
 * 15% of its run while `capture-lane-l-art-direction.mjs` was live in another
 * session, sampled an entire arena at `document.hasFocus() === false`, and
 * produced a 178.6 fps reading that was the empty rAF cadence rather than the
 * game. The gate caught it - zero focused frames in the sample - but a reader
 * deserves to be told WHY rather than left suspecting the browser.
 *
 * Returns the script names found, so the receipt can name them.
 */
export function competingBrowserAutomation({ selfScript = '' } = {}) {
  const IGNORED = new Set([
    'stable-dev-proxy.mjs',
    'run-with-dev-server.mjs',
    'run-with-preview-server.mjs',
    'playwright-web-server.mjs',
    // The gate is this script's own parent process, not a competitor.
    'run-cross-browser-gate.mjs',
    selfScript,
  ]);
  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { $_.CommandLine }",
    ], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
    const found = new Set();
    for (const raw of output.split('\n')) {
      // Deliberately crude: split on whitespace and keep anything that looks
      // like a script under scripts/qa. A false positive costs one warning
      // line; a false negative costs a lane nobody can explain.
      for (const token of raw.split(/\s+/)) {
        const normalised = token.split('\\').join('/');
        const marker = normalised.indexOf('scripts/qa/');
        if (marker < 0) continue;
        const name = normalised.slice(marker + 'scripts/qa/'.length).replace(/["']/g, '');
        if (!/\.(mjs|cjs|ts)$/.test(name)) continue;
        if (IGNORED.has(name)) continue;
        found.add(name);
      }
    }
    return [...found];
  } catch { return []; }
}
