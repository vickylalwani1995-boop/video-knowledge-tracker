// Pure logic for Reel2Real — no DOM access, so it can be unit-tested with `node --test`.

export const TOPICS = [
  { id: 'aeo', name: 'AEO', color: '#f59e0b',
    keywords: ['aeo', 'answer engine', 'featured snippet', 'people also ask', 'voice search', 'zero click', 'zero-click', 'faq schema'] },
  { id: 'geo', name: 'GEO', color: '#10b981',
    keywords: ['geo', 'generative engine', 'ai overview', 'ai overviews', 'perplexity', 'llm seo', 'ai search', 'cited by ai', 'chatgpt search', 'llms.txt', 'ai citation'] },
  { id: 'seo', name: 'SEO', color: '#3b82f6',
    keywords: ['seo', 'backlink', 'backlinks', 'serp', 'keyword research', 'search console', 'gsc', 'on-page', 'technical seo', 'schema', 'sitemap', 'ranking', 'rank on google', 'internal link', 'google discover'] },
  { id: 'meta', name: 'Meta Ads', color: '#6366f1',
    keywords: ['meta ads', 'facebook ads', 'instagram ads', 'fb ads', 'andromeda', 'advantage+', 'advantage plus', 'meta pixel', 'capi', 'conversions api', 'cbo', 'abo', 'ad set', 'ads manager', 'meta algorithm'] },
  { id: 'google', name: 'Google Ads', color: '#ef4444',
    keywords: ['google ads', 'ppc', 'pmax', 'performance max', 'search ads', 'quality score', 'adwords', 'negative keyword', 'negative keywords', 'search terms', 'smart bidding', 'tcpa', 'troas'] },
  { id: 'social', name: 'Social Media', color: '#ec4899',
    keywords: ['social media', 'reels', 'reel', 'tiktok', 'linkedin', 'content calendar', 'hook', 'hooks', 'engagement', 'followers', 'carousel', 'instagram growth', 'personal brand', 'viral'] },
  { id: 'ai', name: 'AI', color: '#8b5cf6',
    keywords: ['ai', 'chatgpt', 'claude', 'gemini', 'gpt', 'llm', 'prompt', 'prompts', 'automation', 'ai agent', 'agents', 'n8n', 'make.com', 'zapier', 'mcp'] },
  { id: 'video', name: 'Video Creation', color: '#14b8a6',
    keywords: ['video editing', 'capcut', 'premiere', 'b-roll', 'broll', 'script', 'ugc', 'voiceover', 'higgsfield', 'veo', 'runway', 'kling', 'thumbnail', 'avatar video', 'ai video', 'talking head'] },
];

export const STAGES = ['saved', 'watched', 'learned'];
export const EXP_STATUSES = [
  { id: 'queued', label: 'Queued', emoji: '⏳' },
  { id: 'testing', label: 'Testing', emoji: '🧪' },
  { id: 'won', label: 'Worked', emoji: '🏆' },
  { id: 'flopped', label: "Didn't work", emoji: '🧊' },
];

export const XP = { saved: 1, watched: 2, learned: 5, applied: 10, won: 25 };
const DAY = 86400000;

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyState() {
  return { version: 1, videos: [], projects: [], experiments: [], customTopics: [] };
}

export function allTopics(state) {
  return [...TOPICS, ...(state?.customTopics || [])];
}

/** Pull the first http(s) URL out of arbitrary shared text (Instagram's share sheet puts it in `text`). */
export function extractUrl(text) {
  if (!text) return '';
  const m = String(text).match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;!?]+$/, '') : '';
}

/** Every distinct video link in a block of text (one per line, or mixed with captions). */
export function extractUrls(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const url = m[0].replace(/[),.;!?]+$/, '');
    const key = normalizeUrl(url);
    if (!seen.has(key)) { seen.add(key); out.push(url); }
  }
  return out;
}

export function detectPlatform(url) {
  const u = String(url || '').toLowerCase();
  if (/(^|\/\/|\.)instagram\.com|instagr\.am/.test(u)) return 'instagram';
  if (/(^|\/\/|\.)(youtube\.com|youtu\.be)/.test(u)) return 'youtube';
  if (/(^|\/\/|\.)tiktok\.com/.test(u)) return 'tiktok';
  if (/(^|\/\/|\.)linkedin\.com/.test(u)) return 'linkedin';
  return 'web';
}

/** Canonical form used to detect duplicates (drops tracking params like ?igsh= / ?si=). */
export function normalizeUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return String(url || '').trim(); }
  const host = parsed.hostname.replace(/^(www\.|m\.)/, '');
  const path = parsed.pathname;
  if (host === 'instagram.com' || host === 'instagr.am') {
    const m = path.match(/^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/);
    if (m) return `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/`;
  }
  if (host === 'youtu.be') {
    const id = path.slice(1).split('/')[0];
    if (id) return `https://www.youtube.com/watch?v=${id}`;
  }
  if (host === 'youtube.com') {
    const shorts = path.match(/^\/(shorts|live|embed)\/([\w-]+)/);
    if (shorts) return `https://www.youtube.com/watch?v=${shorts[2]}`;
    const v = parsed.searchParams.get('v');
    if (v) return `https://www.youtube.com/watch?v=${v}`;
  }
  return `${parsed.protocol}//${host}${path.replace(/\/+$/, '') || '/'}`;
}

/** Player URL for showing the video inside the app (Instagram/YouTube embeds), or '' if not embeddable. */
export function embedUrl(url) {
  const key = normalizeUrl(url);
  const ig = key.match(/^https:\/\/www\.instagram\.com\/(reel|p|tv)\/([\w-]+)\/$/);
  if (ig) return `https://www.instagram.com/${ig[1]}/${ig[2]}/embed/captioned/`;
  const yt = key.match(/^https:\/\/www\.youtube\.com\/watch\?v=([\w-]+)$/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return '';
}

const PLATFORM_LABEL = { instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', linkedin: 'LinkedIn', web: 'Web' };

/** Human label for a saved link with no title or note yet, e.g. "Instagram reel" / "YouTube Short". */
export function linkLabel(url) {
  const platform = detectPlatform(url);
  const u = String(url).toLowerCase();
  if (platform === 'instagram') return u.includes('/p/') ? 'Instagram post' : 'Instagram reel';
  if (platform === 'youtube') return u.includes('/shorts/') ? 'YouTube Short' : 'YouTube video';
  return `${PLATFORM_LABEL[platform]} link`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Guess topics from a caption / note / title. Returns topic ids, strongest match first. */
export function suggestTopics(text, topics = TOPICS) {
  const t = ` ${String(text || '').toLowerCase()} `;
  const scored = [];
  for (const topic of topics) {
    let score = 0;
    for (const kw of [topic.name.toLowerCase(), ...(topic.keywords || [])]) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(kw.toLowerCase())}([^a-z0-9]|$)`, 'g');
      const hits = t.match(re);
      if (hits) score += hits.length * (kw.includes(' ') ? 2 : 1);
    }
    if (score > 0) scored.push({ id: topic.id, score });
  }
  return scored.sort((a, b) => b.score - a.score).map(s => s.id);
}

export function createVideo({ url, note = '', title = '', topics = [] }, now = Date.now()) {
  return {
    id: uid(),
    url: url.trim(),
    key: normalizeUrl(url),
    platform: detectPlatform(url),
    title: title.trim(),
    note: note.trim(),
    topics: [...new Set(topics)],
    stage: 'saved',
    insight: '',
    idea: '',
    addedAt: now,
    watchedAt: null,
    learnedAt: null,
  };
}

export function findDuplicate(state, url) {
  const key = normalizeUrl(url);
  return state.videos.find(v => v.key === key) || null;
}

export function advance(video, stage, fields = {}, now = Date.now()) {
  const next = { ...video, ...fields, stage };
  if (stage === 'watched' || stage === 'learned') next.watchedAt = video.watchedAt || now;
  if (stage === 'learned') next.learnedAt = video.learnedAt || now;
  if (stage === 'saved') { next.watchedAt = null; next.learnedAt = null; }
  if (stage === 'watched') next.learnedAt = null;
  return next;
}

export function createExperiment({ videoId, projectId, plan }, now = Date.now()) {
  return { id: uid(), videoId, projectId, plan: plan.trim(), status: 'queued', result: '', createdAt: now, updatedAt: now, doneAt: null };
}

export function setExperimentStatus(exp, status, result, now = Date.now()) {
  const done = status === 'won' || status === 'flopped';
  return { ...exp, status, result: result ?? exp.result, updatedAt: now, doneAt: done ? (exp.doneAt || now) : null };
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Window start for "last N days" (inclusive of today). days = Infinity → everything. */
export function windowStart(days, now = Date.now()) {
  if (!Number.isFinite(days)) return 0;
  return startOfDay(now) - (days - 1) * DAY;
}

const inWin = (ts, since) => ts != null && ts >= since;

/** Headline numbers for a period. */
export function periodStats(state, days, now = Date.now()) {
  const since = windowStart(days, now);
  const v = state.videos;
  const e = state.experiments;
  return {
    saved: v.filter(x => inWin(x.addedAt, since)).length,
    watched: v.filter(x => inWin(x.watchedAt, since)).length,
    learned: v.filter(x => inWin(x.learnedAt, since)).length,
    applied: e.filter(x => inWin(x.createdAt, since)).length,
    won: e.filter(x => x.status === 'won' && inWin(x.doneAt, since)).length,
    backlog: v.filter(x => x.stage === 'saved').length,
  };
}

/** Per-topic breakdown for a period: watched / learned / applied / won / backlog. */
export function topicStats(state, days, now = Date.now()) {
  const since = windowStart(days, now);
  const byVideo = new Map(state.videos.map(v => [v.id, v]));
  const rows = allTopics(state).map(t => ({ ...t, watched: 0, learned: 0, applied: 0, won: 0, backlog: 0 }));
  const idx = new Map(rows.map(r => [r.id, r]));
  const untagged = { id: '_none', name: 'Untagged', color: '#64748b', watched: 0, learned: 0, applied: 0, won: 0, backlog: 0 };
  const rowsFor = topics => (topics.length ? topics.map(id => idx.get(id)).filter(Boolean) : [untagged]);

  for (const v of state.videos) {
    for (const r of rowsFor(v.topics)) {
      if (inWin(v.watchedAt, since)) r.watched++;
      if (inWin(v.learnedAt, since)) r.learned++;
      if (v.stage === 'saved') r.backlog++;
    }
  }
  for (const ex of state.experiments) {
    const v = byVideo.get(ex.videoId);
    if (!v) continue;
    for (const r of rowsFor(v.topics)) {
      if (inWin(ex.createdAt, since)) r.applied++;
      if (ex.status === 'won' && inWin(ex.doneAt, since)) r.won++;
    }
  }
  const all = untagged.watched + untagged.learned + untagged.backlog + untagged.applied ? [...rows, untagged] : rows;
  return all;
}

/** Topics you keep saving but never actually learn — the gap between collecting and knowing. */
export function blindSpots(state, days, now = Date.now()) {
  return topicStats(state, days, now)
    .filter(r => r.id !== '_none' && r.backlog >= 2 && r.learned === 0)
    .sort((a, b) => b.backlog - a.backlog);
}

/** Consecutive days (ending today, or yesterday if nothing yet today) with at least one video learned. */
export function learningStreak(state, now = Date.now()) {
  const days = new Set(state.videos.filter(v => v.learnedAt).map(v => startOfDay(v.learnedAt)));
  let day = startOfDay(now);
  if (!days.has(day)) day -= DAY;
  let streak = 0;
  while (days.has(day)) { streak++; day -= DAY; }
  return streak;
}

export function totalXp(state) {
  let xp = 0;
  for (const v of state.videos) {
    xp += XP.saved;
    if (v.watchedAt) xp += XP.watched;
    if (v.learnedAt) xp += XP.learned;
  }
  for (const e of state.experiments) {
    xp += XP.applied;
    if (e.status === 'won') xp += XP.won;
  }
  return xp;
}

export function levelFor(xp) {
  const level = Math.floor(Math.sqrt(xp / 10)) + 1;
  const cur = 10 * (level - 1) ** 2;
  const next = 10 * level ** 2;
  return { level, progress: (xp - cur) / (next - cur), toNext: next - xp };
}

/**
 * Today's picks: unwatched saves, favouring topics you've learned least about recently
 * (so the backlog stays balanced), then oldest first so nothing rots.
 */
export function todaysPicks(state, n = 3, now = Date.now()) {
  const recent = new Map(topicStats(state, 30, now).map(r => [r.id, r.learned]));
  const weight = v => (v.topics.length ? Math.min(...v.topics.map(t => recent.get(t) ?? 0)) : 0);
  const pool = state.videos.filter(v => v.stage === 'saved');
  pool.sort((a, b) => weight(a) - weight(b) || a.addedAt - b.addedAt);
  const picks = [];
  const usedTopics = new Set();
  for (const v of pool) {
    if (picks.length >= n) break;
    const primary = v.topics[0] || '_none';
    if (usedTopics.has(primary)) continue;
    picks.push(v);
    usedTopics.add(primary);
  }
  for (const v of pool) {
    if (picks.length >= n) break;
    if (!picks.includes(v)) picks.push(v);
  }
  return picks;
}

/** Markdown playbook of everything learned + applied for a project — paste into a client doc or brief. */
export function projectPlaybook(state, projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return '';
  const byVideo = new Map(state.videos.map(v => [v.id, v]));
  const topicName = new Map(allTopics(state).map(t => [t.id, t.name]));
  const exps = state.experiments.filter(e => e.projectId === projectId);
  const lines = [`# ${project.name} — Playbook`, '', `_Exported from Reel2Real on ${new Date().toISOString().slice(0, 10)}_`, ''];
  for (const st of EXP_STATUSES) {
    const group = exps.filter(e => e.status === st.id);
    if (!group.length) continue;
    lines.push(`## ${st.emoji} ${st.label} (${group.length})`, '');
    for (const e of group) {
      const v = byVideo.get(e.videoId);
      const tags = v?.topics.map(t => topicName.get(t)).filter(Boolean).join(', ');
      lines.push(`- **${e.plan}**`);
      if (v?.insight) lines.push(`  - Insight: ${v.insight}`);
      if (tags) lines.push(`  - Topics: ${tags}`);
      if (e.result) lines.push(`  - Result: ${e.result}`);
      if (v) lines.push(`  - Source: ${v.url}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Merge an imported backup into the current state (by id, imported wins). */
export function mergeState(current, incoming) {
  const merge = (a = [], b = []) => {
    const m = new Map(a.map(x => [x.id, x]));
    for (const x of b) m.set(x.id, x);
    return [...m.values()];
  };
  return {
    version: 1,
    videos: merge(current.videos, incoming.videos),
    projects: merge(current.projects, incoming.projects),
    experiments: merge(current.experiments, incoming.experiments),
    customTopics: merge(current.customTopics, incoming.customTopics),
  };
}

// ---------- cloud sync shape: one small document per record ----------
const KINDS = [['v', 'videos'], ['e', 'experiments'], ['p', 'projects'], ['t', 'customTopics']];

/** state → Map of docKey → {kind, item}. Keys are stable, so a diff tells what to write. */
export function toDocs(state) {
  const out = new Map();
  for (const [prefix, field] of KINDS) {
    for (const item of state[field] || []) out.set(`${prefix}_${item.id}`, { kind: field, item });
  }
  return out;
}

/** Rebuild state from synced documents ({id, body}[]), newest videos/experiments first. */
export function fromDocs(docs) {
  const s = emptyState();
  for (const { body } of docs) {
    if (body && Array.isArray(s[body.kind]) && body.item?.id) s[body.kind].push(body.item);
  }
  s.videos.sort((a, b) => b.addedAt - a.addedAt);
  s.experiments.sort((a, b) => b.createdAt - a.createdAt);
  s.projects.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return s;
}

/** What to write to make the remote match local: keys to set (with body) and keys to delete. */
export function diffDocs(local, remote) {
  const set = [];
  const del = [];
  for (const [key, body] of local) {
    const prev = remote.get(key);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(body)) set.push([key, body]);
  }
  for (const key of remote.keys()) if (!local.has(key)) del.push(key);
  return { set, del };
}
