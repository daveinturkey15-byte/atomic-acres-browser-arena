import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  MATCH_DIAGNOSTIC_MAX_BODY_BYTES,
  validateMatchDiagnosticEnvelope,
} from '../../shared/match-diagnostics-schema';

function localOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

function respond(response: ServerResponse, status: number, body: unknown, origin?: string): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin && localOrigin(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.end(JSON.stringify(body));
}

async function readBoundedBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MATCH_DIAGNOSTIC_MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createPass64DiagnosticsCollector(outputFile = resolve(process.cwd(), 'artifacts', 'pass64', 'match-diagnostics.jsonl')) {
  const receipts = new Map<string, string>();
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (!localOrigin(origin)) return respond(response, 403, { error: 'localhost origin required' });
    if (request.method !== 'POST' || request.url !== '/v1/match-diagnostics') return respond(response, 404, { error: 'not found' }, origin);
    if (!request.headers['content-type']?.toLowerCase().startsWith('text/plain')) {
      return respond(response, 415, { error: 'content type must be text/plain' }, origin);
    }
    try {
      const text = await readBoundedBody(request);
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return respond(response, 400, { error: 'invalid JSON' }, origin); }
      const validated = validateMatchDiagnosticEnvelope(parsed);
      if (!validated.envelope) return respond(response, 400, { error: validated.error }, origin);
      const existingReceipt = receipts.get(validated.envelope.idempotencyKey);
      if (existingReceipt) return respond(response, 200, { accepted: true, idempotent: true, receiptId: existingReceipt }, origin);
      const receiptId = `local_md_${randomUUID().replaceAll('-', '')}`;
      await mkdir(dirname(outputFile), { recursive: true });
      await appendFile(outputFile, `${JSON.stringify({ receiptId, receivedAt: new Date().toISOString(), envelope: validated.envelope })}\n`, 'utf8');
      receipts.set(validated.envelope.idempotencyKey, receiptId);
      return respond(response, 201, { accepted: true, idempotent: false, receiptId }, origin);
    } catch (error) {
      if (error instanceof Error && error.message === 'body too large') return respond(response, 413, { error: error.message }, origin);
      return respond(response, 500, { error: 'collector unavailable' }, origin);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = '127.0.0.1';
  const port = Math.min(65_535, Math.max(1_024, Number(process.env.PASS64_DIAGNOSTICS_PORT) || 8_790));
  const outputFile = resolve(process.cwd(), 'artifacts', 'pass64', 'match-diagnostics.jsonl');
  const server = createPass64DiagnosticsCollector(outputFile);
  server.listen(port, host, () => {
    console.log(`[pass64-diagnostics] listening on http://${host}:${port}`);
    console.log(`[pass64-diagnostics] validated JSONL output: ${outputFile}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
