// The tracker, for Claude sessions and other tools (same data the WhatsApp bot and /status page use).
//   GET  /api/ideas?token=…            → all ideas
//   POST /api/ideas?token=…  JSON body:
//     { "action": "add-link", "url": "..." }   ← instant save from the web app (caption only, no AI)
//     { "action": "add", "url": "...", "note": "...", "idea": { title, one_liner, money_score, how_it_earns,
//        effort, cost_estimate, first_test, client_pitch, needs_from_you: [], steps: [{text, owner}] }, "notify": true }
//     { "action": "step",  "n": 3, "step": 2, "done": true, "output": "what was produced" }
//     { "action": "note",  "n": 3, "text": "..." }
//     { "action": "stage", "n": 3, "stage": "building" }
//     { "action": "earned","n": 3, "amount": 5000 }
import { makeDeps } from '../lib/deps.js';
import { authorized, unauthorized } from '../lib/auth.js';
import { createIdea, findIdea, findDuplicate, markStep, setStage, parseStage, extractUrls } from '../lib/ideas.js';
import { ideaCard } from '../lib/format.js';
import { fetchReel } from '../lib/reel.js';

export async function GET(request, deps) {
  deps = deps?.cfg ? deps : await makeDeps();
  if (!authorized(request, deps.cfg)) return unauthorized();
  const state = await deps.store.load();
  return Response.json({ ideas: state.ideas }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request, deps) {
  deps = deps?.cfg ? deps : await makeDeps();
  if (!authorized(request, deps.cfg)) return unauthorized();
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Send JSON' }, { status: 400 }); }
  const state = await deps.store.load();
  const bad = msg => Response.json({ error: msg }, { status: 400 });
  let idea;
  let message;

  switch (body.action) {
    case 'add-link': {
      // Instant save from the web app: link + public caption, no AI needed. Claude reviews it later.
      const url = String(body.url || '').trim();
      if (!/^https?:\/\//.test(url)) return bad('Paste a full link starting with https://');
      const dup = findDuplicate(state, [url]);
      if (dup) return Response.json({ duplicate: true, idea: dup });
      const reel = await (deps.readReel || fetchReel)(url).catch(() => ({}));
      const caption = String(reel.caption || '').trim();
      const first = caption.split('\n').map(x => x.trim()).find(Boolean) || '';
      idea = createIdea(state, {
        title: (first || `${reel.author ? '@' + reel.author + ' ' : ''}reel`).replace(/#\S+/g, '').slice(0, 90).trim() || 'New reel',
        one_liner: caption.slice(0, 500), money_score: 5, steps: [],
      }, { urls: [url], text: body.note || '' });
      idea.verdict = '⏳ Not reviewed yet: say "review" to Claude';
      if (reel.author) idea.notes = [{ text: `By @${reel.author}${reel.date ? ' · ' + reel.date : ''}`, at: Date.now() }];
      break;
    }
    case 'add': {
      const urls = body.url ? [body.url] : extractUrls(body.note || '');
      const dup = findDuplicate(state, urls);
      if (dup) return Response.json({ duplicate: true, idea: dup });
      if (!body.idea?.title) return bad('idea.title is required');
      idea = createIdea(state, body.idea, { urls, text: body.note || '' });
      idea.addedBy = body.addedBy || 'claude';
      message = `🆕 New idea added from Claude\n\n${ideaCard(idea)}`;
      break;
    }
    case 'step': {
      idea = findIdea(state, body.n);
      if (!idea) return bad(`No idea #${body.n}`);
      try { markStep(idea, body.step, body.done !== false); } catch (e) { return bad(e.message); }
      const st = idea.steps.find(s => s.n === Number(body.step));
      if (body.output) st.output = String(body.output).slice(0, 8000);
      message = `✅ ${idea.n}.${st.n} ${st.text}${body.output ? `\n\n${String(body.output).slice(0, 1500)}` : ''}`;
      break;
    }
    case 'plan': {
      // Claude's review of a saved reel: verdict, score, and real steps.
      idea = findIdea(state, body.n);
      const pl = body.plan || {};
      if (!idea) return bad(`No idea #${body.n}`);
      if (pl.title) idea.title = String(pl.title).slice(0, 120);
      if (pl.one_liner) idea.oneLiner = String(pl.one_liner).slice(0, 600);
      if (pl.money_score) idea.moneyScore = Math.min(10, Math.max(1, Math.round(Number(pl.money_score)) || 5));
      if (pl.how_it_earns) idea.howItEarns = String(pl.how_it_earns);
      if (pl.verdict) idea.verdict = String(pl.verdict).slice(0, 200);
      if (Array.isArray(pl.steps)) {
        idea.steps = pl.steps.map((st, k) => ({ n: k + 1, text: String(st.text || st), owner: ['agent', 'you', 'together'].includes(st.owner) ? st.owner : 'you', done: Boolean(st.done), doneAt: st.done ? Date.now() : null, output: String(st.output || '') }));
      }
      if (pl.stage && parseStage(pl.stage)) setStage(idea, parseStage(pl.stage));
      idea.updatedAt = Date.now();
      message = `🧠 Reviewed #${idea.n}: ${idea.title}`;
      break;
    }
    case 'note': {
      idea = findIdea(state, body.n);
      if (!idea || !body.text) return bad('Need n and text');
      idea.notes = [...(idea.notes || []), { text: String(body.text).slice(0, 4000), at: Date.now() }];
      idea.updatedAt = Date.now();
      break;
    }
    case 'stage': {
      idea = findIdea(state, body.n);
      const stage = parseStage(body.stage);
      if (!idea || !stage) return bad('Need n and a valid stage');
      setStage(idea, stage);
      message = `#${idea.n} moved to ${stage}`;
      break;
    }
    case 'earned': {
      idea = findIdea(state, body.n);
      if (!idea || !(Number(body.amount) > 0)) return bad('Need n and amount');
      idea.revenue = (Number(idea.revenue) || 0) + Number(body.amount);
      setStage(idea, 'earning');
      message = `💰 Logged ${body.amount} on #${idea.n}`;
      break;
    }
    default:
      return bad('action must be add-link, add, plan, step, note, stage or earned');
  }
  await deps.store.save(state);
  // Optional WhatsApp ping so the phone stays in sync. Never fails the request.
  let notified = false;
  if (body.notify && message && deps.cfg.ownerNumber) {
    try { await deps.wa.sendText(deps.cfg.ownerNumber, message); notified = true; } catch { /* token expired or 24h window closed */ }
  }
  return Response.json({ ok: true, idea, notified });
}
