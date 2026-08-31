'use strict';
// Shared provider router for all four Dagestan services.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PROXY_POOL = { openrouter: [], nvidia: [], zen: [] };
const PROXY_IDX = { openrouter: 0, nvidia: 0, zen: 0 };

const PROXY_URLS = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  nvidia:     'https://integrate.api.nvidia.com/v1/chat/completions',
  zen:        'https://opencode.ai/zen/v1/chat/completions',
};

function loadProxySecrets() {
  try {
    const candidates = [
      path.join(process.cwd(), 'secrets.local.json'),
      path.join(process.env.HOME || '/root', 'dagestan', 'secrets.local.json'),
    ];
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue;
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const [provider, keys] of Object.entries(j.providers || {})) {
        const list = (keys || []).map(k => k.key).filter(Boolean);
        if (list.length === 0) continue;
        if (PROXY_POOL[provider]) PROXY_POOL[provider] = list;
      }
      return;
    }
  } catch (e) { /* ignore */ }
}

function proxyUrlForModel(model) {
  if (!model) return null;
  if (model === 'openrouter/free') return { url: PROXY_URLS.openrouter, provider: 'openrouter', headers: { 'HTTP-Referer': 'https://dagestan.app', 'X-Title': 'Dagestan' } };
  if (model.startsWith('openrouter/')) return { url: PROXY_URLS.openrouter, provider: 'openrouter', headers: { 'HTTP-Referer': 'https://dagestan.app', 'X-Title': 'Dagestan' } };
  if (model.startsWith('nvidia/') || model.startsWith('meta/') || model.startsWith('deepseek-ai/') || model.startsWith('qwen/') || model.startsWith('tencent/') || model.startsWith('google/') || model.startsWith('minimax/')) {
    return { url: PROXY_URLS.nvidia, provider: 'nvidia', headers: {} };
  }
  if (['big-pickle', 'x-preview-f-free', 'mimo-v2.5-free', 'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free'].includes(model)) {
    return { url: PROXY_URLS.zen, provider: 'zen', headers: {} };
  }
  return null;
}

function pickNextKey(provider) {
  const pool = PROXY_POOL[provider];
  if (!pool || pool.length === 0) return null;
  for (let i = 0; i < pool.length; i += 1) {
    PROXY_IDX[provider] = (PROXY_IDX[provider] + 1) % pool.length;
    const k = pool[PROXY_IDX[provider]];
    if (k) return k;
  }
  return null;
}

function proxyUpstreamChat(payload, target, key) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ ...payload, stream: false });
    const u = new URL(target.url);
    const mod = u.protocol === 'https:' ? https : http;
    const r = mod.request({
      method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname,
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        'Authorization': 'Bearer ' + key, ...(target.headers || {}),
      },
    }, (resp) => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => resolve({ status: resp.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      resp.on('error', reject);
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

function proxyUpstreamStream(payload, target, key, socket) {
  const body = JSON.stringify({ ...payload, stream: true });
  const u = new URL(target.url);
  const mod = u.protocol === 'https:' ? https : http;
  const r = mod.request({
    method: 'POST', hostname: u.hostname, port: u.port || 443, path: u.pathname,
    headers: {
      'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
      'Authorization': 'Bearer ' + key, ...(target.headers || {}),
    },
  }, (resp) => {
    if (resp.statusCode !== 200) {
      try { socket.write('data: {"error":{"message":"upstream ' + resp.statusCode + '"}}\n\ndata: [DONE]\n\n'); } catch {}
      return;
    }
    resp.pipe(socket);
  });
  r.on('error', e => { try { socket.write('data: {"error":{"message":"' + e.message + '"}}\n\ndata: [DONE]\n\n'); } catch {} });
  r.write(body);
  r.end();
}

function routeProxyChat(payload, res, isStream, corsHdr) {
  const target = proxyUrlForModel(payload.model);
  const pool = target ? PROXY_POOL[target.provider] : [];
  const safeJson = (code, obj) => {
    try {
      const headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHdr || {});
      res.writeHead(code, headers);
      res.end(JSON.stringify(obj));
    } catch {}
  };
  if (!target) return { fallthrough: true };
  if (pool.length === 0) return { fallthrough: true };
  const tryKey = (i) => {
    if (i >= pool.length) {
      const msg = 'all upstream keys failed';
      if (isStream) { try { res.write('data: {"error":{"message":"' + msg + '"}}\n\ndata: [DONE]\n\n'); res.end(); } catch {} }
      else { safeJson(502, { error: { message: msg } }); }
      return;
    }
    const key = pool[i];
    const ks = typeof key === 'string' ? key.slice(0, 8) : '<none>';
    console.log('[router] trying key#' + i + ' startsWith=' + ks + ' model=' + payload.model + ' provider=' + target.provider);
    if (isStream) {
      try {
        const headers = Object.assign({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' }, corsHdr || {});
        res.writeHead(200, headers);
        proxyUpstreamStream(payload, target, key, res);
      } catch { tryKey(i + 1); }
    } else {
      proxyUpstreamChat(payload, target, key).then(r => {
        const preview = typeof r.body === 'string' ? r.body.slice(0, 120) : '<no body>';
        console.log('[router] upstream status=' + r.status + ' key#' + i + ' provider=' + target.provider + ' body=' + preview);
        if (r.status >= 200 && r.status < 300) { safeJson(200, JSON.parse(r.body || '{}')); }
        else { tryKey(i + 1); }
      }).catch(() => tryKey(i + 1));
    }
  };
  tryKey(0);
  return { handled: true };
}

function poolSummary() {
  return { openrouter: PROXY_POOL.openrouter.length, nvidia: PROXY_POOL.nvidia.length, zen: PROXY_POOL.zen.length };
}

loadProxySecrets();

module.exports = { loadProxySecrets, proxyUrlForModel, proxyUpstreamChat, proxyUpstreamStream, routeProxyChat, pickNextKey, poolSummary, PROXY_POOL };
