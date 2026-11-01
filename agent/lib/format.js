// WhatsApp-friendly text (*bold*, _italic_). Short lines, numbers you can reply with.

import { STAGES, stageOf, progress, nextStep, rankIdeas, stats, stalled } from './ideas.js';

const bar = pct => '▓'.repeat(Math.round(pct / 20)) + '░'.repeat(5 - Math.round(pct / 20));

export function ideaCard(idea) {
  const p = progress(idea);
  const st = stageOf(idea.stage);
  const lines = [
    `*#${idea.n} ${idea.title}*`,
    idea.oneLiner && `_${idea.oneLiner}_`,
    '',
    `💰 Money score: *${idea.moneyScore}/10*${idea.moneyWhy ? ` — ${idea.moneyWhy}` : ''}`,
    idea.howItEarns && `💵 How it earns: ${idea.howItEarns}`,
    `⏱️ Effort: ${idea.effort}${idea.cost ? `  •  Cost: ${idea.cost}` : ''}`,
    `${st.emoji} Stage: ${st.label}  ${bar(p.pct)} ${p.done}/${p.total}`,
    idea.firstTest && `\n🧪 *First test:* ${idea.firstTest}`,
    '',
    '*Steps*',
    ...idea.steps.map(s => `${s.done ? '✅' : s.owner === 'agent' ? '🤖' : '👤'} ${idea.n}.${s.n} ${s.text}${s.output && !s.done ? ' _(draft ready)_' : ''}`),
    idea.needsFromYou?.length ? `\n*Needs from you:* ${idea.needsFromYou.join('; ')}` : '',
    idea.clientPitch && `\n🤝 *Client pitch:* ${idea.clientPitch}`,
    idea.revenue ? `\n💰 Earned so far: ${idea.revenue}` : '',
  ];
  const nx = nextStep(idea);
  if (nx) {
    lines.push('', nx.owner === 'agent'
      ? `👉 Reply *do ${idea.n}.${nx.n}* and I'll do step ${nx.n} for you.`
      : `👉 Next: ${nx.text}. Reply *done ${idea.n}.${nx.n}* when finished.`);
  }
  return lines.filter(l => typeof l === 'string').join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function ideaLine(idea) {
  const p = progress(idea);
  return `${stageOf(idea.stage).emoji} *#${idea.n}* ${idea.title} — 💰${idea.moneyScore} • ${p.done}/${p.total}`;
}

export function listText(state, stage) {
  const ideas = state.ideas.filter(i => (stage ? i.stage === stage : i.stage !== 'dropped'));
  if (!ideas.length) return stage ? `No ideas in *${stageOf(stage).label}*.` : 'No ideas yet. Forward me a reel, a screenshot, or just type an idea.';
  const groups = STAGES.filter(s => (stage ? s.id === stage : s.id !== 'dropped'))
    .map(s => ({ s, items: ideas.filter(i => i.stage === s.id) }))
    .filter(g => g.items.length);
  return [
    `*Your ideas (${ideas.length})*`,
    ...groups.flatMap(g => ['', `*${g.s.emoji} ${g.s.label}*`, ...g.items.sort((a, b) => b.moneyScore - a.moneyScore).map(ideaLine)]),
    '',
    'Reply a number (e.g. *3*) to open one.',
  ].join('\n');
}

export function topText(state, k = 3) {
  const top = rankIdeas(state).slice(0, k);
  if (!top.length) return 'Nothing in progress. Forward me a reel to start.';
  return ['*Top ideas to push now*', ...top.map((i, x) => `${x + 1}. ${ideaLine(i)}`), '', 'Reply *next* for the one thing to do today.'].join('\n');
}

export function nextText(pick) {
  if (!pick) return 'Nothing to do. Every idea is finished or empty. Forward me a new reel! 🎬';
  const { idea, step } = pick;
  return [
    `*Today's one thing* 🎯`,
    `#${idea.n} ${idea.title} (💰${idea.moneyScore}/10)`,
    '',
    `Step ${idea.n}.${step.n}: ${step.text}`,
    '',
    step.owner === 'agent'
      ? `🤖 I can do this one. Reply *do ${idea.n}.${step.n}*.`
      : `👤 This one needs you. Reply *done ${idea.n}.${step.n}* when it's finished, or *do ${idea.n}.${step.n}* and I'll prepare everything I can for it.`,
  ].join('\n');
}

export function helpText() {
  return [
    '*Idea Agent — what you can send*',
    '',
    '📩 A reel/YouTube link, a screenshot, or just type an idea → I make a plan and save it.',
    '',
    '*list* — all ideas by stage',
    '*top* — best 3 to push',
    '*next* — the one thing to do today',
    '*3* — open idea #3',
    '*do 3.2* — I do step 2 of idea 3 (ad copy, page, script, pitch…)',
    '*done 3.2* — mark step done   *undo 3.2* — un-mark',
    '*move 3 live* — stages: saved, testing, building, live, earning, dropped',
    '*earned 3 5000* — log money made',
    '*note 3 called the client* — add a note',
    '*drop 3* — drop an idea',
    '*status* — is everything working?',
    '',
    'Or just ask in plain words: "which idea is fastest to money?"',
  ].join('\n');
}

export function statusText(state, report, now = Date.now()) {
  const s = stats(state, now);
  const ago = t => (t ? `${Math.round((now - t) / 60000)} min ago` : 'never');
  const ok = v => (v ? '✅' : '❌');
  return [
    '*Status* 🩺',
    `${ok(report.whatsapp)} WhatsApp  ${ok(report.ai)} AI brain  ${report.storage === 'redis' ? '✅' : '⚠️'} Storage (${report.storage})`,
    `${ok(report.signatureCheck)} Webhook signature check  ${ok(report.cronSecret)} Scheduled briefs`,
    `Last message from you: ${ago(state.meta.lastInboundAt)}`,
    `Last daily brief: ${ago(state.meta.lastBriefAt)}`,
    state.meta.lastError ? `Last error: ${state.meta.lastError.message} (${ago(state.meta.lastError.at)})` : 'Errors: none',
    '',
    `Ideas: ${s.total} (${s.active} active) • steps done this week: ${s.stepsDoneThisWeek} • earned: ${s.revenue}`,
  ].join('\n');
}

export function morningBrief(state, pick, now = Date.now()) {
  const s = stats(state, now);
  const stuck = stalled(state, 5, now);
  return [
    '☀️ *Good morning! Your Idea Agent is running.*',
    '',
    nextText(pick),
    '',
    `This week: ${s.newThisWeek} new ideas, ${s.stepsDoneThisWeek} steps done.`,
    stuck.length ? `⚠️ Stuck 5+ days: ${stuck.slice(0, 3).map(i => `#${i.n}`).join(', ')}. Reply *drop N* or *next*.` : '',
  ].filter(Boolean).join('\n');
}

export function eveningNudge(state, now = Date.now()) {
  const today = new Date(now).toDateString();
  const doneToday = state.ideas.flatMap(i => i.steps.map(st => ({ i, st })))
    .filter(x => x.st.done && x.st.doneAt && new Date(x.st.doneAt).toDateString() === today);
  if (doneToday.length) {
    return `🌙 Nice work, ${doneToday.length} step${doneToday.length > 1 ? 's' : ''} done today: ${doneToday.slice(0, 4).map(x => `${x.i.n}.${x.st.n}`).join(', ')}. See you tomorrow.`;
  }
  return '🌙 No steps done today. Even 10 minutes counts: reply *next* and do just that one thing.';
}

export function weeklyReport(state, now = Date.now()) {
  const s = stats(state, now);
  const top = rankIdeas(state).slice(0, 3);
  return [
    '📊 *Weekly report*',
    `New ideas: ${s.newThisWeek}  •  Steps done: ${s.stepsDoneThisWeek}`,
    `Testing ${s.byStage.testing} • Building ${s.byStage.building} • Live ${s.byStage.live} • Earning ${s.byStage.earning}`,
    `Total earned: ${s.revenue}`,
    '',
    top.length ? '*Focus next week:*' : '',
    ...top.map((i, x) => `${x + 1}. ${ideaLine(i)}`),
    '',
    s.byStage.saved > 5 ? `You have ${s.byStage.saved} ideas you never started. Pick one, drop the rest: *drop N*.` : '',
  ].filter(Boolean).join('\n');
}

/** WhatsApp text messages max out at 4096 characters. Split on paragraph boundaries. */
export function chunk(text, max = 3800) {
  const out = [];
  let cur = '';
  for (const para of String(text).split(/\n\n/)) {
    const piece = cur ? `${cur}\n\n${para}` : para;
    if (piece.length <= max) { cur = piece; continue; }
    if (cur) out.push(cur);
    if (para.length <= max) { cur = para; continue; }
    for (let i = 0; i < para.length; i += max) out.push(para.slice(i, i + max));
    cur = '';
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
