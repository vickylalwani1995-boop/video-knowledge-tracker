// Talk to the agent in your terminal, exactly as you would on WhatsApp — no Meta account needed.
//   npm run chat                         (uses ANTHROPIC_API_KEY if set, otherwise offline mode)
//   npm run chat -- "https://www.instagram.com/reel/abc/ meta ads trick"   (one message, then exit)
import { createInterface } from 'node:readline/promises';
import { config } from './lib/config.js';
import { fileStore } from './lib/store.js';
import { createBrain } from './lib/ai.js';
import { linkPreview } from './lib/preview.js';
import { handleMessage } from './lib/agent.js';
import { runJob, JOBS } from './lib/jobs.js';

const cfg = { ...config(), ownerNumber: 'cli' };
const wa = { async sendText(_to, text) { console.log(`\n🤖 ${text.replace(/\n/g, '\n   ')}\n`); } };
const deps = { cfg, wa, store: fileStore(process.env.DATA_FILE || '.data/cli-state.json'), brain: createBrain(cfg), preview: linkPreview };

async function send(text) {
  if (JOBS.includes(text.replace(/^\//, ''))) return runJob(text.replace(/^\//, ''), deps);
  return handleMessage({ id: `cli-${Date.now()}-${Math.random()}`, from: 'cli', type: 'text', text }, deps);
}

const once = process.argv.slice(2).join(' ').trim();
if (once) {
  await send(once);
} else {
  console.log(`Idea Agent (${deps.brain.kind} brain). Type like WhatsApp; "/morning", "/evening", "/weekly" preview briefs; Ctrl+C to quit.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const line = (await rl.question('you › ')).trim();
    if (line) await send(line).catch(e => console.error('error:', e.message));
  }
}
