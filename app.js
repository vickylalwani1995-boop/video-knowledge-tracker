import {
  allTopics, emptyState, extractUrl, detectPlatform, normalizeUrl, suggestTopics, createVideo, findDuplicate, advance,
  createExperiment, setExperimentStatus, periodStats, topicStats, blindSpots, learningStreak, totalXp,
  levelFor, todaysPicks, projectPlaybook, mergeState, uid, EXP_STATUSES, XP,
} from './core.js';

const STORE_KEY = 'reel2real:v1';
const UI_KEY = 'reel2real:ui';
const PROJECT_COLORS = ['#ff4f81', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#14b8a6', '#ef4444', '#ec4899'];
const PROJECT_SUGGESTIONS = ['SuperMIA', 'RevEvolve', 'QuantumDataLytica', 'Hampton Family Dental', 'Botfinity'];

// ---------- state ----------
let state = load(STORE_KEY) || emptyState();
const ui = { tab: 'today', stage: 'all', topic: 'all', q: '', period: 10, ...(load(UI_KEY) || {}) };

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { toast('Could not save — storage is full or blocked'); }
}
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ tab: ui.tab, period: ui.period, theme: ui.theme })); } catch { /* optional */ }
}
function commit(msg) {
  save();
  render();
  if (msg) toast(msg);
}

// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const topicMap = () => new Map(allTopics(state).map(t => [t.id, t]));
const projectMap = () => new Map(state.projects.map(p => [p.id, p]));
const videoById = id => state.videos.find(v => v.id === id);
const expsFor = videoId => state.experiments.filter(e => e.videoId === videoId);

function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function displayTitle(v) {
  if (v.title) return v.title;
  if (v.note) return v.note.length > 90 ? v.note.slice(0, 90) + '…' : v.note;
  try {
    const u = new URL(v.url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.length > 1 ? u.pathname.slice(0, 32) : ''}`;
  } catch { return v.url; }
}

const PLATFORM_ICON = { instagram: '📸', youtube: '▶', tiktok: '♪', linkedin: 'in', web: '🔗' };

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function topicChips(selected = [], name = 'topics') {
  return `<div class="chips">${allTopics(state).map(t => `
    <label class="chip" style="--c:${t.color}">
      <input type="checkbox" name="${name}" value="${t.id}" hidden ${selected.includes(t.id) ? 'checked' : ''}>${esc(t.name)}
    </label>`).join('')}</div>`;
}

function staticTopicChips(ids) {
  const tm = topicMap();
  return ids.map(id => tm.get(id)).filter(Boolean)
    .map(t => `<span class="chip static" style="--c:${t.color}">${esc(t.name)}</span>`).join('');
}

function projectOptions(selected) {
  return state.projects.map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

// ---------- modal ----------
let modalHandler = null;
function openModal(html, handler) {
  const dlg = $('#modal');
  $('#modal-body').innerHTML = html;
  modalHandler = handler;
  if (!dlg.open) dlg.showModal();
  const first = dlg.querySelector('[autofocus]');
  if (first) first.focus();
}
function closeModal() {
  $('#modal').close();
  modalHandler = null;
}
$('#modal-body').addEventListener('submit', e => {
  e.preventDefault();
  const action = e.submitter?.value || 'ok';
  if (action === 'cancel' || !modalHandler) return closeModal();
  const fd = new FormData(e.target);
  const keep = modalHandler(fd, action);
  if (keep !== true) closeModal();
});
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

// ---------- actions ----------
function addVideo({ url, note, topics, title }) {
  const clean = extractUrl(url) || url.trim();
  if (!/^https?:\/\//i.test(clean)) { toast('Paste a full link (https://…)'); return null; }
  const dup = findDuplicate(state, clean);
  if (dup) { toast('Already in your library — bumped it to the top of the queue'); dup.addedAt = Date.now(); commit(); return dup; }
  const v = createVideo({ url: clean, note, title, topics });
  state.videos.unshift(v);
  commit(`Saved to queue · +${XP.saved} XP`);
  if (v.platform === 'youtube' && !v.title) fetchYoutubeTitle(v.id, clean);
  return v;
}

async function fetchYoutubeTitle(id, url) {
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    const v = videoById(id);
    if (v && data.title && !v.title) {
      v.title = data.title;
      if (!v.topics.length) v.topics = suggestTopics(`${data.title} ${v.note}`, allTopics(state)).slice(0, 2);
      commit();
    }
  } catch { /* offline or blocked: the URL is still saved */ }
}

function markWatched(id) {
  const i = state.videos.findIndex(v => v.id === id);
  state.videos[i] = advance(state.videos[i], 'watched');
  commit(`Watched · +${XP.watched} XP — now, what did you learn?`);
}

function openLearn(id) {
  const v = videoById(id);
  openModal(`
    <h3>💡 Lock in the learning</h3>
    <p class="sub">${esc(displayTitle(v))}</p>
    <div class="stack" style="margin-top:14px">
      <div class="field"><label>The ONE thing I learned</label>
        <textarea name="insight" required autofocus placeholder="e.g. Meta's Andromeda rewards 10–15 creatively different ads in one broad ad set">${esc(v.insight)}</textarea></div>
      <div class="field"><label>How I could use it (optional)</label>
        <textarea name="idea" placeholder="e.g. Test 12 new hooks for the dental campaign">${esc(v.idea)}</textarea></div>
      <div class="field"><label>Topics</label>${topicChips(v.topics.length ? v.topics : suggestTopics(`${v.title} ${v.note}`, allTopics(state)).slice(0, 2))}</div>
      ${state.projects.length ? `
      <div class="field"><label>Apply it to a project right away? (optional)</label>
        <select name="project"><option value="">Not yet</option>${projectOptions()}</select></div>` : ''}
    </div>
    <div class="row end" style="margin-top:16px">
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">Lock it in</button>
    </div>`, fd => {
    const i = state.videos.findIndex(x => x.id === id);
    state.videos[i] = advance(state.videos[i], 'learned', {
      insight: fd.get('insight').trim(), idea: fd.get('idea').trim(), topics: fd.getAll('topics'),
    });
    let msg = `Learning locked · +${XP.learned} XP 💡`;
    const pid = fd.get('project');
    if (pid) {
      state.experiments.unshift(createExperiment({ videoId: id, projectId: pid, plan: fd.get('idea').trim() || fd.get('insight').trim() }));
      msg = `Learned + applied · +${XP.learned + XP.applied} XP 🚀`;
    }
    commit(msg);
  });
}

function openApply(videoId, presetProject) {
  const v = videoById(videoId);
  const hasProjects = state.projects.length > 0;
  openModal(`
    <h3>🚀 Apply to a project</h3>
    <p class="sub">${esc(v.insight || displayTitle(v))}</p>
    <div class="stack" style="margin-top:14px">
      <div class="field"><label>Project</label>
        ${hasProjects ? `<select name="project">${projectOptions(presetProject)}<option value="__new">+ New project…</option></select>` : ''}
        <input name="newProject" placeholder="New project name, e.g. SuperMIA" ${hasProjects ? 'style="margin-top:8px"' : 'required autofocus'}>
        ${hasProjects ? '<div class="hint">Only needed if you picked “New project”.</div>' : ''}</div>
      <div class="field"><label>What exactly will you do?</label>
        <textarea name="plan" required ${hasProjects ? 'autofocus' : ''} placeholder="Concrete action, e.g. Add a 40-word answer block + FAQ schema to the pricing page">${esc(v.idea)}</textarea></div>
      <div class="field"><label>Status</label>
        <select name="status"><option value="queued">⏳ Queued</option><option value="testing">🧪 Testing now</option></select></div>
    </div>
    <div class="row end" style="margin-top:16px">
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">Start experiment</button>
    </div>`, fd => {
    let pid = fd.get('project');
    if (!pid || pid === '__new') {
      const name = fd.get('newProject').trim();
      if (!name) { toast('Name the new project'); return true; }
      pid = addProject(name).id;
    }
    const exp = createExperiment({ videoId, projectId: pid, plan: fd.get('plan') });
    state.experiments.unshift(setExperimentStatus(exp, fd.get('status')));
    commit(`Experiment started · +${XP.applied} XP 🚀`);
  });
}

function openEdit(id) {
  const v = videoById(id);
  openModal(`
    <h3>Edit video</h3>
    <div class="stack" style="margin-top:14px">
      <div class="field"><label>Title</label><input name="title" value="${esc(v.title)}" placeholder="Short name you'll recognise"></div>
      <div class="field"><label>Link</label><input name="url" type="url" required value="${esc(v.url)}"></div>
      <div class="field"><label>Note / caption</label><textarea name="note">${esc(v.note)}</textarea></div>
      <div class="field"><label>Topics</label>${topicChips(v.topics)}</div>
      <div class="field"><label>What I learned</label><textarea name="insight">${esc(v.insight)}</textarea></div>
      <div class="field"><label>How I could use it</label><textarea name="idea">${esc(v.idea)}</textarea></div>
      <div class="field"><label>Stage</label><select name="stage">
        ${['saved', 'watched', 'learned'].map(s => `<option ${v.stage === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="row" style="margin-top:16px">
      <button class="btn ghost danger" value="delete" formnovalidate>Delete</button>
      <span style="flex:1"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">Save</button>
    </div>`, (fd, action) => {
    const i = state.videos.findIndex(x => x.id === id);
    if (action === 'delete') {
      if (!confirm('Delete this video and its experiments?')) return true;
      state.videos.splice(i, 1);
      state.experiments = state.experiments.filter(e => e.videoId !== id);
      return commit('Deleted');
    }
    const url = fd.get('url').trim();
    const updated = advance(state.videos[i], fd.get('stage'), {
      title: fd.get('title').trim(), note: fd.get('note').trim(), topics: fd.getAll('topics'),
      insight: fd.get('insight').trim(), idea: fd.get('idea').trim(),
    });
    if (url !== v.url) Object.assign(updated, { url, key: normalizeUrl(url), platform: detectPlatform(url) });
    state.videos[i] = updated;
    commit('Saved');
  });
}
function addProject(name) {
  const p = { id: uid(), name: name.trim(), color: PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length], createdAt: Date.now() };
  state.projects.push(p);
  return p;
}

function openProject(id) {
  const p = id ? state.projects.find(x => x.id === id) : null;
  openModal(`
    <h3>${p ? 'Edit project' : 'New project'}</h3>
    <p class="sub">A client, brand or side project you want to apply what you learn to.</p>
    <div class="stack" style="margin-top:14px">
      <div class="field"><label>Name</label><input name="name" required autofocus value="${esc(p?.name)}" placeholder="e.g. SuperMIA"></div>
      <div class="field"><label>Context (optional)</label><textarea name="context" placeholder="Industry, goals, channels you run — so future-you knows which hacks fit">${esc(p?.context)}</textarea></div>
    </div>
    <div class="row" style="margin-top:16px">
      ${p ? '<button class="btn ghost danger" value="delete" formnovalidate>Delete</button>' : ''}
      <span style="flex:1"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="ok">${p ? 'Save' : 'Add project'}</button>
    </div>`, (fd, action) => {
    if (action === 'delete') {
      if (!confirm(`Delete ${p.name} and its experiments? Your videos & learnings stay.`)) return true;
      state.projects = state.projects.filter(x => x.id !== id);
      state.experiments = state.experiments.filter(e => e.projectId !== id);
      return commit('Project deleted');
    }
    const target = p || addProject(fd.get('name'));
    target.name = fd.get('name').trim();
    target.context = fd.get('context').trim();
    commit(p ? 'Saved' : `${target.name} connected 🔌`);
  });
}

function setStatus(expId, status) {
  const i = state.experiments.findIndex(e => e.id === expId);
  const exp = state.experiments[i];
  if (status === 'won' || status === 'flopped') {
    openModal(`
      <h3>${status === 'won' ? '🏆 It worked!' : "🧊 Didn't work"}</h3>
      <p class="sub">${esc(exp.plan)}</p>
      <div class="field" style="margin-top:14px"><label>${status === 'won' ? 'What was the result? Numbers beat feelings.' : 'What did you learn from it?'}</label>
        <textarea name="result" autofocus placeholder="${status === 'won' ? 'e.g. CPL dropped from $42 → $27 in 9 days' : 'e.g. Not enough budget for the learning phase'}">${esc(exp.result)}</textarea></div>
      <div class="row end" style="margin-top:16px">
        <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
        <button class="btn primary" value="ok">Save result</button>
      </div>`, fd => {
      state.experiments[i] = setExperimentStatus(exp, status, fd.get('result').trim());
      commit(status === 'won' ? `Win logged · +${XP.won} XP 🏆` : 'Logged. Failing fast is still learning.');
    });
    return;
  }
  state.experiments[i] = setExperimentStatus(exp, status);
  commit();
}

async function copyPlaybook(projectId) {
  const md = projectPlaybook(state, projectId);
  try { await navigator.clipboard.writeText(md); toast('Playbook copied as Markdown 📋'); }
  catch { download(`${state.projects.find(p => p.id === projectId).name}-playbook.md`, md, 'text/markdown'); }
}

function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function openSettings() {
  const share = `${location.origin}${location.pathname}?url=`;
  openModal(`
    <h3>Settings</h3>
    <div class="stack" style="margin-top:14px">
      <div class="field"><label>Theme</label>
        <select name="theme">${['auto', 'dark', 'light'].map(t => `<option ${(ui.theme || 'auto') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Add a custom topic</label>
        <input name="topicName" placeholder="e.g. Email Marketing">
        <input name="topicKeywords" placeholder="keywords, comma separated: newsletter, klaviyo, open rate" style="margin-top:8px"></div>
      <div class="field"><label>Send reels here from your phone</label>
        <div class="hint">
          <b>Android:</b> open this page in Chrome → menu → <i>Install app</i>. Then in Instagram tap <i>Share → Reel2Real</i>.<br>
          <b>iPhone:</b> add to Home Screen, then make a Shortcut that opens <code>${esc(share)}</code> + the shared URL (see README).
        </div></div>
      <div class="field"><label>Backup</label>
        <div class="row">
          <button class="btn small" value="export" formnovalidate>⤓ Export JSON</button>
          <label class="btn small" style="cursor:pointer">⤒ Import JSON<input type="file" name="file" accept="application/json" hidden id="import-file"></label>
          <button class="btn small ghost danger" value="wipe" formnovalidate>Wipe all data</button>
        </div>
        <div class="hint">Your data lives only in this browser. Export now and then.</div></div>
    </div>
    <div class="row end" style="margin-top:16px">
      <button class="btn ghost" value="cancel" formnovalidate>Close</button>
      <button class="btn primary" value="ok">Save</button>
    </div>`, (fd, action) => {
    if (action === 'export') {
      download(`reel2real-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2));
      return true;
    }
    if (action === 'wipe') {
      if (!confirm('Delete every video, learning, project and experiment? This cannot be undone.')) return true;
      state = emptyState();
      return commit('Everything wiped');
    }
    ui.theme = fd.get('theme');
    applyTheme();
    saveUi();
    const name = fd.get('topicName').trim();
    if (name) {
      state.customTopics.push({
        id: `c_${uid()}`, name, color: PROJECT_COLORS[(state.customTopics.length + 3) % PROJECT_COLORS.length],
        keywords: fd.get('topicKeywords').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      });
    }
    commit('Settings saved');
  });
  $('#import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      if (!Array.isArray(incoming.videos)) throw new Error('not a backup');
      state = mergeState(state, incoming);
      closeModal();
      commit(`Imported ${incoming.videos.length} videos`);
    } catch { toast("That file isn't a Reel2Real backup"); }
  });
}

function applyTheme() {
  if (ui.theme && ui.theme !== 'auto') document.documentElement.dataset.theme = ui.theme;
  else delete document.documentElement.dataset.theme;
}

// ---------- rendering ----------
function videoCard(v) {
  const exps = expsFor(v.id);
  const won = exps.filter(e => e.status === 'won').length;
  const steps = [true, !!v.watchedAt, !!v.learnedAt, exps.length > 0];
  let actions = '';
  if (v.stage === 'saved') {
    actions = `
      <button class="btn small" data-action="watched" data-id="${v.id}">✓ Watched</button>
      <button class="btn small primary" data-action="learn" data-id="${v.id}">💡 I learned…</button>`;
  } else if (v.stage === 'watched') {
    actions = `<button class="btn small primary" data-action="learn" data-id="${v.id}">💡 Capture the learning</button>`;
  } else {
    actions = `<button class="btn small primary" data-action="apply" data-id="${v.id}">🚀 Apply to project</button>`;
  }
  return `
  <article class="card video">
    <a class="plat ${v.platform}" href="${esc(v.url)}" target="_blank" rel="noopener" title="Open video">${PLATFORM_ICON[v.platform] || '🔗'}</a>
    <div>
      <div class="title">${esc(displayTitle(v))}</div>
      <div class="meta">${v.platform} · saved ${ago(v.addedAt)}${v.learnedAt ? ` · learned ${ago(v.learnedAt)}` : ''}${exps.length ? ` · ${exps.length} experiment${exps.length > 1 ? 's' : ''}${won ? ` · ${won} 🏆` : ''}` : ''}</div>
      ${v.topics.length ? `<div class="chips" style="margin-top:6px">${staticTopicChips(v.topics)}</div>` : ''}
      <div class="track" title="Saved → Watched → Learned → Applied">${steps.map(s => `<i class="${s ? 'on' : ''}"></i>`).join('')}</div>
      ${v.insight ? `<div class="insight"><small>Learned</small>${esc(v.insight)}${v.idea ? `<div class="hint" style="margin-top:4px">→ ${esc(v.idea)}</div>` : ''}</div>` : ''}
      <div class="actions">
        <a class="btn small ghost" href="${esc(v.url)}" target="_blank" rel="noopener">Open ↗</a>
        ${actions}
        <button class="btn small ghost" data-action="edit" data-id="${v.id}" aria-label="Edit">⋯</button>
      </div>
    </div>
  </article>`;
}

function renderVitals() {
  const xp = totalXp(state);
  const lv = levelFor(xp);
  const streak = learningStreak(state);
  $('#vitals').innerHTML = `
    <span class="pill" title="Days in a row you learned something">🔥 ${streak}</span>
    <span class="pill lvl xp" title="${lv.toNext} XP to next level">Lv ${lv.level} · ${xp} XP<i style="width:${Math.round(lv.progress * 100)}%"></i></span>`;
}

function captureCard(prefill = {}) {
  return `
  <form class="card capture stack" id="capture">
    <input type="url" name="url" placeholder="Paste an Instagram reel or YouTube link" value="${esc(prefill.url)}" required inputmode="url" autocomplete="off">
    <textarea name="note" placeholder="What's it about? Paste the caption or jot 3 words — topics get auto-tagged">${esc(prefill.note)}</textarea>
    ${topicChips(prefill.topics || [])}
    <div class="row end">
      <button class="btn" type="submit" name="mode" value="learn">Watched it → log learning</button>
      <button class="btn primary" type="submit" name="mode" value="save">Save to queue</button>
    </div>
  </form>`;
}

let pendingShare = null;
function renderToday() {
  const week = periodStats(state, 7);
  const picks = todaysPicks(state, 3);
  const unapplied = state.videos.filter(v => v.stage === 'learned' && !expsFor(v.id).length).slice(0, 3);
  const testing = state.experiments.filter(e => e.status === 'testing').slice(0, 3);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const backlog = state.videos.filter(v => v.stage === 'saved').length;

  $('#view-today').innerHTML = `
    <div>
      <p class="sub">${hello} 👋</p>
      <p class="hero">${backlog ? `<em>${backlog}</em> saved reel${backlog > 1 ? 's' : ''} waiting. Let's turn ${Math.min(3, backlog)} into knowledge.` : state.videos.length ? 'Queue clear. <em>Go apply something.</em>' : 'Stop saving reels. <em>Start using them.</em>'}</p>
    </div>
    ${captureCard(pendingShare || {})}
    <div class="stats">
      <div class="stat"><b>${week.watched}</b><span>Watched 7d</span></div>
      <div class="stat"><b>${week.learned}</b><span>Learned 7d</span></div>
      <div class="stat"><b>${week.applied}</b><span>Applied 7d</span></div>
      <div class="stat"><b>${week.won}</b><span>Wins 7d</span></div>
    </div>
    ${picks.length ? `<h2>Today's ${picks.length} — watch, then log one learning each</h2>${picks.map(videoCard).join('')}` : ''}
    ${unapplied.length ? `<h2>Learned but not used yet</h2>${unapplied.map(videoCard).join('')}` : ''}
    ${testing.length ? `<h2>Testing right now</h2><div class="card">${testing.map(expRow).join('')}</div>` : ''}
    ${!state.videos.length ? `
      <div class="card empty"><div class="big">🎬 → 💡 → 🚀 → 🏆</div>
        <p><b>Save</b> a reel · <b>Learn</b> one thing from it · <b>Apply</b> it to a project · <b>Log</b> the win.</p>
        <p class="hint">Tip: install this app on your phone, then share reels straight from Instagram.</p></div>` : ''}`;
  wireCapture();
}

function wireCapture() {
  const form = $('#capture');
  if (!form) return;
  let touched = !!pendingShare?.topics?.length;
  form.querySelectorAll('input[name=topics]').forEach(cb => cb.addEventListener('change', () => { touched = true; }));
  const autoTag = () => {
    if (touched) return;
    const ids = new Set(suggestTopics(form.note.value, allTopics(state)).slice(0, 3));
    form.querySelectorAll('input[name=topics]').forEach(cb => { cb.checked = ids.has(cb.value); });
  };
  form.note.addEventListener('input', autoTag);
  form.url.addEventListener('paste', () => setTimeout(() => {
    const raw = form.url.value;
    const url = extractUrl(raw);
    if (url && url !== raw) {
      form.url.value = url;
      if (!form.note.value) form.note.value = raw.replace(url, '').trim();
      autoTag();
    }
  }));
  if (pendingShare) { form.note.focus(); autoTag(); }
  form.addEventListener('submit', e => {
    e.preventDefault();
    const shared = pendingShare;
    pendingShare = null;
    const v = addVideo({ url: form.url.value, note: form.note.value, topics: new FormData(form).getAll('topics') });
    if (!v) { pendingShare = shared; return; }
    if (e.submitter?.value === 'learn') openLearn(v.id);
  });
}

function renderLibrary() {
  const tm = topicMap();
  const q = ui.q.toLowerCase();
  const applied = new Set(state.experiments.map(e => e.videoId));
  const list = state.videos.filter(v => {
    if (ui.stage === 'applied' ? !applied.has(v.id) : ui.stage !== 'all' && v.stage !== ui.stage) return false;
    if (ui.topic !== 'all' && !v.topics.includes(ui.topic)) return false;
    if (q && !`${v.title} ${v.note} ${v.insight} ${v.idea} ${v.url}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const stages = [['all', 'All'], ['saved', 'Queue'], ['watched', 'Watched'], ['learned', 'Learned'], ['applied', 'Applied']];
  $('#view-library').innerHTML = `
    <input class="search" type="search" placeholder="Search titles, notes, learnings…" value="${esc(ui.q)}" data-input="q">
    <div class="filters"><div class="seg">${stages.map(([id, l]) => `<button class="${ui.stage === id ? 'on' : ''}" data-action="stage" data-id="${id}">${l}</button>`).join('')}</div></div>
    <div class="filters">
      <button class="chip ${ui.topic === 'all' ? '' : 'off'}" data-action="topic" data-id="all">All topics</button>
      ${allTopics(state).map(t => `<button class="chip ${ui.topic === t.id ? '' : 'off'}" style="--c:${t.color}" data-action="topic" data-id="${t.id}">${esc(t.name)}</button>`).join('')}
    </div>
    <p class="hint">${list.length} video${list.length === 1 ? '' : 's'}${ui.topic !== 'all' ? ` in ${esc(tm.get(ui.topic)?.name)}` : ''}</p>
    ${list.length ? list.map(videoCard).join('') : '<div class="card empty"><div class="big">🔍</div>Nothing here yet.</div>'}`;
}

function expRow(e) {
  const v = videoById(e.videoId);
  const p = projectMap().get(e.projectId);
  return `
  <div class="exp ${e.status}">
    <div class="plan">${esc(e.plan)}</div>
    <div class="from">${p ? `<b style="color:${p.color}">${esc(p.name)}</b> · ` : ''}from: ${v ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.insight || displayTitle(v))}</a>` : 'deleted video'} · ${ago(e.createdAt)}</div>
    ${e.result ? `<div class="result">${e.status === 'won' ? '🏆' : '🧊'} ${esc(e.result)}</div>` : ''}
    <div class="status-row">${EXP_STATUSES.map(s => `<button class="${e.status === s.id ? 'on' : ''}" data-action="status" data-id="${e.id}" data-status="${s.id}">${s.emoji} ${s.label}</button>`).join('')}
      <button data-action="del-exp" data-id="${e.id}" title="Remove experiment">✕</button></div>
  </div>`;
}

function renderLab() {
  const order = { testing: 0, queued: 1, won: 2, flopped: 3 };
  const waiting = state.videos.filter(v => v.stage === 'learned' && !expsFor(v.id).length);
  const unused = PROJECT_SUGGESTIONS.filter(n => !state.projects.some(p => p.name.toLowerCase() === n.toLowerCase()));
  $('#view-lab').innerHTML = `
    <div>
      <p class="hero">The Lab 🧪</p>
      <p class="sub">Every learning becomes an experiment on a real project. Track what worked, kill what didn't.</p>
    </div>
    ${waiting.length ? `<h2>${waiting.length} learning${waiting.length > 1 ? 's' : ''} looking for a home</h2>${waiting.slice(0, 5).map(videoCard).join('')}` : ''}
    <h2>Projects</h2>
    ${state.projects.map(p => {
      const exps = state.experiments.filter(e => e.projectId === p.id).sort((a, b) => order[a.status] - order[b.status] || b.updatedAt - a.updatedAt);
      const won = exps.filter(e => e.status === 'won').length;
      return `
      <div class="card">
        <div class="project-head">
          <span class="dot" style="background:${p.color}"></span>
          <h3>${esc(p.name)}</h3>
          <div class="row">
            <span class="hint">${exps.length} exp · ${won} 🏆</span>
            ${exps.length ? `<button class="btn small ghost" data-action="playbook" data-id="${p.id}" title="Copy playbook as Markdown">📋 Playbook</button>` : ''}
            <button class="btn small ghost" data-action="edit-project" data-id="${p.id}">⋯</button>
          </div>
        </div>
        ${p.context ? `<p class="hint" style="margin:6px 0 0">${esc(p.context)}</p>` : ''}
        ${exps.length ? exps.map(expRow).join('') : '<p class="hint">No experiments yet. Hit “Apply to project” on any learning.</p>'}
      </div>`;
    }).join('')}
    <div class="card stack">
      <button class="btn primary" data-action="new-project">+ Connect a project</button>
      ${unused.length ? `<div class="chips"><span class="hint">Quick add:</span>${unused.map(n => `<button class="chip off" data-action="quick-project" data-id="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
    </div>`;
}

function renderMap() {
  const days = ui.period === 'all' ? Infinity : Number(ui.period);
  const st = periodStats(state, days);
  const rows = topicStats(state, days).filter(r => r.watched || r.learned || r.applied || r.backlog);
  const learnedRows = rows.filter(r => r.learned).sort((a, b) => b.learned - a.learned);
  const spots = blindSpots(state, days);
  const max = Math.max(1, ...rows.map(r => Math.max(r.learned, r.applied)));
  const label = days === Infinity ? 'All time' : `Last ${days} days`;
  const periods = [7, 10, 30, 90, 'all'];
  const funnel = [['Saved', st.saved], ['Watched', st.watched], ['Learned', st.learned], ['Applied', st.applied], ['Won', st.won]];
  const fmax = Math.max(1, ...funnel.map(f => f[1]));
  const wins = state.experiments.filter(e => e.status === 'won').sort((a, b) => b.doneAt - a.doneAt).slice(0, 6);
  const bank = allTopics(state).map(t => ({ t, vids: state.videos.filter(v => v.insight && v.topics.includes(t.id)) })).filter(x => x.vids.length);

  $('#view-map').innerHTML = `
    <div class="seg">${periods.map(p => `<button class="${String(ui.period) === String(p) ? 'on' : ''}" data-action="period" data-id="${p}">${p === 'all' ? 'All' : `${p}d`}</button>`).join('')}</div>
    <div>
      <p class="sub">${label}</p>
      <p class="hero">You watched <em>${st.watched}</em> video${st.watched === 1 ? '' : 's'} and learned <em>${st.learned}</em> thing${st.learned === 1 ? '' : 's'}${learnedRows.length ? ` — ${learnedRows.slice(0, 3).map(r => `${r.learned} ${esc(r.name)}`).join(', ')}` : ''}.</p>
      <p class="sub">${st.applied} applied to projects · ${st.won} win${st.won === 1 ? '' : 's'} · ${st.backlog} still in the queue</p>
    </div>

    <div class="card"><h2>From scroll to result</h2>
      <div class="funnel">${funnel.map(([l, n]) => `<div><b style="width:${Math.max(8, (n / fmax) * 78)}%">${n}</b><span>${l}</span></div>`).join('')}</div>
    </div>

    <div class="card"><h2>Knowledge by topic</h2>
      <div class="legend" style="margin-bottom:10px"><span style="--c:var(--text)">Applied</span><span style="--c:var(--text);--o:.3">Learned, not applied</span></div>
      ${rows.length ? `<div class="bars">${rows.sort((a, b) => b.learned - a.learned || b.backlog - a.backlog).map(r => {
        const appliedW = (Math.min(r.applied, r.learned || r.applied) / max) * 100;
        const learnedW = (Math.max(0, r.learned - r.applied) / max) * 100;
        return `<div class="bar-row"><span class="name" style="color:${r.color}">${esc(r.name)}</span>
          <span class="bar"><i style="width:${appliedW}%;background:${r.color}"></i><i style="width:${learnedW}%;background:${r.color};opacity:.3"></i></span>
          <span class="num" title="learned · applied · in queue">${r.learned} · ${r.applied}${r.backlog ? ` · <span title="in queue">⏳${r.backlog}</span>` : ''}</span></div>`;
      }).join('')}</div>` : '<p class="hint">Nothing in this window yet.</p>'}
    </div>

    ${spots.length ? `<div class="card"><h2>Blind spots 👀</h2>
      <p class="sub">You keep <b>saving</b> these but haven't <b>learned</b> from them in this window:</p>
      <div class="chips" style="margin-top:8px">${spots.map(r => `<button class="chip" style="--c:${r.color}" data-action="goto-topic" data-id="${r.id}">${esc(r.name)} · ${r.backlog} waiting</button>`).join('')}</div></div>` : ''}

    ${wins.length ? `<div class="card"><h2>Wins wall 🏆</h2>${wins.map(e => {
      const v = videoById(e.videoId);
      const p = projectMap().get(e.projectId);
      return `<div class="exp"><div class="plan">${esc(e.plan)}</div>
        <div class="from">${p ? `<b style="color:${p.color}">${esc(p.name)}</b> · ` : ''}${v ? staticTopicChips(v.topics.slice(0, 2)) : ''}</div>
        ${e.result ? `<div class="result">🏆 ${esc(e.result)}</div>` : ''}</div>`;
    }).join('')}</div>` : ''}

    <div class="card"><h2>Knowledge bank</h2>
      ${bank.length ? bank.map(({ t, vids }) => `
        <details><summary style="cursor:pointer;padding:6px 0"><b style="color:${t.color}">${esc(t.name)}</b> <span class="hint">${vids.length} learning${vids.length > 1 ? 's' : ''}</span></summary>
          <ul style="margin:4px 0 10px;padding-left:20px">${vids.map(v => `<li style="margin:4px 0">${esc(v.insight)} <a class="hint" href="${esc(v.url)}" target="_blank" rel="noopener">↗</a></li>`).join('')}</ul>
        </details>`).join('') : '<p class="hint">Every learning you log lands here, grouped by topic — your personal marketing playbook.</p>'}
    </div>`;
}

function render() {
  renderVitals();
  const views = { today: renderToday, library: renderLibrary, lab: renderLab, map: renderMap };
  views[ui.tab]();
  document.querySelectorAll('.view').forEach(s => { s.hidden = s.dataset.view !== ui.tab; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
}

function go(tab) {
  ui.tab = tab;
  saveUi();
  render();
  window.scrollTo({ top: 0 });
}

// ---------- events ----------
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) return go(tab.dataset.tab);
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  switch (action) {
    case 'watched': return markWatched(id);
    case 'learn': return openLearn(id);
    case 'apply': return openApply(id);
    case 'edit': return openEdit(id);
    case 'status': return setStatus(id, el.dataset.status);
    case 'del-exp':
      if (confirm('Remove this experiment?')) { state.experiments = state.experiments.filter(x => x.id !== id); commit(); }
      return;
    case 'playbook': return copyPlaybook(id);
    case 'new-project': return openProject();
    case 'edit-project': return openProject(id);
    case 'quick-project': addProject(id); return commit(`${id} connected 🔌`);
    case 'stage': ui.stage = id; return render();
    case 'topic': ui.topic = id; return render();
    case 'period': ui.period = id === 'all' ? 'all' : Number(id); saveUi(); return render();
    case 'goto-topic': ui.topic = id; ui.stage = 'saved'; return go('library');
    case 'open-settings': return openSettings();
  }
});

document.addEventListener('input', e => {
  if (e.target.dataset.input === 'q') {
    ui.q = e.target.value;
    const pos = e.target.selectionStart;
    renderLibrary();
    const s = document.querySelector('[data-input="q"]');
    s.focus();
    s.setSelectionRange(pos, pos);
  }
});

// Share target (Android) and ?url= deep links (iOS Shortcuts, bookmarklets).
function ingestShare() {
  const params = new URLSearchParams(location.search);
  const raw = [params.get('url'), params.get('text'), params.get('title')].filter(Boolean).join(' ');
  if (!raw) return;
  const url = extractUrl(raw);
  history.replaceState(null, '', location.pathname);
  if (!url) return;
  const note = raw.replace(url, '').replace(/\s+/g, ' ').trim();
  const dup = findDuplicate(state, url);
  if (dup) { toast('Already saved — it’s in your library'); return; }
  pendingShare = { url, note, topics: suggestTopics(note, allTopics(state)).slice(0, 3) };
  ui.tab = 'today';
  if (params.get('save') === '1') {
    addVideo(pendingShare);
    pendingShare = null;
  }
}

window.addEventListener('storage', e => { if (e.key === STORE_KEY) { state = load(STORE_KEY) || emptyState(); render(); } });

applyTheme();
ingestShare();
render();
if (pendingShare) toast(`Got it from ${detectPlatform(pendingShare.url)} — add a note & save`);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
