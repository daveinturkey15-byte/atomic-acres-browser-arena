// Adapter: the local Qwen vision server on 127.0.0.1:8090 (llama-server,
// OpenAI-compatible). Free and quota-less, which makes it the right route for
// the pre-critic triage pass - did this capture even show the subject, is it
// black, did the arena load - before spending a metered call.
//
// HAZARDS THIS ADAPTER IS BUILT AGAINST:
//  - WDDM silent VRAM spill: a model that does not fit loads ANYWAY and pages
//    to system RAM at ~2 tok/s with one warning line and nothing visible in
//    nvidia-smi. So: a generous timeout, and the elapsed time is journalled so
//    a spill shows up as a number rather than as "it felt slow".
//  - The daemon on this machine has previously been a different server than
//    expected on a shared port. available() reports the model id the server
//    actually names, so the journal records what answered, not what we assumed.
//  - Exit 0 is not success: the response body is scanned for failure markers.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { toDataUri } from '../image.mjs';
import { scanForFailure } from './index.mjs';

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8090';
export const DEFAULT_TIMEOUT_MS = 900_000;
// This is a REASONING model: it spends completion budget inside
// reasoning_content before it writes a single character of the answer. At
// max_tokens 2400 the first real critic call returned HTTP 200,
// finish_reason "length", and an EMPTY content string after five minutes -
// 2400 completion tokens all consumed by thinking. 8192 matches the maxTokens
// this machine's provider config declares for the model.
export const DEFAULT_MAX_TOKENS = 8192;
// NOT A SECRET. The local llama-server refuses an unauthenticated POST with
// {"error":{"message":"Invalid API Key","code":401}} while still answering an
// unauthenticated GET /v1/models, which is why the first real call failed in
// 27 ms with a 401 that looked like a route problem. The value this machine's
// provider config uses for the loopback server is the placeholder string
// "local". Override with LOOP_QWEN_API_KEY if a real key is ever put in front
// of it; a real key must come from the environment and must never be written
// into this file.
export const DEFAULT_API_KEY = 'local';

export function createQwenLocalAdapter({
  baseUrl = DEFAULT_BASE_URL,
  model = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxTokens = DEFAULT_MAX_TOKENS,
  apiKey = process.env.LOOP_QWEN_API_KEY ?? DEFAULT_API_KEY,
} = {}) {
  const authHeaders = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  return {
    id: 'qwen-local',
    kind: 'vision',
    describe: () => `local llama-server vision at ${baseUrl}${model ? ` (model ${model})` : ' (server default model)'}`,

    async available() {
      try {
        const response = await fetch(`${baseUrl}/v1/models`, { headers: authHeaders, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) return { ok: false, detail: `GET /v1/models returned ${response.status}` };
        const body = await response.json();
        const first = body?.data?.[0];
        const capabilities = body?.models?.[0]?.capabilities ?? [];
        return {
          ok: true,
          detail: `model ${first?.id ?? 'unknown'}, capabilities ${capabilities.join('+') || 'unreported'}`,
          model: first?.id ?? null,
          multimodal: capabilities.includes('multimodal'),
        };
      } catch (error) {
        return { ok: false, detail: `${error.name}: ${error.message}` };
      }
    },

    async critique({ text, images = [], jsonText = null, timeoutMs: callTimeout = timeoutMs }) {
      const started = Date.now();
      const content = [];
      for (const image of images) content.push({ type: 'image_url', image_url: { url: await toDataUri(image) } });
      const prompt = jsonText ? `${text}\n\nMEASUREMENT JSON:\n${jsonText}` : text;
      content.push({ type: 'text', text: prompt });
      let response;
      try {
        response = await postJson(`${baseUrl}/v1/chat/completions`, authHeaders, {
          model: model ?? undefined,
          messages: [{ role: 'user', content }],
          temperature: 0,
          max_tokens: maxTokens,
          stream: false,
        }, callTimeout);
      } catch (error) {
        return { ok: false, raw: null, text: null, route: this.id, meta: { elapsedMs: Date.now() - started, error: `${error.name}: ${error.message}` } };
      }
      const bodyText = response.body;
      const elapsedMs = Date.now() - started;
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, raw: bodyText, text: null, route: this.id, meta: { elapsedMs, httpStatus: response.status } };
      }
      let body;
      try { body = JSON.parse(bodyText); } catch {
        return { ok: false, raw: bodyText, text: null, route: this.id, meta: { elapsedMs, error: 'response was not JSON' } };
      }
      const choice = body?.choices?.[0];
      const answer = choice?.message?.content ?? '';
      const finishReason = choice?.finish_reason ?? null;
      // reasoning_content is NEVER used as the answer. An answer scraped out of
      // unfinished thinking is exactly the "believe the model's prose" failure
      // this loop exists to close; it is carried only so a truncation is
      // diagnosable from the journal.
      const reasoningChars = (choice?.message?.reasoning_content ?? '').length;
      let marker = scanForFailure(body?.error ?? '');
      if (!marker && answer.length === 0) {
        marker = finishReason === 'length'
          ? `truncated-before-answer (finish_reason=length, ${reasoningChars} chars of reasoning, max_tokens=${maxTokens})`
          : 'empty response';
      }
      return {
        ok: marker === null && answer.length > 0,
        raw: bodyText,
        text: answer,
        route: this.id,
        meta: {
          elapsedMs,
          httpStatus: response.status,
          model: body?.model ?? null,
          usage: body?.usage ?? null,
          failureMarker: marker,
          finishReason,
          reasoningChars,
          images: images.length,
        },
      };
    },
  };
}

/**
 * POST JSON over node:http rather than fetch.
 *
 * WHY NOT fetch. Node's built-in fetch is undici, whose headersTimeout is 300
 * seconds and is NOT configurable without adding the undici package as a
 * dependency. This model spends more than five minutes on a full critic prompt,
 * so every real call died at exactly 305 s with "TypeError: fetch failed" -
 * a transport timeout that reads like a dead server. node:http lets the timeout
 * be the one the caller asked for.
 */
function postJson(url, headers, payload, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const target = new URL(url);
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': body.length, ...headers },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, body: text }));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`local vision route exceeded ${timeoutMs} ms`));
    });
    req.on('error', rejectPromise);
    req.end(body);
  });
}
