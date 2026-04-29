// =====================================================================
//  AETHERMORPH WORKER · v2
//  A tiny Cloudflare Worker that proxies image generation requests
//  to Cloudflare Workers AI, with CORS enabled so a browser can call it.
//
//  After deploying this Worker, paste its URL into Aethermorph's settings.
// =====================================================================

const ALLOWED_MODELS = {
  'flux-schnell': '@cf/black-forest-labs/flux-1-schnell',
  'flux-2-klein': '@cf/black-forest-labs/flux-2-klein-4b',
  'lucid-origin': '@cf/leonardo/lucid-origin',
  'phoenix':      '@cf/leonardo/phoenix-1.0',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
};

function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Convert ANY of the response shapes Cloudflare AI returns into base64.
async function toBase64(result) {
  // Shape 1: object with `.image` field (already base64)
  if (result && typeof result === 'object' && typeof result.image === 'string') {
    return result.image;
  }
  // Shape 2: a Response object (newer models)
  if (result instanceof Response) {
    const buf = await result.arrayBuffer();
    return arrayBufferToBase64(buf);
  }
  // Shape 3: a ReadableStream (some Flux variants)
  if (result instanceof ReadableStream) {
    const reader = result.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    return arrayBufferToBase64(merged.buffer);
  }
  // Shape 4: ArrayBuffer or Uint8Array directly
  if (result instanceof ArrayBuffer) {
    return arrayBufferToBase64(result);
  }
  if (result instanceof Uint8Array) {
    return arrayBufferToBase64(result.buffer);
  }
  // Shape 5: object with .body that's a stream/arraybuffer
  if (result && result.body) {
    if (result.body instanceof ReadableStream) {
      return toBase64(result.body);
    }
  }
  return null;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/ping')) {
      return jsonResp({ ok: true, service: 'aethermorph-worker', version: 2 });
    }

    if (request.method !== 'POST') {
      return jsonResp({ error: 'use POST' }, 405);
    }

    if (!env.AI) {
      return jsonResp({ error: 'AI binding missing — add it in worker settings' }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResp({ error: 'invalid JSON body' }, 400);
    }

    const modelKey = body.model || 'flux-schnell';
    const modelId = ALLOWED_MODELS[modelKey];
    if (!modelId) {
      return jsonResp({ error: 'unknown model: ' + modelKey }, 400);
    }
    if (!body.prompt || typeof body.prompt !== 'string') {
      return jsonResp({ error: 'prompt is required' }, 400);
    }

    const aiInput = {
      prompt: body.prompt,
      seed: Number.isFinite(body.seed) ? Math.floor(body.seed) : Math.floor(Math.random() * 1e6),
      steps: Number.isFinite(body.steps) ? Math.max(1, Math.min(12, body.steps)) : 4,
      width:  Number.isFinite(body.width)  ? body.width  : 1024,
      height: Number.isFinite(body.height) ? body.height : 576,
    };

    try {
      const result = await env.AI.run(modelId, aiInput);
      const base64 = await toBase64(result);
      if (!base64) {
        // Build a helpful debug message so we can see what shape arrived
        const shape = result === null ? 'null'
                    : result === undefined ? 'undefined'
                    : typeof result === 'object' ? `object keys: ${Object.keys(result).join(',') || '(none)'}`
                    : typeof result;
        return jsonResp({ error: 'unexpected AI response shape: ' + shape }, 500);
      }
      return jsonResp({ image: base64, model: modelKey, seed: aiInput.seed });
    } catch (e) {
      return jsonResp({ error: 'AI call failed: ' + (e?.message || String(e)) }, 502);
    }
  },
};

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Process in chunks to avoid call-stack overflow on large images
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
