// Pure idea-tracking logic: no network, no storage. Everything here is unit-tested.

export const STAGES = [
  { id: 'saved', label: 'Saved', emoji: '📥' },
  { id: 'testing', label: 'Testing', emoji: '🧪' },
  { id: 'building', label: 'Building', emoji: '🔨' },
  { id: 'live', label: 'Live', emoji: '🚀' },
  { id: 'earning', label: 'Earning', emoji: '💰' },
  { id: 'dropped', label: 'Dropped', emoji: '🗑️' },
];
const STAGE_IDS = STAGES.map(s => s.id);
const ACTIVE = ['saved', 'testing', 'building', 'live', 'earning'];
const DAY = 86400000;

export function stageOf(id) {
  return STAGES.find(s => s.id === id) || STAGES[0];
}

export function parseStage(word) {
  const w = String(word || '').toLowerCase().trim();
  return STAGE_IDS.find(id => id === w || id.startsWith(w) && w.length >= 3) || null;
}

/** Pull every http(s) link out of a message. */
export function extractUrls(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const u = m[0].replace(/[),.;!?]+$/, '');
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

export function detectPlatform(url) {
  const u = String(url || '').toLowerCase();
  if (/instagram\.com|instagr\.am/.test(u)) return 'instagram';
  if (/youtube\.com|youtu\.be/.test(u)) return 'youtube';
  if (/tiktok\.com/.test(u)) return 'tiktok';
  if (/linkedin\.com/.test(u)) return 'linkedin';
  if (/(twitter|x)\.com/.test(u)) return 'x';
  if (/facebook\.com|fb\.watch/.test(u)) return 'facebook';
  return 'web';
}

/** Canonical link, so the same reel shared twice is spotted (drops ?igsh= / ?si= tracking). */
export function normalizeUrl(url) {
  let p;
  try { p = new URL(url); } catch { return String(url || '').trim(); }
  const host = p.hostname.replace(/^(www\.|m\.)/, '');
  if (host === 'instagram.com') {
    const m = p.pathname.match(/^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/);
    if (m) return `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/`;
  }
  if (host === 'youtu.be') return `https://www.youtube.com/watch?v=${p.pathname.slice(1).split('/')[0]}`;
  if (host === 'youtube.com') {
    const s = p.pathname.match(/^\/(shorts|live|embed)\/([\w-]+)/);
    if (s) return `https://www.youtube.com/watch?v=${s[2]}`;
    const v = p.searchParams.get('v');
    if (v) return `https://www.youtube.com/watch?v=${v}`;
  }
  return `${p.protocol}//${host}${p.pathname.replace(/\/+$/, '') || '/'}`;
}

function clampScore(n) {
  const x = Math.round(Number(n));
  return Number.isFinite(x) ? Math.min(10, Math.max(1, x)) : 5;
}

/** Turn the AI's analysis into a stored idea. Tolerates missing fields. */
export function createIdea(state, analysis, source, now = Date.now()) {
  const n = (state.seq || 0) + 1;
  state.seq = n;
  const steps = (Array.isArray(analysis.steps) ? analysis.steps : [])
    .filter(s => s && (s.text || typeof s === 'string'))
    .slice(0, 12)
    .map((s, i) => ({
      n: i + 1,
      text: String(s.text || s).trim(),
      owner: s.owner === 'agent' ? 'agent' : 'you',
      done: false,
      doneAt: null,
      output: '',
    }));
  const idea = {
    n,
    title: String(analysis.title || 'Untitled idea').trim().slice(0, 120),
    oneLiner: String(analysis.one_liner || analysis.oneLiner || '').trim(),
    category: String(analysis.category || 'other'),
    moneyScore: clampScore(analysis.money_score ?? analysis.moneyScore),
    moneyWhy: String(analysis.money_why || '').trim(),
    howItEarns: String(analysis.how_it_earns || '').trim(),
    effort: ['small', 'medium', 'large'].includes(analysis.effort) ? analysis.effort : 'medium',
    cost: String(analysis.cost_estimate || '').trim(),
    firstTest: String(analysis.first_test || '').trim(),
    clientPitch: String(analysis.client_pitch || '').trim(),
    needsFromYou: (analysis.needs_from_you || []).map(String).slice(0, 6),
    steps,
    stage: 'saved',
    revenue: 0,
    notes: [],
    source: {
      urls: source.urls || [],
      keys: (source.urls || []).map(normalizeUrl),
      platform: source.urls?.[0] ? detectPlatform(source.urls[0]) : (source.hasImage ? 'screenshot' : 'text'),
      text: String(source.text || '').slice(0, 2000),
      hasImage: Boolean(source.hasImage),
    },
    createdAt: now,
    updatedAt: now,
    stageAt: now,
  };
  state.ideas.push(idea);
  return idea;
}

export function findIdea(state, n) {
  return state.ideas.find(i => i.n === Number(n)) || null;
}

export function findDuplicate(state, urls) {
  const keys = new Set((urls || []).map(normalizeUrl));
  if (!keys.size) return null;
  return state.ideas.find(i => (i.source?.keys || []).some(k => keys.has(k))) || null;
}

export function setStage(idea, stage, now = Date.now()) {
  if (!STAGE_IDS.includes(stage)) throw new Error(`Unknown stage "${stage}"`);
  idea.stage = stage;
  idea.stageAt = now;
  idea.updatedAt = now;
  return idea;
}

/** Mark a step done (or not). Auto-advances Saved → Testing when the first step is done. */
export function markStep(idea, stepN, done = true, now = Date.now()) {
  const step = idea.steps.find(s => s.n === Number(stepN));
  if (!step) throw new Error(`Idea ${idea.n} has no step ${stepN}`);
  step.done = done;
  step.doneAt = done ? now : null;
  idea.updatedAt = now;
  if (done && idea.stage === 'saved') setStage(idea, 'testing', now);
  return step;
}

export function nextStep(idea) {
  return idea.steps.find(s => !s.done) || null;
}

export function progress(idea) {
  const total = idea.steps.length;
  const done = idea.steps.filter(s => s.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/**
 * Rank active ideas: money potential first, then momentum (already started beats not started),
 * then smaller effort, then newest. Earning/dropped ideas are not "to-do".
 */
export function rankIdeas(state) {
  const effortW = { small: 1.5, medium: 0.5, large: 0 };
  const stageW = { saved: 0, testing: 2, building: 2.5, live: 1.5 };
  return state.ideas
    .filter(i => i.stage in stageW && nextStep(i))
    .map(i => ({ idea: i, score: i.moneyScore * 2 + stageW[i.stage] + effortW[i.effort] + progress(i).pct / 50 }))
    .sort((a, b) => b.score - a.score || b.idea.createdAt - a.idea.createdAt)
    .map(x => x.idea);
}

/** The single most valuable thing to do right now. */
export function pickNext(state) {
  const idea = rankIdeas(state)[0];
  return idea ? { idea, step: nextStep(idea) } : null;
}

/** Ideas that have not moved in `days` days and aren't finished. */
export function stalled(state, days = 5, now = Date.now()) {
  return state.ideas.filter(i => ['saved', 'testing', 'building'].includes(i.stage) && now - i.updatedAt > days * DAY);
}

export function stats(state, now = Date.now(), days = 7) {
  const since = now - days * DAY;
  const by = Object.fromEntries(STAGES.map(s => [s.id, 0]));
  for (const i of state.ideas) by[i.stage] = (by[i.stage] || 0) + 1;
  const stepsDone = state.ideas.flatMap(i => i.steps).filter(s => s.done && s.doneAt >= since).length;
  return {
    total: state.ideas.length,
    active: state.ideas.filter(i => ACTIVE.includes(i.stage)).length,
    byStage: by,
    newThisWeek: state.ideas.filter(i => i.createdAt >= since).length,
    stepsDoneThisWeek: stepsDone,
    revenue: state.ideas.reduce((sum, i) => sum + (Number(i.revenue) || 0), 0),
  };
}

export function remember(state, role, text, max = 12) {
  state.history = [...(state.history || []), { role, text: String(text).slice(0, 1500), at: Date.now() }].slice(-max);
}

/** Has this WhatsApp message already been handled? Records it if not. */
export function seenBefore(state, messageId, max = 300) {
  if (!messageId) return false;
  const seen = state.meta.seen || [];
  if (seen.includes(messageId)) return true;
  state.meta.seen = [...seen, messageId].slice(-max);
  return false;
}
