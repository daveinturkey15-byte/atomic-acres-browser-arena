import { afterEach, describe, expect, it, vi } from 'vitest';
// `error` and `getConsoleFunction` are three's OWN helpers. Driving the real
// emitter is the whole point: a hand-rolled fake would prove that the recorder
// matches the fake, not that it matches three.
import { error, getConsoleFunction, setConsoleFunction, warn } from 'three';
import {
  TSL_NODE_BUILD_ERROR_ATTRIBUTE,
  installTslNodeBuildDiagnostics,
  type TslDiagnosticsTarget,
  type TslNodeBuildDiagnosticsHandle,
} from './render-runtime';

/**
 * HF-401 — the SWALLOWED node-build failure has to be countable.
 *
 * Three r185 wraps every synchronous node build in `Nodes.getForRender()` in a
 * try/catch. On a throw it does NOT rethrow: it rebuilds the render object
 * against a bare `NodeMaterial`, calls `error('TSL: ' + e, stackTrace)` and
 * carries on. The draw succeeds, the arena admits, and every existing gate
 * stays green while the object renders a default material.
 *
 * That is why a test asserting "the arena booted" is worth nothing here — the
 * arena booted throughout the defect. What has to be asserted is that the
 * runtime NOTICED. These cases pin the recorder against three's real emitter;
 * `scripts/qa/verify-tsl-node-build-integrity.mjs` then asserts the published
 * count is zero on a production bundle across every arena and preset.
 */
describe('HF-401 swallowed TSL node-build failures are counted', () => {
  let handle: TslNodeBuildDiagnosticsHandle | null = null;
  const target = (): TslDiagnosticsTarget => ({ dataset: {} });

  afterEach(() => {
    handle?.uninstall();
    handle = null;
    setConsoleFunction(null);
    vi.restoreAllMocks();
  });

  it('counts exactly the message three emits from its node-build catch', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dom = target();
    handle = installTslNodeBuildDiagnostics(dom);
    expect(handle.read().count).toBe(0);
    expect(dom.dataset[TSL_NODE_BUILD_ERROR_ATTRIBUTE]).toBe('0');

    // Byte-for-byte the call three makes: `error( 'TSL: ' + e, stackTrace )`,
    // where `e` is the TypeError raised by GodraysNode dereferencing
    // `light.shadow.map.depthTexture` on a light with no shadow map.
    const swallowed = new TypeError("Cannot read properties of null (reading 'depthTexture')");
    error('TSL: ' + swallowed);

    expect(handle.read().count).toBe(1);
    expect(handle.read().messages[0]).toContain('depthTexture');
    expect(handle.read().messages[0].startsWith('THREE.TSL:')).toBe(true);
    expect(dom.dataset[TSL_NODE_BUILD_ERROR_ATTRIBUTE]).toBe('1');
    // Counting it must not hide it. The developer console still gets the line.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('counts repeats, because one transition emits the same failure several times', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dom = target();
    handle = installTslNodeBuildDiagnostics(dom);
    for (let index = 0; index < 3; index += 1) {
      error('TSL: TypeError: Cannot read properties of null (reading \'depthTexture\')');
    }
    // Three distinct render objects rebuilt against the fallback material is
    // three failures, even though the message is identical. Measured: exactly
    // this count on gun-range at MAX.
    expect(handle.read().count).toBe(3);
    expect(handle.read().messages).toHaveLength(1);
    expect(dom.dataset[TSL_NODE_BUILD_ERROR_ATTRIBUTE]).toBe('3');
  });

  it('ignores everything that is not a node-build failure', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dom = target();
    handle = installTslNodeBuildDiagnostics(dom);
    warn('TSL: Member "x" does not exist in struct.');
    error('WebGPURenderer: unrelated failure');
    expect(handle.read().count).toBe(0);
    expect(dom.dataset[TSL_NODE_BUILD_ERROR_ATTRIBUTE]).toBe('0');
  });

  it('chains onto an existing console function instead of silencing it', () => {
    const upstream = vi.fn();
    setConsoleFunction(upstream);
    const dom = target();
    handle = installTslNodeBuildDiagnostics(dom);
    error('TSL: TypeError: Cannot read properties of null (reading \'depthTexture\')');
    expect(handle.read().count).toBe(1);
    expect(upstream).toHaveBeenCalledTimes(1);
    // Forwarded VERBATIM, trailing params included: three appends its own
    // stack-trace hint after the message and dropping it would degrade the
    // console output this observer is only supposed to observe.
    const [type, message, ...rest] = upstream.mock.calls[0] as [string, string, ...unknown[]];
    expect(type).toBe('error');
    expect(message).toBe("THREE.TSL: TypeError: Cannot read properties of null (reading 'depthTexture')");
    expect(rest).toEqual(['Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.']);
    handle.uninstall();
    handle = null;
    expect(getConsoleFunction()).toBe(upstream);
  });

  it('clears its own receipt on uninstall so a stale count cannot be read as fresh', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dom = target();
    handle = installTslNodeBuildDiagnostics(dom);
    error('TSL: TypeError: Cannot read properties of null (reading \'depthTexture\')');
    expect(dom.dataset[TSL_NODE_BUILD_ERROR_ATTRIBUTE]).toBe('1');
    handle.reset();
    expect(handle.read().count).toBe(0);
    expect(dom.dataset[TSL_NODE_BUILD_ERROR_ATTRIBUTE]).toBe('0');
    handle.uninstall();
    handle = null;
    expect(dom.dataset[TSL_NODE_BUILD_ERROR_ATTRIBUTE]).toBeUndefined();
  });
});
