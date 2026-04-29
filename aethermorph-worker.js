// =====================================================================
//  AETHERMORPH WORKER
//  A tiny Cloudflare Worker that proxies image generation requests
//  to Cloudflare Workers AI, with CORS enabled so a browser can call it.
//
//  After deploying this Worker, paste its URL into Aethermorph's settings.
//  That's it. No API tokens to manage in the app.
// =====================================================================

const ALLOWED_MODELS = {
  'flux-schnell': '@cf/black-forest-labs/flux-1-schnell',
  'flux-2-klein': '@cf/black-forest-labs/flux-2-klein-4b',
  'lucid-origin': '@cf/leonardo/lucid-origin',
  'phoenix':      '@cf/leonardo/phoenix-1.0',
};

// CORS headers — allow any origin so the app works whether you host
// it on GitHub Pages, your own domain, or open it from a local file.
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

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // Health check — let the app verify the Worker is alive
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/ping')) {
      return jsonResp({ ok: true, service: 'aethermorph-worker', version: 1 });
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
      // env.AI.run returns either { image: <base64> } or a Response with binary bytes
      // depending on the model. Normalize to base64 in JSON.
      let base64;
      if (result && typeof result === 'object' && result.image) {
        base64 = result.image;
      } else if (result instanceof Response) {
        const buf = await result.arrayBuffer();
        base64 = arrayBufferToBase64(buf);
      } else if (result instanceof ArrayBuffer || result instanceof Uint8Array) {
        const buf = result instanceof Uint8Array ? result.buffer : result;
        base64 = arrayBufferToBase64(buf);
      } else {
        return jsonResp({ error: 'unexpected AI response shape' }, 500);
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
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
