import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { emptyState, memoryStore, redisStore } from '../lib/store.js';
import { createIdea, markStep, pickNext, rankIdeas, normalizeUrl, findDuplicate, seenBefore, parseStage, stalled } from '../lib/ideas.js';
import { chunk, ideaCard, morningBrief } from '../lib/format.js';
import { respond, handleMessage } from '../lib/agent.js';
import { verifySignature, parseWebhook, isWindowClosed } from '../lib/whatsapp.js';
import { parseMeta } from '../lib/preview.js';
import { createBrain, offlineBrain } from '../lib/ai.js';
import { runJob } from '../lib/jobs.js';
import { config } from '../lib/config.js';
import { POST as webhookPOST, GET as webhookGET } from '../api/whatsapp.js';
import { GET as cronGET } from '../api/cron.js';
import { GET as statusGET, healthChecks } from '../api/status.js';

const analysis = (over = {}) => ({
  title: 'Meta Andromeda creative test', one_liner: 'Put 10 creatives in one ad set', category: 'meta-ads',
  money_score: 8, money_why: 'Clients pay for lower CPL', how_it_earns: 'Sell as a $500 audit', effort: 'small',
  cost_estimate: '$50 ad spend', first_test: 'Run on one client for 7 days', client_pitch: 'We cut your CPL',
  needs_from_you: ['Ad account access'],
  steps: [{ text: 'Write 10 ad hooks', owner: 'agent' }, { text: 'Launch the ad set', owner: 'you' }, { text: 'Report results', owner: 'agent' }],
  ...over,
});

function fakeBrain() {
  const calls = [];
  return {
    calls,
    kind: 'fake',
    async analyzeIdea(input) { calls.push(['analyze', input]); return analysis(); },
    async doStep({ step }) { calls.push(['do', step.n]); return `DELIVERABLE for step ${step.n}`; },
    async chat({ text }) { calls.push(['chat', text]); return /idea/.test(text) ? { intent: 'new_idea', reply: '' } : { intent: 'answer', reply: `answer: ${text}` }; },
  };
}
const fakeWa = () => { const sent = []; return { sent, async sendText(to, text) { sent.push({ to, text }); }, async sendTemplate(to, name) { sent.push({ to, template: name }); } }; };
const baseCfg = (over = {}) => ({ ...config({}), ownerNumber: '911234567890', ...over });
const deps = (over = {}) => ({ cfg: baseCfg(), brain: fakeBrain(), wa: fakeWa(), store: memoryStore(), preview: async () => '', downloadMedia: async () => ({ base64: 'AAA', mimeType: 'image/jpeg' }), autoDo: false, ...over });
const msg = (text, extra = {}) => ({ id: `m${Math.random()}`, from: '911234567890', type: 'text', text, ...extra });

test('normalizeUrl ignores tracking params and reel/reels variants', () => {
  assert.equal(normalizeUrl('https://www.instagram.com/reels/ABC/?igsh=1'), 'https://www.instagram.com/reel/ABC/');
  assert.equal(normalizeUrl('https://youtu.be/xyz?si=2'), 'https://www.youtube.com/watch?v=xyz');
  assert.equal(normalizeUrl('https://m.youtube.com/shorts/xyz'), 'https://www.youtube.com/watch?v=xyz');
});

test('createIdea clamps score, numbers ideas and detects duplicates', () => {
  const s = emptyState();
  const a = createIdea(s, analysis({ money_score: 42 }), { urls: ['https://instagram.com/reel/A/'] });
  const b = createIdea(s, analysis({ steps: ['plain string step'] }), { urls: [] });
  assert.equal(a.n, 1); assert.equal(b.n, 2);
  assert.equal(a.moneyScore, 10);
  assert.equal(b.steps[0].text, 'plain string step');
  assert.equal(findDuplicate(s, ['https://www.instagram.com/reel/A/?igsh=zz']).n, 1);
});

test('marking the first step moves Saved → Testing; ranking prefers money then momentum', () => {
  const s = emptyState();
  const low = createIdea(s, analysis({ money_score: 3 }), { urls: [] });
  const high = createIdea(s, analysis({ money_score: 9 }), { urls: [] });
  assert.equal(rankIdeas(s)[0].n, high.n);
  markStep(low, 1);
  assert.equal(low.stage, 'testing');
  assert.deepEqual(pickNext(s).step.n, 1);
  assert.equal(pickNext(s).idea.n, high.n);
});

test('parseStage accepts prefixes', () => {
  assert.equal(parseStage('build'), 'building');
  assert.equal(parseStage('LIVE'), 'live');
  assert.equal(parseStage('zz'), null);
});

test('stalled finds ideas untouched for days', () => {
  const s = emptyState();
  const i = createIdea(s, analysis(), { urls: [] }, Date.now() - 9 * 86400000);
  assert.equal(stalled(s)[0].n, i.n);
});

test('seenBefore de-duplicates webhook retries', () => {
  const s = emptyState();
  assert.equal(seenBefore(s, 'x'), false);
  assert.equal(seenBefore(s, 'x'), true);
});

test('chunk splits long messages under WhatsApp limit', () => {
  const parts = chunk(`${'a'.repeat(3000)}\n\n${'b'.repeat(3000)}\n\n${'c'.repeat(9000)}`);
  assert.ok(parts.every(p => p.length <= 3800));
  assert.equal(parts.join('').replace(/\n/g, '').length, 15000);
});

test('ideaCard shows reply commands', () => {
  const s = emptyState();
  const card = ideaCard(createIdea(s, analysis(), { urls: [] }));
  assert.match(card, /\*#1 Meta Andromeda creative test\*/);
  assert.match(card, /do 1\.1/);
});

test('respond: link → new idea with plan; same link again → duplicate', async () => {
  const d = deps();
  const s = emptyState();
  const r1 = await respond(s, msg('https://www.instagram.com/reel/XYZ/?igsh=a meta ads trick'), d);
  assert.match(r1[0], /Saved as \*#1\*/);
  assert.equal(s.ideas.length, 1);
  const r2 = await respond(s, msg('look https://instagram.com/reel/XYZ/'), d);
  assert.match(r2[0], /already sent this one/);
  assert.equal(s.ideas.length, 1);
});

test('respond: screenshot is downloaded and passed to the brain', async () => {
  const d = deps();
  const s = emptyState();
  await respond(s, msg('', { type: 'image', mediaId: 'MEDIA1' }), d);
  const [, input] = d.brain.calls.find(c => c[0] === 'analyze');
  assert.equal(input.image.base64, 'AAA');
  assert.equal(s.ideas[0].source.platform, 'screenshot');
});

test('respond: commands list/next/done/do/move/earned/note/drop', async () => {
  const d = deps();
  const s = emptyState();
  await respond(s, msg('idea: sell AI receptionists to dentists'), d);
  assert.match((await respond(s, msg('list'), d))[0], /#1/);
  assert.match((await respond(s, msg('next'), d))[0], /Step 1\.1/);

  const doIt = await respond(s, msg('do 1.1'), d);
  assert.match(doIt[0], /DELIVERABLE for step 1/);
  assert.equal(s.ideas[0].steps[0].done, true, 'agent-owned step is done once delivered');
  assert.equal(s.ideas[0].stage, 'testing');

  assert.match((await respond(s, msg('done 1'), d))[0], /1\.2 done/);
  assert.match((await respond(s, msg('undo 1.2'), d))[0], /not done/);
  assert.match((await respond(s, msg('move 1 live'), d))[0], /Live/);
  assert.match((await respond(s, msg('earned 1 ₹12,500'), d))[0], /12500/);
  assert.equal(s.ideas[0].stage, 'earning');
  await respond(s, msg('note 1 dentist in Surat said yes'), d);
  assert.equal(s.ideas[0].notes[0].text, 'dentist in Surat said yes');
  assert.match((await respond(s, msg('drop 1'), d))[0], /Dropped/);
  assert.match((await respond(s, msg('7'), d))[0], /No idea #7/);
});

test('respond: plain question goes to AI chat; chat can classify as a new idea', async () => {
  const d = deps();
  const s = emptyState();
  assert.equal((await respond(s, msg('which is fastest to money?'), d))[0], 'answer: which is fastest to money?');
  assert.match((await respond(s, msg('I have an idea about local SEO audits for gyms'), d))[0], /Saved as/);
});

test('respond: voice notes and raw videos get a helpful message', async () => {
  const d = deps();
  assert.match((await respond(emptyState(), { id: '1', from: 'x', type: 'audio', text: '', note: 'audio' }, d))[0], /voice notes/);
});

test('handleMessage ignores strangers and retries, and reports errors instead of going silent', async () => {
  const d = deps();
  assert.deepEqual(await handleMessage({ ...msg('hi'), from: '19999' }, d), { ignored: 'not-owner' });
  const m = msg('help');
  await handleMessage(m, d);
  assert.deepEqual(await handleMessage(m, d), { ignored: 'duplicate' });
  assert.equal(d.wa.sent.length, 1);

  d.brain.analyzeIdea = async () => { throw new Error('AI down'); };
  await handleMessage(msg('https://youtu.be/abc'), d);
  assert.match(d.wa.sent.at(-1).text, /Something went wrong: AI down/);
  const state = await d.store.load();
  assert.equal(state.meta.lastError.message, 'AI down');
  assert.ok(state.meta.lastInboundAt);
});

const webhookBody = text => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1', from: '911234567890', timestamp: '1700000000', type: 'text', text: { body: text } }] } }] }] });

test('parseWebhook reads text and image messages, skips status updates', () => {
  const body = { entry: [{ changes: [{ value: { statuses: [{ id: 's' }], messages: [{ id: 'a', from: '1', type: 'image', image: { id: 'IMG', caption: 'cap', mime_type: 'image/png' } }] } }] }] };
  assert.deepEqual(parseWebhook(body).map(m => [m.mediaId, m.text]), [['IMG', 'cap']]);
  assert.equal(parseWebhook({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }).length, 0);
});

test('verifySignature accepts Meta signature and rejects tampering', () => {
  const raw = JSON.stringify(webhookBody('hi'));
  const sig = `sha256=${createHmac('sha256', 'shh').update(raw).digest('hex')}`;
  assert.equal(verifySignature(raw, sig, 'shh'), true);
  assert.equal(verifySignature(`${raw} `, sig, 'shh'), false);
  assert.equal(verifySignature(raw, undefined, 'shh'), false);
});

test('webhook POST end to end: signed request → reply sent', async () => {
  const d = deps({ cfg: baseCfg({ waAppSecret: 'shh' }) });
  const raw = JSON.stringify(webhookBody('help'));
  const sig = `sha256=${createHmac('sha256', 'shh').update(raw).digest('hex')}`;
  const res = await webhookPOST(new Request('http://x/api/whatsapp', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': sig } }), d);
  assert.equal(res.status, 200);
  assert.match(d.wa.sent[0].text, /Idea Agent/);
  const bad = await webhookPOST(new Request('http://x/api/whatsapp', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': 'sha256=00' } }), d);
  assert.equal(bad.status, 401);
});

test('webhook GET verification handshake', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'abc';
  const ok = await webhookGET(new Request('http://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=42'));
  assert.equal(await ok.text(), '42');
  const no = await webhookGET(new Request('http://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42'));
  assert.equal(no.status, 403);
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});

test('cron requires the secret and sends the morning heartbeat', async () => {
  const d = deps({ cfg: baseCfg({ cronSecret: 'c' }) });
  assert.equal((await cronGET(new Request('http://x/api/cron?job=morning'), d)).status, 401);
  const res = await cronGET(new Request('http://x/api/cron?job=morning', { headers: { authorization: 'Bearer c' } }), d);
  assert.deepEqual(await res.json(), { sent: 'morning', via: 'text' });
  assert.match(d.wa.sent[0].text, /Good morning/);
  assert.ok((await d.store.load()).meta.lastBriefAt);
});

test('brief falls back to a template when the 24h window is closed', async () => {
  const d = deps({ cfg: baseCfg({ waTemplate: 'hello_world' }) });
  d.wa.sendText = async () => { const e = new Error('Re-engagement message'); e.code = 131047; throw e; };
  assert.deepEqual(await runJob('morning', d), { sent: 'morning', via: 'template' });
  assert.equal(d.wa.sent[0].template, 'hello_world');
  assert.equal(isWindowClosed({ code: 131047 }), true);
});

test('status: public JSON lists problems; token shows the tracker page', async () => {
  const d = deps({ cfg: baseCfg({ statusToken: 'tok' }) });
  const s = await d.store.load();
  createIdea(s, analysis(), { urls: ['https://instagram.com/reel/Q/'] });
  await d.store.save(s);
  const pub = await statusGET(new Request('http://x/api/status'), d);
  assert.equal(pub.status, 503);
  const body = await pub.json();
  assert.ok(body.problems.some(p => /AI not connected/.test(p)));
  assert.ok(!JSON.stringify(body).includes('Andromeda'), 'public check must not leak ideas');
  const page = await statusGET(new Request('http://x/api/status?token=tok'), d);
  assert.match(await page.text(), /Meta Andromeda creative test/);
});

test('healthChecks is clean when fully configured and brief is fresh', () => {
  const s = emptyState();
  s.meta.lastBriefAt = Date.now();
  const report = { whatsapp: true, owner: true, ai: true, storage: 'redis', signatureCheck: true, cronSecret: true };
  assert.deepEqual(healthChecks(s, report), []);
  s.meta.createdAt = Date.now() - 3 * 86400000;
  s.meta.lastBriefAt = Date.now() - 2 * 86400000;
  assert.equal(healthChecks(s, report).length, 1);
});

test('morningBrief always confirms the agent is alive', () => {
  assert.match(morningBrief(emptyState(), null), /running/);
});

test('parseMeta reads og tags in either attribute order', () => {
  assert.deepEqual(parseMeta('<meta property="og:title" content="Hi &amp; bye"><meta content="Desc" name="description">'), { title: 'Hi & bye', description: 'Desc' });
});

test('redisStore talks Upstash REST', async () => {
  const db = {};
  const fetchImpl = async (_url, { body }) => {
    const [cmd, key, val] = JSON.parse(body);
    if (cmd === 'SET') db[key] = val;
    return new Response(JSON.stringify({ result: cmd === 'GET' ? db[key] ?? null : 'OK' }));
  };
  const store = redisStore('https://r.upstash.io', 't', fetchImpl);
  const s = await store.load();
  s.seq = 5;
  await store.save(s);
  assert.equal((await store.load()).seq, 5);
});

test('Claude brain sends structured-output request with image and parses JSON', async () => {
  let req;
  const client = { beta: { messages: { create: async r => { req = r; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(analysis()) }] }; } } } };
  const brain = createBrain(baseCfg(), { client });
  const out = await brain.analyzeIdea({ text: 'hi', preview: '', image: { base64: 'AAA', mimeType: 'image/png' } });
  assert.equal(out.title, 'Meta Andromeda creative test');
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.content, undefined);
  assert.equal(req.messages[0].content[0].type, 'image');
  assert.equal(req.fallbacks, 'default');
});

test('Claude brain reports refusals clearly; history starts with a user turn', async () => {
  let req;
  const client = { beta: { messages: { create: async r => { req = r; return { stop_reason: 'refusal', content: [] }; } } } };
  const brain = createBrain(baseCfg(), { client });
  await assert.rejects(brain.chat({ text: 'q', history: [{ role: 'agent', text: 'old' }, { role: 'you', text: 'a' }] }), /declined/);
  assert.equal(req.messages[0].role, 'user');
});

test('offline brain still produces a usable plan', async () => {
  const a = await offlineBrain().analyzeIdea({ text: 'https://x.com/a Use FAQ schema for AEO' });
  assert.match(a.title, /FAQ schema/);
  assert.ok(a.steps.length >= 3);
});

test('new idea: sends "Got it" first, then the plan, then does the first agent step automatically', async () => {
  const d = deps({ autoDo: true });
  await handleMessage(msg('https://www.instagram.com/reel/AUTO1/ use FAQ schema for AEO'), d);
  const texts = d.wa.sent.map(x => x.text);
  assert.match(texts[0], /Got it, analysing/);
  assert.match(texts[1], /Saved as \*#1\*/);
  assert.match(texts[2], /Done for you: 1\.1/);
  assert.match(texts[2], /DELIVERABLE for step 1/);
  assert.match(texts[3], /Your turn: \*1\.2\*/);
  const s = await d.store.load();
  assert.equal(s.ideas[0].steps[0].done, true);
});

test('config reads secrets from normal names or from numbered pieces', async () => {
  const { config: c, aiProviderOf } = await import('../lib/config.js');
  const cfg = c({ WA_K1: 'abcdefghij', WA_K2: 'klmnopqrstuv', GEMINI_API_KEY: 'g'.repeat(39), OWNER_WHATSAPP_NUMBER: '+91 79902 49914' });
  assert.equal(cfg.waToken, 'abcdefghijklmnopqrstuv');
  assert.equal(cfg.ownerNumber, '917990249914');
  assert.equal(aiProviderOf(cfg), 'gemini');
  assert.equal(c({ WHATSAPP_TOKEN: 'x'.repeat(30), WA_K1: 'old' }).waToken, 'x'.repeat(30));
});

test('blob store migrates the old Grok tracker on first load', async () => {
  const { blobStore } = await import('../lib/store.js');
  const files = {
    'data/store.json': JSON.stringify({ next_id: 3, ideas: [
      { id: 1, title: '48-Hour AI SEO Audit', source_link: 'DfHjKrlCKNM', summary: 'Sell audits', money_score: 8, effort: 'low', stage: 'Saved', steps: [{ number: 1, text: 'Pick niche', status: 'done' }, { number: 2, text: 'Price it', status: 'todo' }], created_at: '2026-10-31T10:00:00Z' },
      { id: 2, title: 'Ad Agency Retainers', source_link: 'https://www.instagram.com/reel/DdMHjYnpEvL/', summary: '', money_score: 8, effort: 'medium', stage: 'Testing', steps: [], created_at: '2026-10-31T11:00:00Z' },
    ] }),
  };
  const blob = {
    async get(path) { return files[path] ? { statusCode: 200, stream: new Response(files[path]).body } : null; },
    async put(path, body) { files[path] = body; },
  };
  const store = blobStore(blob);
  const s = await store.load();
  assert.deepEqual(s.ideas.map(i => [i.n, i.title, i.moneyScore, i.stage]), [[1, '48-Hour AI SEO Audit', 8, 'saved'], [2, 'Ad Agency Retainers', 8, 'testing']]);
  assert.equal(s.ideas[0].steps[0].done, true);
  assert.equal(s.seq, 2);
  assert.equal(findDuplicate(s, ['https://instagram.com/reel/DdMHjYnpEvL/?igsh=1']).n, 2);
  createIdea(s, analysis(), { urls: [] });
  assert.equal(s.ideas.at(-1).n, 3);
  await store.save(s);
  assert.equal((await store.load()).ideas.length, 3);
});

test('Gemini brain: JSON request, YouTube video attached, falls back to lite model when slow', async () => {
  const { createGeminiBrain, parseJsonLoose } = await import('../lib/gemini.js');
  const calls = [];
  const fetchImpl = async (url, { body }) => {
    calls.push({ url, body: JSON.parse(body) });
    if (calls.length === 1) return new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(analysis()) + '\n```' }] } }] }));
  };
  const brain = createGeminiBrain({ ...baseCfg(), geminiKey: 'k', geminiModel: 'gemini-flash-latest', geminiFallbackModel: 'gemini-flash-lite-latest' }, fetchImpl);
  const out = await brain.analyzeIdea({ text: 'watch this', urls: ['https://youtu.be/abc123'] });
  assert.equal(out.title, 'Meta Andromeda creative test');
  assert.match(calls[0].url, /gemini-flash-latest:generateContent/);
  assert.match(calls[1].url, /gemini-flash-lite-latest:generateContent/);
  assert.equal(calls[0].body.contents[0].parts[0].file_data.file_uri, 'https://youtu.be/abc123');
  assert.equal(calls[0].body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(parseJsonLoose('noise {"a":1} noise'), { a: 1 });
});

test('status reports an expired WhatsApp token in plain words', async () => {
  const d = deps();
  d.wa.checkToken = async () => ({ ok: false, expired: true, problem: 'WhatsApp token EXPIRED: create a permanent token' });
  d.cfg.waToken = 't'; d.cfg.waPhoneId = 'p';
  const body = await (await statusGET(new Request('http://x/api/status'), d)).json();
  assert.match(body.problems[0], /EXPIRED/);
  assert.equal(body.checks.whatsappTokenValid, false);
});

test('handlers ignore the extra context argument Vercel passes', async () => {
  const res = await statusGET(new Request('http://x/api/status'), { waitUntil() {} });
  assert.ok([200, 503].includes(res.status));
});

test('reel reader: reads the public caption honestly, no disguised requests, no video scraping', async () => {
  const { parseInstagramMeta, fetchReel } = await import('../lib/reel.js');
  const page = '<meta property="og:description" content="6,581 likes, 6,028 comments - nivedan.ai on September 12, 2026: &quot;What if your AI could search the web? &#x1f440;\nComment AI to get it&quot;." />';
  const meta = parseInstagramMeta(page);
  assert.equal(meta.author, 'nivedan.ai');
  assert.match(meta.caption, /^What if your AI could search the web\? 👀\nComment AI/);
  const requests = [];
  const fetchImpl = async (url, opts) => { requests.push({ url, ua: opts.headers['User-Agent'] }); return new Response(page); };
  const reel = await fetchReel('https://www.instagram.com/reel/XYZ/?igsh=1', fetchImpl);
  assert.equal(reel.author, 'nivedan.ai');
  assert.equal(reel.video, undefined);
  assert.equal(requests.length, 1, 'only the public post page');
  assert.match(requests[0].ua, /^IdeaAgent\//);
});

test('WhatsApp video message (screen recording) is watched by the AI', async () => {
  const d = deps({ downloadMedia: async () => ({ base64: 'VID', mimeType: 'video/mp4' }) });
  const s = emptyState();
  await respond(s, msg('', { type: 'video', mediaId: 'M1', isVideo: true }), d);
  const [, input] = d.brain.calls.find(c => c[0] === 'analyze');
  assert.equal(input.video.base64, 'VID');
  assert.equal(input.image, null);
  assert.equal(s.ideas.length, 1);
});

test('new idea from an Instagram link uses the downloaded video', async () => {
  const d = deps({ readReel: async () => ({ platform: 'instagram', author: 'x', caption: 'SEO trick', video: { base64: 'V', mimeType: 'video/mp4' } }) });
  await respond(emptyState(), msg('https://www.instagram.com/reel/VID1/'), d);
  const [, input] = d.brain.calls.find(c => c[0] === 'analyze');
  assert.equal(input.video.base64, 'V');
  assert.match(input.preview, /SEO trick/);
});

test('/api/reel and /api/ideas need the token and update the shared tracker', async () => {
  const { GET: reelGET } = await import('../api/reel.js');
  const { GET: ideasGET, POST: ideasPOST } = await import('../api/ideas.js');
  const d = deps({ cfg: baseCfg({ statusToken: 'tok' }), readReel: async url => ({ url, platform: 'instagram', caption: 'c', notes: [], video: { base64: 'V', mimeType: 'video/mp4', bytes: 1 } }) });
  d.brain.understandReel = async () => ({ title: 'Free AI web scraper', github_repos: ['owner/repo'] });
  assert.equal((await reelGET(new Request('http://x/api/reel?url=https://instagram.com/reel/A/'), d)).status, 401);
  const r = await (await reelGET(new Request('http://x/api/reel?token=tok&url=https://instagram.com/reel/A/'), d)).json();
  assert.equal(r.understanding.github_repos[0], 'owner/repo');
  assert.equal(r.reel.videoWatched, true);
  assert.equal(r.reel.video, undefined, 'never returns the raw video');

  const post = body => ideasPOST(new Request('http://x/api/ideas?token=tok', { method: 'POST', body: JSON.stringify(body) }), d);
  const added = await (await post({ action: 'add', url: 'https://instagram.com/reel/A/', idea: analysis(), notify: true })).json();
  assert.equal(added.idea.n, 1);
  assert.match(d.wa.sent[0].text, /New idea added from Claude/);
  assert.equal((await (await post({ action: 'add', url: 'https://www.instagram.com/reel/A/?igsh=2', idea: analysis() })).json()).duplicate, true);
  await post({ action: 'step', n: 1, step: 1, output: 'Cloned repo and ran it' });
  const list = await (await ideasGET(new Request('http://x/api/ideas?token=tok'), d)).json();
  assert.equal(list.ideas[0].steps[0].done, true);
  assert.equal(list.ideas[0].steps[0].output, 'Cloned repo and ran it');
});

test('AI_PROVIDER=claude never silently falls back to Gemini', async () => {
  const { config: c, aiProviderOf } = await import('../lib/config.js');
  assert.equal(aiProviderOf(c({ AI_PROVIDER: 'claude', GEMINI_API_KEY: 'g'.repeat(39) })), 'offline');
  assert.equal(aiProviderOf(c({ AI_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'sk-ant-xxxxxxxxxxxxxxxx' })), 'claude');
});

test('Claude brain can read a reel caption', async () => {
  let req;
  const client = { beta: { messages: { create: async r => { req = r; return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"title":"Agent Reach"}' }] }; } } } };
  const out = await createBrain(baseCfg(), { client }).understandReel({ url: 'u', caption: 'Meet Agent Reach' });
  assert.equal(out.title, 'Agent Reach');
  assert.match(JSON.stringify(req.messages), /Meet Agent Reach/);
});
