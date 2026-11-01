// The agent: takes one incoming WhatsApp message and decides what to reply.
// `respond` is pure-ish (state in, replies out) so it can be tested without WhatsApp.

import {
  createIdea, findIdea, findDuplicate, setStage, markStep, nextStep, pickNext, parseStage,
  extractUrls, remember, seenBefore, stageOf,
} from './ideas.js';
import { ideaCard, ideaLine, listText, topText, nextText, helpText, statusText } from './format.js';
import { configReport } from './config.js';

const N = '#?(\\d+)';
const STEP = `${N}[.\\s](\\d+)`;
const re = s => new RegExp(`^${s}$`, 'is');

export async function respond(state, msg, deps) {
  const { brain, cfg, preview, downloadMedia } = deps;
  const text = String(msg.text || '').trim();
  const t = text.replace(/\s+/g, ' ');
  let m;

  if (msg.note === 'audio') return ['🎤 I can\'t listen to voice notes yet. Please type it, or forward the reel link.'];
  if (msg.note === 'video' && !extractUrls(text).length) {
    return ['🎬 I can\'t watch video files. Forward the reel *link* instead (Instagram → Share → WhatsApp), or send a screenshot of the caption.'];
  }
  if (!text && !msg.mediaId) return [helpText()];

  if (re('(help|menu|\\?|hi|hello|hey|start|commands)').test(t)) return [helpText()];
  if ((m = t.match(re('list(?: (\\w+))?')))) {
    const stage = m[1] ? parseStage(m[1]) : null;
    if (m[1] && !stage) return [`Unknown stage "${m[1]}". Use: saved, testing, building, live, earning, dropped.`];
    return [listText(state, stage)];
  }
  if (re('top').test(t)) return [topText(state)];
  if (re('(next|today|what now|what next)\\??').test(t)) return [nextText(pickNext(state))];
  if (re('(status|health|ping)').test(t)) return [statusText(state, configReport(cfg))];

  if ((m = t.match(re(`(?:show |open )?${N}`)))) {
    const idea = findIdea(state, m[1]);
    return [idea ? ideaCard(idea) : noIdea(m[1])];
  }

  if ((m = t.match(re(`(done|undo) ${STEP}`))) || (m = t.match(re(`(done|undo) ${N}`)))) {
    const idea = findIdea(state, m[2]);
    if (!idea) return [noIdea(m[2])];
    const undo = m[1].toLowerCase() === 'undo';
    const stepN = m[3] || (undo ? [...idea.steps].reverse().find(s => s.done)?.n : nextStep(idea)?.n);
    if (!stepN) return [undo ? 'Nothing to undo.' : `All steps of #${idea.n} are done! 🎉 Reply *move ${idea.n} live* or *earned ${idea.n} <amount>*.`];
    try { markStep(idea, stepN, !undo); } catch (e) { return [e.message]; }
    if (undo) return [`↩️ Step ${idea.n}.${stepN} marked not done.`];
    const nx = nextStep(idea);
    return [nx
      ? `✅ ${idea.n}.${stepN} done. Next: *${idea.n}.${nx.n}* ${nx.text}${nx.owner === 'agent' ? `\nReply *do ${idea.n}.${nx.n}* and I'll do it.` : ''}`
      : `🎉 Every step of #${idea.n} is done! Is it live? Reply *move ${idea.n} live*, and log money with *earned ${idea.n} <amount>*.`];
  }

  if ((m = t.match(re(`do ${STEP}`))) || (m = t.match(re(`do ${N}`)))) {
    const idea = findIdea(state, m[1]);
    if (!idea) return [noIdea(m[1])];
    const step = m[2] ? idea.steps.find(s => s.n === Number(m[2])) : nextStep(idea);
    if (!step) return [m[2] ? `#${idea.n} has no step ${m[2]}.` : `All steps of #${idea.n} are done.`];
    const output = await brain.doStep({ idea, step });
    step.output = output;
    idea.updatedAt = Date.now();
    if (step.owner === 'agent') markStep(idea, step.n, true);
    if (idea.stage === 'saved') setStage(idea, 'testing');
    const nx = nextStep(idea);
    return [
      `🤖 *${idea.n}.${step.n} ${step.text}*\n\n${output}`,
      step.owner === 'agent'
        ? `✅ Marked ${idea.n}.${step.n} done.${nx ? ` Next: *${idea.n}.${nx.n}* ${nx.text}` : ' That was the last step!'}`
        : `👤 Use the above, then reply *done ${idea.n}.${step.n}*.`,
    ];
  }

  if ((m = t.match(re(`(?:move|stage|set) ${N} (?:to )?(\\w+)`)))) {
    const idea = findIdea(state, m[1]);
    if (!idea) return [noIdea(m[1])];
    const stage = parseStage(m[2]);
    if (!stage) return [`Unknown stage "${m[2]}". Use: saved, testing, building, live, earning, dropped.`];
    setStage(idea, stage);
    return [`${stageOf(stage).emoji} #${idea.n} moved to *${stageOf(stage).label}*.`];
  }
  if ((m = t.match(re(`(?:drop|delete|kill) ${N}`)))) {
    const idea = findIdea(state, m[1]);
    if (!idea) return [noIdea(m[1])];
    setStage(idea, 'dropped');
    return [`🗑️ Dropped #${idea.n} ${idea.title}. Focus wins. (Undo: *move ${idea.n} saved*)`];
  }
  if ((m = t.match(re(`(?:earned|revenue|made) ${N} [^\\d]*([\\d,.]+)k?.*`)))) {
    const idea = findIdea(state, m[1]);
    if (!idea) return [noIdea(m[1])];
    let amount = Number(m[2].replace(/,/g, ''));
    if (/\dk\b/i.test(t)) amount *= 1000;
    idea.revenue = (Number(idea.revenue) || 0) + amount;
    setStage(idea, 'earning');
    return [`💰 Logged ${amount} on #${idea.n}. Total from this idea: *${idea.revenue}*. That's execution! 🏆`];
  }
  if ((m = text.match(/^note\s+#?(\d+)\s+([\s\S]+)$/i))) {
    const idea = findIdea(state, m[1]);
    if (!idea) return [noIdea(m[1])];
    idea.notes = [...(idea.notes || []), { text: m[2].trim(), at: Date.now() }];
    idea.updatedAt = Date.now();
    return [`📝 Note added to #${idea.n}.`];
  }

  // Anything else: a new idea (link, screenshot, "idea: ...") or a question.
  const urls = extractUrls(text);
  const explicitIdea = /^(idea|save|add)\b[:\s-]*/i.test(text);
  if (urls.length || msg.mediaId || explicitIdea) {
    return newIdea(state, { text: text.replace(/^(idea|save|add)\b[:\s-]*/i, ''), urls, mediaId: msg.mediaId }, deps);
  }

  const summary = state.ideas.filter(i => i.stage !== 'dropped').slice(-25).map(ideaLine).join('\n');
  const ans = await brain.chat({ text, ideasSummary: summary, history: state.history || [] });
  if (ans.intent === 'new_idea') return newIdea(state, { text, urls: [], mediaId: null }, deps);
  return [ans.reply || helpText()];
}

async function newIdea(state, { text, urls, mediaId }, { brain, preview, downloadMedia, notify, autoDo = true }) {
  const dup = findDuplicate(state, urls);
  if (dup) return [`You already sent this one, it's saved as *#${dup.n}*.`, ideaCard(dup)];
  if (notify) await notify('👀 Got it, analysing… (about 30 seconds)').catch(() => {});

  const previews = preview ? (await Promise.all(urls.slice(0, 3).map(u => preview(u).catch(() => '')))).filter(Boolean) : [];
  let image = null;
  if (mediaId && downloadMedia) image = await downloadMedia(mediaId);

  const analysis = await brain.analyzeIdea({ text, preview: previews.join('\n'), image, urls });
  const idea = createIdea(state, analysis, { urls, text, hasImage: Boolean(image) });
  const replies = [`✅ Saved as *#${idea.n}*\n\n${ideaCard(idea)}`];

  // Don't just plan it: do the first step the agent can do, right away.
  const first = autoDo && idea.steps.find(s => s.owner === 'agent' && !s.done);
  if (first) {
    try {
      if (notify) await notify(replies.shift()).catch(() => {});
      const output = await brain.doStep({ idea, step: first });
      first.output = output;
      markStep(idea, first.n, true);
      const nx = nextStep(idea);
      replies.push(`🤖 *Done for you: ${idea.n}.${first.n} ${first.text}*\n\n${output}`);
      if (nx) replies.push(nx.owner === 'agent' ? `Next: *${idea.n}.${nx.n}* ${nx.text}\nReply *do ${idea.n}.${nx.n}* and I'll do it.` : `👤 Your turn: *${idea.n}.${nx.n}* ${nx.text}\nReply *done ${idea.n}.${nx.n}* when finished.`);
    } catch {
      replies.push(`Reply *do ${idea.n}.${first.n}* and I'll do step ${first.n} for you.`);
    }
  }
  if (urls.some(u => /instagram/.test(u)) && !previews.length && !image && text.replace(/https?:\/\/\S+/g, '').trim().length < 15) {
    replies.push('💡 Instagram didn\'t let me see this reel. For a sharper plan, send a screenshot or paste the caption, then reply *note ' + idea.n + ' <caption>*.');
  }
  return replies;
}

function noIdea(n) {
  return `No idea #${n}. Reply *list* to see them.`;
}

/**
 * Full handling of one webhook message: owner check, de-duplication, health bookkeeping,
 * reply, and error reporting back to WhatsApp so the agent never goes silent.
 */
export async function handleMessage(msg, deps) {
  const { store, wa, cfg } = deps;
  if (cfg.ownerNumber && msg.from !== cfg.ownerNumber) return { ignored: 'not-owner' };

  const state = await store.load();
  if (seenBefore(state, msg.id)) return { ignored: 'duplicate' };
  state.meta.lastInboundAt = Date.now();
  await store.save(state); // record the id first, so a Meta retry while we think isn't processed twice

  wa.markRead?.(msg.id);
  let sentEarly = 0;
  const notify = async text => { await wa.sendText(msg.from, text); sentEarly++; };
  let replies;
  try {
    replies = await respond(state, msg, { ...deps, notify });
    state.meta.lastError = null;
  } catch (err) {
    state.meta.lastError = { message: String(err.message || err).slice(0, 300), at: Date.now() };
    replies = [`⚠️ Something went wrong: ${state.meta.lastError.message}\nYour idea list is safe. Try again in a minute, or send *status*.`];
  }
  remember(state, 'you', msg.text || (msg.mediaId ? '[screenshot]' : ''));
  remember(state, 'agent', replies.join('\n\n'));
  await store.save(state);

  for (const r of replies) await wa.sendText(msg.from, r);
  state.meta.lastOutboundAt = Date.now();
  await store.save(state);
  return { replies };
}
