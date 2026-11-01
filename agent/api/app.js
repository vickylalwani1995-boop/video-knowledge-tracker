// Reel to Real: the live tracker web app.  Open /app?token=STATUS_TOKEN on your phone.
// Paste a reel link → saved instantly (with the public caption). Tick steps, change stages, add notes.
// Everything is stored in the same place the WhatsApp bot and Claude sessions use.
import { makeDeps } from '../lib/deps.js';
import { authorized } from '../lib/auth.js';
import { STAGES, progress } from '../lib/ideas.js';
import { seedOnce } from '../lib/seed.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderApp(state) {
  const order = ['testing', 'building', 'live', 'earning', 'saved', 'dropped'];
  const ideas = [...state.ideas].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || b.moneyScore - a.moneyScore || b.n - a.n);
  const stageOpts = cur => STAGES.map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.emoji} ${s.label}</option>`).join('');
  const verdict = i => i.verdict || (i.stage === 'dropped' ? '❌ Skip' : i.steps.length ? '' : '⏳ Not reviewed yet');
  const cards = ideas.map(i => {
    const p = progress(i);
    return `<details class="card s-${i.stage}" ${i.stage === 'testing' || i.stage === 'building' ? 'open' : ''}>
<summary><span class="num">#${i.n}</span><span class="t">${esc(i.title)}</span><span class="m">💰${i.moneyScore}</span>
<div class="bar"><i style="width:${p.pct}%"></i></div></summary>
${verdict(i) ? `<p class="v">${esc(verdict(i))}</p>` : ''}
${i.oneLiner ? `<p>${esc(i.oneLiner)}</p>` : ''}
${i.howItEarns ? `<p><b>How it earns:</b> ${esc(i.howItEarns)}</p>` : ''}
${i.steps.length ? `<ul class="steps">${i.steps.map(s => `<li><label><input type="checkbox" data-n="${i.n}" data-step="${s.n}" ${s.done ? 'checked' : ''}> <span>${s.owner === 'agent' ? '🤖' : s.owner === 'together' ? '🤝' : '👤'} ${esc(s.text)}</span></label>${s.output ? `<div class="out">${esc(s.output).slice(0, 600)}</div>` : ''}</li>`).join('')}</ul>` : ''}
${(i.notes || []).length ? `<ul class="notes">${i.notes.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>` : ''}
<div class="row"><select data-stage="${i.n}">${stageOpts(i.stage)}</select>
${i.source.urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">Open reel ↗</a>`).join('')}</div>
<form class="note" data-n="${i.n}"><input name="text" placeholder="Add a note…" autocomplete="off"><button>Add</button></form>
</details>`;
  }).join('');
  const counts = Object.fromEntries(STAGES.map(s => [s.id, state.ideas.filter(i => i.stage === s.id).length]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Reel to Real">
<title>Reel to Real</title><style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#14161a;--mute:#646b76;--line:#e3e6ea;--acc:#4f46e5;--ok:#0f9d58}
@media (prefers-color-scheme:dark){:root{--bg:#0d0f13;--card:#171a20;--ink:#eef0f3;--mute:#9aa1ac;--line:#272b33;--acc:#8b85ff;--ok:#34c37a}}
*{box-sizing:border-box}body{margin:0 auto;max-width:720px;padding:16px;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,sans-serif}
h1{font-size:22px;margin:6px 0 2px}.sub{color:var(--mute);font-size:14px;margin:0 0 14px}
.add{display:flex;gap:8px;margin-bottom:10px}.add input{flex:1;min-width:0}
input,select,button{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
button{background:var(--acc);color:#fff;border:0;font-weight:600}
.kpis{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px}.kpis span{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 10px;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:8px 0}
.card summary{cursor:pointer;list-style:none;display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}.card summary::-webkit-details-marker{display:none}
.num{color:var(--mute);font-size:13px}.t{flex:1;font-weight:600}.m{font-size:13px;color:var(--mute)}
.bar{flex-basis:100%;height:4px;background:var(--line);border-radius:4px}.bar i{display:block;height:100%;background:var(--acc);border-radius:4px}
.s-dropped{opacity:.55}.s-earning{border-color:var(--ok)}
.v{font-weight:600;margin:8px 0}p{margin:8px 0}.steps,.notes{padding-left:0;list-style:none;margin:8px 0}
.steps li{margin:6px 0}.steps input{width:20px;height:20px;vertical-align:-4px}
.steps input:checked+span{color:var(--mute);text-decoration:line-through}.out{font-size:13px;color:var(--mute);margin:4px 0 0 28px;white-space:pre-wrap}
.notes li{font-size:14px;color:var(--mute);border-left:3px solid var(--line);padding-left:8px;margin:4px 0}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}a{color:var(--acc)}
.note{display:flex;gap:8px}.note input{flex:1;min-width:0}
#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:999px;display:none}
</style></head><body>
<h1>🎬 Reel to Real</h1>
<p class="sub">Paste a reel link to save it. Tick steps as you do them. Claude sees the same list.</p>
<form class="add" id="add"><input name="url" type="url" inputmode="url" placeholder="Paste Instagram / YouTube link" required><button>Save</button></form>
<div class="kpis"><span>🧪 ${counts.testing} testing</span><span>🔨 ${counts.building} building</span><span>🚀 ${counts.live} live</span><span>💰 ${counts.earning} earning</span><span>📥 ${counts.saved} saved</span></div>
${cards || '<p class="sub">No reels yet. Paste your first link above.</p>'}
<div id="toast"></div>
<script>
const token=new URLSearchParams(location.search).get('token');
const toast=t=>{const e=document.getElementById('toast');e.textContent=t;e.style.display='block';setTimeout(()=>e.style.display='none',2200)};
async function send(body){const r=await fetch('/api/ideas?token='+encodeURIComponent(token),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Failed');return j}
document.getElementById('add').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;b.textContent='Saving…';
 try{const j=await send({action:'add-link',url:e.target.url.value});toast(j.duplicate?'Already saved as #'+j.idea.n:'✅ Saved as #'+j.idea.n);setTimeout(()=>location.reload(),700)}catch(err){toast(err.message);b.disabled=false;b.textContent='Save'}};
document.querySelectorAll('input[data-step]').forEach(c=>c.onchange=async()=>{try{await send({action:'step',n:+c.dataset.n,step:+c.dataset.step,done:c.checked});toast(c.checked?'✅ Done':'↩️ Undone')}catch(err){toast(err.message);c.checked=!c.checked}});
document.querySelectorAll('select[data-stage]').forEach(s=>s.onchange=async()=>{try{await send({action:'stage',n:+s.dataset.stage,stage:s.value});toast('Moved');setTimeout(()=>location.reload(),600)}catch(err){toast(err.message)}});
document.querySelectorAll('form.note').forEach(f=>f.onsubmit=async e=>{e.preventDefault();if(!f.text.value.trim())return;try{await send({action:'note',n:+f.dataset.n,text:f.text.value});toast('📝 Saved');setTimeout(()=>location.reload(),600)}catch(err){toast(err.message)}});
</script></body></html>`;
}

export async function GET(request, deps) {
  deps = deps?.cfg ? deps : await makeDeps();
  if (!authorized(request, deps.cfg)) {
    return new Response('<p style="font:16px system-ui;padding:20px">Open the link with your <b>?token=…</b> at the end.</p>', { status: 401, headers: { 'Content-Type': 'text/html' } });
  }
  const state = await deps.store.load();
  if (seedOnce(state)) await deps.store.save(state);
  return new Response(renderApp(state), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
