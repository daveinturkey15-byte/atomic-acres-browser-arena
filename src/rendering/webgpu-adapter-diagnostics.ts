/**
 * FAILURE-PATH-ONLY WebGPU diagnostics.
 *
 * WHY THIS EXISTS. Owner 2026-08-31: he could not launch the game in his
 * everyday Chrome. It worked in Edge, in a fresh Chrome profile, headless,
 * headed, and with a copy of his GPU caches - every configuration except his
 * own running instance. All the player got was:
 *
 *   "This game needs WebGPU. Use a current Chrome, Edge or Firefox (Windows)
 *    ... (WebGPU was required, but no GPU adapter was available at all)"
 *
 * That sentence is true and useless: it names the symptom the game already
 * knew about and nothing the player can act on. From outside the browser
 * nobody can see WHY requestAdapter returned null, and telling a friend who
 * was invited to play "open chrome://gpu and read it out to me" is not a
 * support path. So the page asks the questions itself and puts the answers on
 * screen, where they can be selected and pasted to someone.
 *
 * THE OBSERVATIONS ARE THE DIAGNOSIS. Which of the three adapter requests fail
 * separates the cases, and WebGL2's unmasked renderer separates them again:
 *   - no navigator.gpu at all      -> browser, version or secure context; the GPU
 *                                     was never even asked
 *   - WebGL2 says SwiftShader      -> hardware acceleration is off or blocklisted
 *                                     in the BROWSER; the fix is not in the game
 *   - WebGL2 says a real GPU while
 *     every adapter is null        -> the running browser instance is in a bad
 *                                     GPU-process or profile state
 *
 * COST CONTRACT. Nothing here runs when an adapter is acquired. The module is
 * reached only through a dynamic `import()` inside a failure branch, so on the
 * success path it is not imported, not parsed with the renderer chunk, and
 * never called. Every probe below is therefore allowed to be slow and thorough.
 */

/** Property key the renderer hangs a finished report on, for the failure screen. */
const DIAGNOSTICS_ERROR_KEY = 'webGpuDiagnostics';

/** Bound per adapter probe: a dead screen must not also be a hung screen. */
const DEFAULT_PROBE_TIMEOUT_MS = 3_000;

const UNMASKED_VENDOR_WEBGL = 0x9245;
const UNMASKED_RENDERER_WEBGL = 0x9246;
const GL_VENDOR = 0x1f00;
const GL_RENDERER = 0x1f01;

/**
 * Renderer strings that mean "no GPU is involved". SwiftShader is Chrome's own
 * CPU rasteriser and is what the browser falls back to when hardware
 * acceleration is disabled or the GPU is blocklisted; llvmpipe and softpipe are
 * the Mesa equivalents; "Microsoft Basic Render Driver" is the Windows one.
 */
const SOFTWARE_RASTERISER_PATTERN =
  /swiftshader|llvmpipe|softpipe|basic render|generic renderer|software adapter|microsoft basic/i;

export type AdapterHint = 'high-performance' | 'low-power' | 'unhinted';

export type AdapterProbe = Readonly<{
  hint: AdapterHint;
  /**
   * `adapter` - one was returned; `null` - the browser offered none; `error` -
   * the call itself threw or never answered.
   */
  outcome: 'adapter' | 'null' | 'error';
  detail: string;
  fallbackAdapter: boolean;
}>;

export type WebGl2Observation = Readonly<{
  contextCreated: boolean;
  renderer: string | null;
  vendor: string | null;
  /** False when WEBGL_debug_renderer_info is unavailable and the masked strings were read instead. */
  debugRendererInfoExposed: boolean;
  failure: string | null;
}>;

export type WebGpuDiagnosticsReport = Readonly<{
  navigatorGpuPresent: boolean;
  adapterProbes: readonly AdapterProbe[];
  /** True when a re-probe DID get an adapter, which makes the startup failure transient. */
  anyAdapterAcquired: boolean;
  webgl2: WebGl2Observation;
  /** True only when WebGL2 named a renderer and that renderer is a CPU rasteriser. */
  softwareRasteriser: boolean;
  secureContext: boolean;
  crossOriginIsolated: boolean;
  browser: string;
  platform: string;
  userAgent: string;
}>;

type AdapterLike = Readonly<{
  info?: Readonly<Record<string, unknown>>;
  isFallbackAdapter?: boolean;
  requestAdapterInfo?: () => Promise<Readonly<Record<string, unknown>>>;
}>;

type ProbeGpu = Readonly<{
  requestAdapter(
    options?: Readonly<{ powerPreference?: 'high-performance' | 'low-power' }>,
  ): Promise<AdapterLike | null>;
}>;

type WebGl2Like = Readonly<{
  getExtension(name: string): unknown;
  getParameter(pname: number): unknown;
}>;

/**
 * Everything the collector is allowed to touch, injected so the whole diagnosis
 * is testable without a browser - the one place a bug here would be invisible
 * is exactly the place this code runs.
 */
export type DiagnosticsEnvironment = Readonly<{
  gpu: ProbeGpu | null;
  createWebGl2Context: () => WebGl2Like | null;
  isSecureContext: boolean;
  crossOriginIsolated: boolean;
  userAgent: string;
  brands: readonly string[];
  platform: string;
  probeTimeoutMs?: number;
}>;

type GlobalScopeShape = Readonly<{
  navigator?: Readonly<{
    gpu?: ProbeGpu;
    userAgent?: string;
    userAgentData?: Readonly<{
      brands?: readonly Readonly<{ brand?: string; version?: string }>[];
      platform?: string;
    }>;
    platform?: string;
  }>;
  document?: Readonly<{ createElement?: (tag: string) => unknown }>;
  isSecureContext?: boolean;
  crossOriginIsolated?: boolean;
}>;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const PROBE_TIMED_OUT = Symbol('probe-timed-out');

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T | typeof PROBE_TIMED_OUT> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof PROBE_TIMED_OUT>((resolve) => {
        handle = setTimeout(() => resolve(PROBE_TIMED_OUT), timeoutMs);
      }),
    ]);
  } finally {
    if (handle !== undefined) clearTimeout(handle);
  }
}

function describeAdapter(adapter: AdapterLike, info: Readonly<Record<string, unknown>>): string {
  const parts = ['vendor', 'architecture', 'device', 'description']
    .map((key) => (typeof info[key] === 'string' ? String(info[key]).trim() : ''))
    .filter((value) => value.length > 0);
  const label = parts.length > 0 ? parts.join(' ') : 'adapter returned (no adapter info exposed)';
  return adapter.isFallbackAdapter === true ? `${label} [fallback/software adapter]` : label;
}

async function probeAdapter(gpu: ProbeGpu, hint: AdapterHint, timeoutMs: number): Promise<AdapterProbe> {
  try {
    const request = hint === 'unhinted'
      ? gpu.requestAdapter()
      : gpu.requestAdapter({ powerPreference: hint });
    const adapter = await withTimeout(Promise.resolve(request), timeoutMs);
    if (adapter === PROBE_TIMED_OUT) {
      return { hint, outcome: 'error', detail: `no answer within ${timeoutMs} ms`, fallbackAdapter: false };
    }
    if (!adapter) {
      return { hint, outcome: 'null', detail: 'null - the browser offered no adapter', fallbackAdapter: false };
    }
    const info = adapter.info
      ?? await Promise.resolve(adapter.requestAdapterInfo?.()).catch(() => undefined)
      ?? {};
    return {
      hint,
      outcome: 'adapter',
      detail: describeAdapter(adapter, info),
      fallbackAdapter: adapter.isFallbackAdapter === true,
    };
  } catch (error) {
    return { hint, outcome: 'error', detail: `threw ${messageOf(error)}`, fallbackAdapter: false };
  }
}

function readGlString(gl: WebGl2Like, parameterName: number): string | null {
  try {
    const value = gl.getParameter(parameterName);
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * WebGL2 is the control experiment. It answers "does this browser have working
 * hardware acceleration at all", which is the single question that decides
 * whether the problem is the browser's acceleration settings or WebGPU alone.
 */
export function observeWebGl2(environment: DiagnosticsEnvironment): WebGl2Observation {
  let gl: WebGl2Like | null = null;
  try {
    gl = environment.createWebGl2Context();
  } catch (error) {
    return {
      contextCreated: false,
      renderer: null,
      vendor: null,
      debugRendererInfoExposed: false,
      failure: messageOf(error),
    };
  }
  if (!gl) {
    return {
      contextCreated: false,
      renderer: null,
      vendor: null,
      debugRendererInfoExposed: false,
      failure: 'no WebGL2 context could be created',
    };
  }
  let debugInfo: unknown = null;
  try {
    debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  } catch {
    debugInfo = null;
  }
  const exposed = Boolean(debugInfo);
  // Without the extension the masked strings are still worth having: modern
  // Chrome reports the real device through plain RENDERER in many builds.
  const renderer = exposed ? readGlString(gl, UNMASKED_RENDERER_WEBGL) : readGlString(gl, GL_RENDERER);
  const vendor = exposed ? readGlString(gl, UNMASKED_VENDOR_WEBGL) : readGlString(gl, GL_VENDOR);
  return { contextCreated: true, renderer, vendor, debugRendererInfoExposed: exposed, failure: null };
}

/** Reads the live browser. Never throws: a diagnostic that dies explains nothing. */
export function browserDiagnosticsEnvironment(): DiagnosticsEnvironment {
  const scope = globalThis as unknown as GlobalScopeShape;
  const navigatorShape = scope.navigator;
  const agentData = navigatorShape?.userAgentData;
  const brands = (agentData?.brands ?? [])
    .map((entry) => `${entry.brand ?? ''} ${entry.version ?? ''}`.trim())
    .filter((entry) => entry.length > 0);
  return {
    gpu: navigatorShape?.gpu ?? null,
    createWebGl2Context: () => {
      const createElement = scope.document?.createElement;
      if (typeof createElement !== 'function') return null;
      const canvas = createElement.call(scope.document, 'canvas') as HTMLCanvasElement;
      canvas.width = 1;
      canvas.height = 1;
      return canvas.getContext('webgl2') as WebGl2Like | null;
    },
    isSecureContext: scope.isSecureContext === true,
    crossOriginIsolated: scope.crossOriginIsolated === true,
    userAgent: navigatorShape?.userAgent ?? 'unknown',
    brands,
    platform: agentData?.platform ?? navigatorShape?.platform ?? 'unknown',
  };
}

/**
 * Asks the browser every question the page is allowed to ask, in the order that
 * makes the answers a diagnosis. Runs ONLY after adapter acquisition has
 * already failed.
 */
export async function collectWebGpuDiagnostics(
  environment: DiagnosticsEnvironment = browserDiagnosticsEnvironment(),
): Promise<WebGpuDiagnosticsReport> {
  const timeoutMs = environment.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const gpu = environment.gpu;
  const adapterProbes: AdapterProbe[] = [];
  if (gpu) {
    // Sequential on purpose: three concurrent adapter requests against a GPU
    // process that is already misbehaving would measure the queue rather than
    // the browser's answer for each hint.
    for (const hint of ['high-performance', 'low-power', 'unhinted'] as const) {
      adapterProbes.push(await probeAdapter(gpu, hint, timeoutMs));
    }
  }
  const webgl2 = observeWebGl2(environment);
  const browser = environment.brands.length > 0 ? environment.brands.join(', ') : environment.userAgent;
  return {
    navigatorGpuPresent: Boolean(gpu),
    adapterProbes,
    anyAdapterAcquired: adapterProbes.some((probe) => probe.outcome === 'adapter'),
    webgl2,
    softwareRasteriser: webgl2.renderer !== null && SOFTWARE_RASTERISER_PATTERN.test(webgl2.renderer),
    secureContext: environment.isSecureContext,
    crossOriginIsolated: environment.crossOriginIsolated,
    browser,
    platform: environment.platform,
    userAgent: environment.userAgent,
  };
}

/**
 * Advice DERIVED from the observations above, never a generic checklist. Every
 * line is gated on something the page actually saw, because advice the
 * observations do not support is how a player ends up reinstalling a graphics
 * driver for a problem that lives in a browser setting.
 */
export function deriveWebGpuNextSteps(report: WebGpuDiagnosticsReport): readonly string[] {
  const steps: string[] = [];
  if (!report.navigatorGpuPresent) {
    if (!report.secureContext) {
      steps.push(
        'This page is not a secure context, and browsers only expose WebGPU on https:// or on localhost. '
        + 'Open the game over https:// (or http://localhost) and it should appear.',
      );
    } else {
      steps.push(
        'This browser does not expose WebGPU at all (navigator.gpu is missing), so no GPU was ever asked for. '
        + 'Use an up-to-date Chrome or Edge (113 or newer), or Firefox on Windows, and check the browser is not '
        + 'running with WebGPU explicitly disabled.',
      );
    }
    // Any adapter advice here would be fiction: no adapter request was made.
    return steps;
  }

  if (report.anyAdapterAcquired) {
    const working = report.adapterProbes
      .filter((probe) => probe.outcome === 'adapter')
      .map((probe) => probe.hint);
    steps.push(
      `An adapter IS available right now (${working.join(', ')}), even though startup could not get one. `
      + 'That makes this a transient GPU-process failure rather than a missing capability: reload the page '
      + '(Ctrl+Shift+R). If reloading keeps failing, quit the browser completely and reopen it.',
    );
    return steps;
  }

  if (report.softwareRasteriser) {
    steps.push(
      `WebGL reports a software renderer (${report.webgl2.renderer ?? 'unknown'}), so this browser is drawing on the CPU `
      + 'and has no GPU to hand to WebGPU. Hardware acceleration is switched off or blocklisted in the BROWSER - this is '
      + 'not a problem with the game or with the machine. In Chrome: chrome://settings/system, turn on "Use graphics '
      + 'acceleration when available", then quit the browser completely and reopen it. chrome://gpu confirms it once '
      + 'WebGL stops naming a software renderer.',
    );
  } else if (report.webgl2.contextCreated && report.webgl2.renderer !== null) {
    steps.push(
      `WebGL2 is running on a real GPU here (${report.webgl2.renderer}), so acceleration works in this browser and only `
      + 'WebGPU cannot get an adapter. That points at the state of this running browser instance, not at the hardware. '
      + 'Quit the browser COMPLETELY - every window, plus any copy still running in the tray or as a background app - '
      + 'then reopen it and load the game again.',
    );
    steps.push(
      'If a completely fresh instance works and this one does not, the difference is in this profile or session: try the '
      + 'same link in a Guest window, or with extensions disabled, to separate a profile problem from a machine problem.',
    );
  } else if (report.webgl2.contextCreated) {
    steps.push(
      'WebGL2 works but this browser will not name its renderer, so acceleration is present in some form while WebGPU '
      + 'still gets no adapter. Quit the browser completely (including background and tray copies) and reopen it before '
      + 'looking any further.',
    );
  } else {
    steps.push(
      `No WebGL2 context could be created either (${report.webgl2.failure ?? 'unknown reason'}). This browser cannot get `
      + 'ANY accelerated graphics context, which means acceleration is disabled or blocked browser-wide rather than '
      + 'WebGPU being at fault. Re-enable graphics acceleration in the browser settings and restart it.',
    );
  }

  if (report.adapterProbes.length > 0 && report.adapterProbes.every((probe) => probe.outcome === 'error')) {
    steps.push(
      'Every adapter request failed outright instead of returning null, which is a fault inside the browser\'s own WebGPU '
      + 'implementation: the exact text is on the adapter lines above and is worth passing on unedited.',
    );
  }
  return steps;
}

function adapterProbeLine(probe: AdapterProbe): string {
  const call = probe.hint === 'unhinted'
    ? 'requestAdapter() unhinted'
    : `requestAdapter({ powerPreference: '${probe.hint}' })`;
  return `  ${call}: ${probe.detail}`;
}

/**
 * The observations alone. Split out from the full block because the failure
 * screen shows the derived steps as ordinary readable text and keeps this part
 * in a scrollable monospace panel - the advice must never be the half that ends
 * up below the fold.
 */
export function formatWebGpuObservations(report: WebGpuDiagnosticsReport): string {
  const lines: string[] = [];
  lines.push('NUKE TOWN - WEBGPU DIAGNOSTICS');
  lines.push('');
  lines.push('WHAT THIS PAGE CAN SEE (re-probed after the renderer failed to start)');
  lines.push(`  navigator.gpu: ${report.navigatorGpuPresent ? 'present' : 'ABSENT - this browser exposes no WebGPU'}`);
  if (report.adapterProbes.length === 0) {
    lines.push('  adapter requests: not attempted - there is no navigator.gpu to ask');
  } else {
    for (const probe of report.adapterProbes) lines.push(adapterProbeLine(probe));
  }
  lines.push(
    `  WebGL2 context: ${report.webgl2.contextCreated
      ? 'created'
      : `NOT created - ${report.webgl2.failure ?? 'unknown reason'}`}`,
  );
  lines.push(`  WebGL2 UNMASKED_RENDERER_WEBGL: ${report.webgl2.renderer ?? 'unavailable'}`);
  lines.push(`  WebGL2 UNMASKED_VENDOR_WEBGL: ${report.webgl2.vendor ?? 'unavailable'}`);
  lines.push(
    `  WEBGL_debug_renderer_info: ${report.webgl2.debugRendererInfoExposed
      ? 'exposed'
      : 'not exposed (the renderer and vendor above are the masked strings)'}`,
  );
  lines.push(
    `  software rasteriser: ${report.softwareRasteriser
      ? 'YES - WebGL is drawing on the CPU, not on a GPU'
      : 'no'}`,
  );
  lines.push(`  isSecureContext: ${report.secureContext}`);
  lines.push(`  crossOriginIsolated: ${report.crossOriginIsolated} (not required for WebGPU; recorded only to rule it out)`);
  lines.push(`  browser: ${report.browser}`);
  lines.push(`  platform: ${report.platform}`);
  lines.push(`  userAgent: ${report.userAgent}`);
  return lines.join('\n');
}

/** Plain text, meant to be selected and pasted to whoever is helping. */
export function formatWebGpuDiagnostics(report: WebGpuDiagnosticsReport): string {
  const lines = [formatWebGpuObservations(report), '', 'WHAT TO TRY (derived from the observations above, nothing else)'];
  const steps = deriveWebGpuNextSteps(report);
  if (steps.length === 0) {
    lines.push('  No conclusion can be drawn from these observations. Send this block on as it is.');
  } else {
    steps.forEach((step, index) => lines.push(`  ${index + 1}. ${step}`));
  }
  return lines.join('\n');
}

/** Carries the finished report on the thrown error so the failure screen can show it. */
export function attachWebGpuDiagnostics(error: Error, report: WebGpuDiagnosticsReport): Error {
  Object.defineProperty(error, DIAGNOSTICS_ERROR_KEY, {
    value: report,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return error;
}

/** Null for any error that is not a diagnosed WebGPU failure - no invented diagnoses. */
export function webGpuDiagnosticsFromError(error: unknown): WebGpuDiagnosticsReport | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = (error as Record<string, unknown>)[DIAGNOSTICS_ERROR_KEY];
  if (typeof candidate !== 'object' || candidate === null) return null;
  return candidate as WebGpuDiagnosticsReport;
}
