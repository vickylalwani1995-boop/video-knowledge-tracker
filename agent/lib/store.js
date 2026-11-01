// Persistence. One JSON document holds everything (ideas + health info) — plenty for one person.
// Production: Upstash Redis over its REST API (no extra packages). Dev/tests: a local JSON file or memory.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { normalizeUrl } from './ideas.js';

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

export async function storeFromConfig(cfg) {
  if (cfg.redisUrl && cfg.redisToken) return redisStore(cfg.redisUrl, cfg.redisToken);
  if (cfg.blobToken) return blobStore(await import('@vercel/blob'));
  return fileStore(cfg.dataFile);
}

// ── Vercel Blob (private store already attached to the Vercel project) ──────────────────────────────
const BLOB_PATH = 'data/idea-agent-state.json';
const LEGACY_BLOB_PATH = 'data/store.json'; // written by the earlier Grok-built version

async function readBlobJson(blob, path) {
  const res = await blob.get(path, { access: 'private', useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return JSON.parse(await new Response(res.stream).text());
}

export function blobStore(blob) {
  return {
    kind: 'blob',
    async load() {
      const data = await readBlobJson(blob, BLOB_PATH).catch(e => {
        if (/not.?found/i.test(e.message || e.name)) return null;
        throw e;
      });
      if (data) return normalize(data);
      // First run: bring over ideas saved by the old version, if any.
      const legacy = await readBlobJson(blob, LEGACY_BLOB_PATH).catch(() => null);
      return legacy ? migrateLegacy(legacy) : emptyState();
    },
    async save(state) {
      await blob.put(BLOB_PATH, JSON.stringify(state), {
        access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60,
      });
    },
  };
}

const LEGACY_STAGE = { saved: 'saved', testing: 'testing', building: 'building', live: 'live', earning: 'earning', archived: 'dropped' };

/** Convert the old Grok store format ({ ideas: [{ id, title, steps: [{ number, status }] }], next_id }). */
export function migrateLegacy(old) {
  const state = emptyState();
  const toMs = s => (s ? Date.parse(s) || Date.now() : Date.now());
  for (const o of old.ideas || []) {
    const n = Number(o.id) || state.ideas.length + 1;
    const url = o.source_link && /^https?:/.test(o.source_link) ? o.source_link : '';
    state.ideas.push({
      n,
      title: String(o.title || 'Idea').slice(0, 120),
      oneLiner: String(o.summary || '').slice(0, 400),
      category: String(o.category || 'other'),
      moneyScore: Math.min(10, Math.max(1, Math.round(Number(o.money_score) || 5))),
      moneyWhy: '',
      howItEarns: '',
      effort: /small|low|easy/i.test(o.effort) ? 'small' : /large|high|hard/i.test(o.effort) ? 'large' : 'medium',
      cost: '',
      firstTest: '',
      clientPitch: '',
      needsFromYou: [],
      steps: (o.steps || []).map((s, i) => ({
        n: Number(s.number) || i + 1, text: String(s.text || ''), owner: 'you',
        done: s.status === 'done', doneAt: s.done_at ? toMs(s.done_at) : null, output: s.output_text || '',
      })),
      stage: LEGACY_STAGE[String(o.stage || 'saved').toLowerCase()] || 'saved',
      revenue: 0,
      notes: o.my_note ? [{ text: o.my_note, at: toMs(o.created_at) }] : [],
      source: { urls: url ? [url] : [], keys: url ? [normalizeUrl(url)] : [], platform: url ? 'instagram' : 'text', text: o.my_note || '', hasImage: false },
      createdAt: toMs(o.created_at),
      updatedAt: toMs(o.last_touched_at || o.created_at),
      stageAt: toMs(o.last_touched_at || o.created_at),
    });
  }
  state.seq = Math.max(Number(old.next_id || 1) - 1, ...state.ideas.map(i => i.n), 0);
  state.meta.seen = (old.health?.recent_message_ids || []).slice(-300);
  state.meta.migratedFrom = 'grok-v1';
  return state;
}
