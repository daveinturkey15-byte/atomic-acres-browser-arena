const MISSING_VERTEX_ATTRIBUTE = /THREE\.AttributeNode:\s*Vertex attribute "[^"]+" not found on geometry\./;

/**
 * Three reports missing WebGPU vertex inputs as console warnings rather than
 * exceptions. They still mean a visible material/geometry contract is broken,
 * so native candidate gates must promote them to release-blocking failures.
 */
export function isFatalWebGpuConsoleWarning(message: string): boolean {
  return MISSING_VERTEX_ATTRIBUTE.test(message);
}
