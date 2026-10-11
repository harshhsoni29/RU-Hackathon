import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function geminiKey() {
  const text = fs.readFileSync(path.join(root, '.env'), 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === 'GEMINI_KEY') return trimmed.slice(eq + 1).trim();
  }
  return '';
}

function send(res, code, body, type) {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
}

function scrub(message, key) {
  const text = String(message || 'narrate failed');
  return (key ? text.split(key).join('GEMINI_KEY') : text).slice(0, 500);
}

async function generate(model, key, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.4,
        ...(model.includes('lite') ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
      },
    }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((part) => part && !part.thought).map((part) => part.text || '').join('').trim();
  const message = data?.error?.message || data?.error?.status || '';
  return { ok: response.ok, status: response.status, text, message: scrub(message, key) };
}

async function narrate(facts) {
  const key = geminiKey();
  if (!key) throw new Error('GEMINI_KEY is missing from .env');
  const prompt = [
    'You describe how a poker-playing fruit fly\'s small learned circuit changed after one hand.',
    'Use only the facts below. Do not add numbers, synapses, or names that are not in the facts.',
    'Write for a casual viewer with no neuroscience or poker-math background: no decimals, no jargon like "synapse" or "fold-to-pressure".',
    'Say what changed in its brain in everyday words and what that means for how it will play. Reply with one or two short sentences.',
    '',
    facts.join('\n'),
  ].join('\n');
  let last = 'narrate failed';
  let tried = 0;
  for (const model of MODELS) {
    if (Date.now() < (modelCool.get(model) || 0)) continue;
    tried++;
    let result;
    try {
      result = await generate(model, key, prompt);
    } catch (error) {
      last = scrub(error?.message || error, key);
      continue;
    }
    if (result.ok && result.text) return { text: result.text, model };
    last = result.message || `Gemini ${result.status}`;
    if (OVERLOAD.has(result.status)) modelCool.set(model, Date.now() + MODEL_COOLDOWN_MS);
    else if (result.status === 401 || result.status === 403) break;
  }
  if (!tried || MODELS.every((model) => Date.now() < (modelCool.get(model) || 0))) coolUntil = Date.now() + COOLDOWN_MS;
  throw new Error(last);
}

const OVERLOAD = new Set([429, 500, 503]);
const COOLDOWN_MS = 45_000;
const MODEL_COOLDOWN_MS = 10 * 60_000;
const modelCool = new Map();
const MIN_GAP_MS = 2_500;
const cache = new Map();
let coolUntil = 0;
let lastCall = 0;
let inFlight = false;

/** Cached, one-at-a-time, spaced-out narration. Returns null when skipped so the client uses its own wording. */
async function narrateGated(facts) {
  const cacheKey = facts.join('\n');
  if (cache.has(cacheKey)) return { text: cache.get(cacheKey), model: 'cache' };
  const now = Date.now();
  if (inFlight || now < coolUntil || now - lastCall < MIN_GAP_MS) return null;
  inFlight = true;
  lastCall = now;
  try {
    const result = await narrate(facts);
    cache.set(cacheKey, result.text);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return result;
  } finally {
    inFlight = false;
  }
}

function staticFile(urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(root, rel));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (relative === '.env' || relative.endsWith(`${path.sep}.env`)) return null;
  return file;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (req.method === 'OPTIONS' && url.pathname === '/api/narrate') {
    send(res, 204, '', 'text/plain');
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/narrate') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const facts = Array.isArray(body.facts) ? body.facts.map((line) => String(line)).filter(Boolean).slice(0, 24) : [];
      if (!facts.length) {
        send(res, 400, JSON.stringify({ error: 'no facts' }), 'application/json; charset=utf-8');
        return;
      }
      const result = await narrateGated(facts);
      if (!result) {
        send(res, 429, JSON.stringify({ error: 'busy' }), 'application/json; charset=utf-8');
        return;
      }
      send(res, 200, JSON.stringify({ text: result.text, model: result.model }), 'application/json; charset=utf-8');
    } catch (error) {
      send(res, 502, JSON.stringify({ error: scrub(error?.message || error, geminiKey()) }), 'application/json; charset=utf-8');
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'method', 'text/plain');
    return;
  }
  const file = staticFile(url.pathname);
  if (!file) {
    send(res, 403, 'forbidden', 'text/plain');
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      send(res, 404, 'not found', 'text/plain');
      return;
    }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    if (req.method === 'HEAD') {
      send(res, 200, '', type);
      return;
    }
    send(res, 200, data, type);
  });
});

const port = Number(process.env.PORT) || 8766;
server.listen(port, '127.0.0.1');
