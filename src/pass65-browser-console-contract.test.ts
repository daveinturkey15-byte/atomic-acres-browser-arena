import { describe, expect, it } from 'vitest';
import { isFatalWebGpuConsoleWarning } from '../scripts/qa/pass65-browser-console-contract';

describe('Pass 65 native WebGPU console contract', () => {
  it('fails closed on missing geometry attributes reported as Three warnings', () => {
    expect(isFatalWebGpuConsoleWarning('THREE.AttributeNode: Vertex attribute "uv" not found on geometry.')).toBe(true);
    expect(isFatalWebGpuConsoleWarning('THREE.AttributeNode: Vertex attribute "color" not found on geometry.')).toBe(true);
  });

  it('does not promote unrelated browser warnings', () => {
    expect(isFatalWebGpuConsoleWarning('A preload was not used shortly after load.')).toBe(false);
  });
});
