// Health + tracker page.
//   /api/status                 → public JSON health check (no idea data). 200 = healthy, 503 = something's wrong.
//                                  Point a free uptime monitor (e.g. UptimeRobot) at this URL.
//   /api/status?token=STATUS_TOKEN → private page with every idea and its progress (open it on your phone).
import { makeDeps } from '../lib/deps.js';
import { configReport } from '../lib/config.js';
import { STAGES, progress, stats } from '../lib/ideas.js';

const HOUR = 3600000;

export function healthChecks(state, report, now = Date.now()) {
  const problems = [];
  if (!report.whatsapp) problems.push('WhatsApp token / phone number id missing');
  if (!report.owner) problems.push('OWNER_WHATSAPP missing');
  if (!report.ai) problems.push('No AI key (GEMINI_API_KEY): running in offline mode');
  if (report.storage === 'local-file') problems.push('No storage connected (Vercel Blob or Redis): ideas will be lost');
  if (!report.signatureCheck) problems.push('WHATSAPP_APP_SECRET missing: webhook is not verified');
  if (!report.cronSecret) problems.push('CRON_SECRET missing: daily briefs are off');
  const ageH = now - (state.meta.createdAt || now);
  if (report.cronSecret && ageH > 26 * HOUR && (!state.meta.lastBriefAt || now - state.meta.lastBriefAt > 26 * HOUR)) {
    problems.push('Morning brief has not been sent in over 26 hours');
  }
  if (state.meta.lastError && now - state.meta.lastError.at < 6 * HOUR) problems.push(`Recent error: ${state.meta.lastError.message}`);
  return problems;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = t => (t ? new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

export function renderPage(state, problems, now = Date.now()) {
  const s = stats(state, now);
  const cols = STAGES.map(st => {
    const items = state.ideas.filter(i => i.stage === st.id).sort((a, b) => b.moneyScore - a.moneyScore);
    if (!items.length) return '';
    return `<section><h2>${st.emoji} ${st.label} <small>${items.length}</small></h2>${items.map(i => {
      const p = progress(i);
      return `<details><summary><b>#${i.n}</b> ${esc(i.title)} <span class="pill">💰${i.moneyScore}</span>
        <div class="bar"><i style="width:${p.pct}%"></i></div></summary>
        <p>${esc(i.oneLiner)}</p>
        <p><b>How it earns:</b> ${esc(i.howItEarns)}<br><b>First test:</b> ${esc(i.firstTest)}<br><b>Effort:</b> ${esc(i.effort)} · <b>Cost:</b> ${esc(i.cost)}</p>
        <ol>${i.steps.map(x => `<li class="${x.done ? 'done' : ''}">${x.owner === 'agent' ? '🤖' : '👤'} ${esc(x.text)}</li>`).join('')}</ol>
        ${i.source.urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">source ↗</a>`).join(' ')}
        ${i.revenue ? `<p>💰 Earned: <b>${esc(i.revenue)}</b></p>` : ''}
      </details>`;
    }).join('')}</section>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Idea Agent</title><style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#14161a;--mute:#646b76;--line:#e3e6ea;--ok:#0f9d58;--bad:#d93025;--acc:#4f46e5}
@media (prefers-color-scheme:dark){:root{--bg:#0d0f13;--card:#171a20;--ink:#eef0f3;--mute:#9aa1ac;--line:#272b33;--ok:#34c37a;--bad:#ff6b5e;--acc:#8b85ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,sans-serif;padding:16px;max-width:820px;margin:auto}
h1{font-size:20px;margin:4px 0 12px}h2{font-size:15px;margin:22px 0 8px}small{color:var(--mute);font-weight:400}
.health{padding:12px 14px;border-radius:12px;background:var(--card);border:1px solid var(--line);margin-bottom:12px}
.health b{color:${problems.length ? 'var(--bad)' : 'var(--ok)'}}.health li{color:var(--bad)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.kpis div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center}
.kpis b{display:block;font-size:20px}.kpis span{font-size:12px;color:var(--mute)}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:6px 0}summary{cursor:pointer}
.pill{font-size:12px;color:var(--mute);margin-left:4px}.bar{height:4px;background:var(--line);border-radius:4px;margin-top:6px}.bar i{display:block;height:100%;background:var(--acc);border-radius:4px}
li.done{color:var(--mute);text-decoration:line-through}a{color:var(--acc)}p{margin:8px 0}
</style></head><body>
<h1>💡 Idea Agent</h1>
<div class="health"><b>${problems.length ? '⚠️ Needs attention' : '✅ Everything is working'}</b>
${problems.length ? `<ul>${problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
<div><small>Last message from you: ${when(state.meta.lastInboundAt)} · Last morning brief: ${when(state.meta.lastBriefAt)}</small></div></div>
<div class="kpis"><div><b>${s.active}</b><span>active ideas</span></div><div><b>${s.newThisWeek}</b><span>new this week</span></div>
<div><b>${s.stepsDoneThisWeek}</b><span>steps done (7d)</span></div><div><b>${esc(s.revenue)}</b><span>earned</span></div></div>
${cols || '<p><small>No ideas yet. Forward a reel to your agent on WhatsApp.</small></p>'}
</body></html>`;
}

export async function GET(request, deps) {
  deps = deps || await makeDeps();
  const { cfg, store, wa, brain } = deps;
  const report = configReport(cfg);
  const isPrivate = Boolean(cfg.statusToken) && new URL(request.url).searchParams.get('token') === cfg.statusToken;
  let state;
  try { state = await store.load(); }
  catch (err) {
    return Response.json({ ok: false, problems: [`Storage unreachable: ${err.message}`] }, { status: 503 });
  }
  const problems = healthChecks(state, report);
  // Live checks: is the WhatsApp token still valid? (private page also tests the AI)
  const waCheck = wa?.checkToken ? await wa.checkToken() : { ok: true };
  if (!waCheck.ok && report.whatsapp) problems.unshift(waCheck.problem);
  if (isPrivate && brain?.ping) {
    try { await brain.ping(); } catch (e) { problems.push(`AI test failed: ${e.message}`); }
  }
  if (isPrivate) {
    return new Response(renderPage(state, problems), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  return Response.json(
    { ok: problems.length === 0, problems, checks: { ...report, whatsappTokenValid: waCheck.ok }, lastInboundAt: state.meta.lastInboundAt, lastBriefAt: state.meta.lastBriefAt },
    { status: problems.length ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
