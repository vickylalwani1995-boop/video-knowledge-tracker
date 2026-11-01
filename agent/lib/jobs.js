// Scheduled messages. The morning brief doubles as a heartbeat: if it doesn't arrive, something is broken.

import { pickNext } from './ideas.js';
import { morningBrief, eveningNudge, weeklyReport } from './format.js';
import { isWindowClosed } from './whatsapp.js';

export const JOBS = ['morning', 'evening', 'weekly'];

export function buildJobText(job, state, now = Date.now()) {
  if (job === 'morning') return morningBrief(state, pickNext(state), now);
  if (job === 'evening') return eveningNudge(state, now);
  if (job === 'weekly') return weeklyReport(state, now);
  throw new Error(`Unknown job "${job}"`);
}

export async function runJob(job, { store, wa, cfg }, now = Date.now()) {
  if (!JOBS.includes(job)) throw new Error(`Unknown job "${job}"`);
  if (!cfg.ownerNumber) throw new Error('OWNER_WHATSAPP is not set');
  const state = await store.load();
  // Nothing to nudge about yet: skip evening/weekly, but always send the morning heartbeat.
  if (job !== 'morning' && !state.ideas.length) return { skipped: 'no ideas yet' };

  const text = buildJobText(job, state, now);
  let via = 'text';
  try {
    await wa.sendText(cfg.ownerNumber, text);
  } catch (err) {
    // WhatsApp only allows free text within 24h of your last message. Outside it, use an approved template.
    if (isWindowClosed(err) && cfg.waTemplate) {
      await wa.sendTemplate(cfg.ownerNumber, cfg.waTemplate, cfg.waTemplateLang, text.split('\n').slice(0, 6).join(' ').replace(/\s+/g, ' '));
      via = 'template';
    } else {
      state.meta.lastError = { message: `${job} brief: ${err.message}`.slice(0, 300), at: now };
      await store.save(state);
      throw err;
    }
  }
  if (job === 'morning') state.meta.lastBriefAt = now;
  state.meta.lastOutboundAt = now;
  await store.save(state);
  return { sent: job, via };
}
