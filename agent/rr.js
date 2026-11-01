#!/usr/bin/env node
// rr: Reel to Real command-line tool. Controls every button of the live app, so Claude (or you) can
// run the whole tracker from a terminal.
//
//   export RR_TOKEN=...            (the part after ?token= in your app link)
//   node agent/rr.js list          all ideas
//   node agent/rr.js add <link>    save a reel (same as the Save button)
//   node agent/rr.js show 3        one idea with steps and notes
//   node agent/rr.js done 3.2      tick step 2 of idea 3      (undo 3.2 to untick)
//   node agent/rr.js stage 3 live  saved | testing | building | live | earning | dropped
//   node agent/rr.js note 3 text…  add a note
//   node agent/rr.js earned 3 5000 log money made
//   node agent/rr.js reel <link>   read a reel's caption without saving it
//   node agent/rr.js plan 3 '{"title":…,"steps":[…]}'   attach a full plan (Claude's review)
//   node agent/rr.js json          raw data, for scripts

const BASE = (process.env.RR_URL || 'https://idea-agent-ochre.vercel.app').replace(/\/+$/, '');
const TOKEN = process.env.RR_TOKEN || process.env.IDEA_AGENT_TOKEN || '';
const STAGE_EMOJI = { saved: '📥', testing: '🧪', building: '🔨', live: '🚀', earning: '💰', dropped: '🗑️' };

export async function api(path, { method = 'GET', body, fetchImpl = fetch, base = BASE, token = TOKEN } = {}) {
  if (!token) throw new Error('Set RR_TOKEN (the part after ?token= in your app link).');
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetchImpl(`${base}${path}${sep}token=${encodeURIComponent(token)}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const line = i => {
  const done = i.steps.filter(s => s.done).length;
  return `${STAGE_EMOJI[i.stage] || ''} #${i.n}  ${i.title}  💰${i.moneyScore}  ${done}/${i.steps.length}${i.verdict ? `  ${i.verdict}` : ''}`;
};

const card = i => [
  line(i),
  i.oneLiner && `   ${i.oneLiner.replace(/\n+/g, ' ').slice(0, 300)}`,
  ...i.steps.map(s => `   ${s.done ? '✅' : '⬜'} ${i.n}.${s.n} ${s.text}`),
  ...(i.notes || []).map(x => `   📝 ${x.text}`),
  ...i.source.urls.map(u => `   🔗 ${u}`),
].filter(Boolean).join('\n');

export async function run(argv, opts = {}) {
  const [cmd = 'list', ...rest] = argv;
  const post = body => api('/api/ideas', { ...opts, method: 'POST', body });
  const ideaStep = s => { const [n, st] = String(s || '').split('.').map(Number); return { n, step: st }; };
  switch (cmd) {
    case 'list': {
      const { ideas } = await api('/api/ideas', opts);
      return ideas.length ? ideas.map(line).join('\n') : 'No ideas yet.';
    }
    case 'json': return JSON.stringify((await api('/api/ideas', opts)).ideas, null, 2);
    case 'show': {
      const { ideas } = await api('/api/ideas', opts);
      const i = ideas.find(x => x.n === Number(rest[0]));
      return i ? card(i) : `No idea #${rest[0]}`;
    }
    case 'add': {
      const r = await post({ action: 'add-link', url: rest[0], note: rest.slice(1).join(' ') });
      return r.duplicate ? `Already saved as #${r.idea.n}` : `✅ Saved as #${r.idea.n}: ${r.idea.title}`;
    }
    case 'done': case 'undo': {
      const { n, step } = ideaStep(rest[0]);
      await post({ action: 'step', n, step, done: cmd === 'done' });
      return `${cmd === 'done' ? '✅' : '↩️'} ${n}.${step}`;
    }
    case 'stage': await post({ action: 'stage', n: Number(rest[0]), stage: rest[1] }); return `#${rest[0]} → ${rest[1]}`;
    case 'note': await post({ action: 'note', n: Number(rest[0]), text: rest.slice(1).join(' ') }); return `📝 Note added to #${rest[0]}`;
    case 'earned': await post({ action: 'earned', n: Number(rest[0]), amount: Number(rest[1]) }); return `💰 Logged ${rest[1]} on #${rest[0]}`;
    case 'plan': {
      const r = await post({ action: 'plan', n: Number(rest[0]), plan: JSON.parse(rest.slice(1).join(' ')) });
      return card(r.idea);
    }
    case 'reel': {
      const r = await api(`/api/reel?url=${encodeURIComponent(rest[0])}`, opts);
      return [`@${r.reel.author || '?'} · ${r.reel.date || ''}`, r.reel.caption || '(no caption)', r.alreadySaved ? `Already saved as #${r.alreadySaved.n}` : ''].filter(Boolean).join('\n');
    }
    default:
      return 'Commands: list | add <link> | show N | done N.M | undo N.M | stage N <stage> | note N <text> | earned N <amount> | plan N <json> | reel <link> | json';
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then(out => console.log(out), err => { console.error(`❌ ${err.message}`); process.exit(1); });
}
