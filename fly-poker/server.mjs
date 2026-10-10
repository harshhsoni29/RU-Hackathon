import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash'];
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

async function generate(model, key, prompt, mode) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  const headers = { 'content-type': 'application/json' };
  if (mode === 'query') url.searchParams.set('key', key);
  else headers['x-goog-api-key'] = key;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 512,
        temperature: 0.4,
        thinkingConfig: { thinkingBudget: 0 },
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
    'Reply with one or two plain sentences.',
    '',
    facts.join('\n'),
  ].join('\n');
  let last = 'narrate failed';
  for (const model of MODELS) {
    for (const mode of ['header', 'query']) {
      let result;
      try {
        result = await generate(model, key, prompt, mode);
      } catch (error) {
        last = scrub(error?.message || error, key);
        continue;
      }
      if (result.ok && result.text) return { text: result.text, model };
      last = result.message || `Gemini ${result.status}`;
      if (result.status === 404) break;
    }
  }
  throw new Error(last);
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
      const result = await narrate(facts);
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
