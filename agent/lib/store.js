// Persistence. One JSON document holds everything (ideas + health info) — plenty for one person.
// Production: Upstash Redis over its REST API (no extra packages). Dev/tests: a local JSON file or memory.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const KEY = 'idea-agent:state:v1';

export function emptyState() {
  return {
    version: 1,
    seq: 0,
    ideas: [],
    history: [], // last few chat turns, so "do it" / "what about the second one?" make sense
    meta: {
      createdAt: Date.now(),
      lastInboundAt: null,
      lastOutboundAt: null,
      lastBriefAt: null,
      lastError: null,
      seen: [], // WhatsApp message ids already handled (Meta retries webhooks)
    },
  };
}

function normalize(state) {
  const base = emptyState();
  if (!state || typeof state !== 'object') return base;
  return { ...base, ...state, meta: { ...base.meta, ...(state.meta || {}) } };
}

export function memoryStore(initial) {
  let data = initial ? structuredClone(initial) : null;
  return {
    kind: 'memory',
    async load() { return normalize(data && structuredClone(data)); },
    async save(state) { data = structuredClone(state); },
  };
}

export function fileStore(path) {
  return {
    kind: 'file',
    async load() {
      try { return normalize(JSON.parse(await readFile(path, 'utf8'))); }
      catch { return emptyState(); }
    },
    async save(state) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(state, null, 2));
    },
  };
}

export function redisStore(url, token, fetchImpl = fetch) {
  async function cmd(args) {
    const res = await fetchImpl(url.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Storage error ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`Storage error: ${body.error}`);
    return body.result;
  }
  return {
    kind: 'redis',
    async load() {
      const raw = await cmd(['GET', KEY]);
      return normalize(raw ? JSON.parse(raw) : null);
    },
    async save(state) { await cmd(['SET', KEY, JSON.stringify(state)]); },
  };
}

export function storeFromConfig(cfg) {
  if (cfg.redisUrl && cfg.redisToken) return redisStore(cfg.redisUrl, cfg.redisToken);
  return fileStore(cfg.dataFile);
}
