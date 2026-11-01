// One-time import of the reels Vicky shared in Claude chats on 1 Nov 2026 (tracked in REEL-TO-REAL.md),
// so the live app and the repo tracker start out identical. Safe to run repeatedly.
import { createIdea, findDuplicate, setStage, markStep } from './ideas.js';

const SEEDS = [
  {
    url: 'https://www.instagram.com/reel/DfMNfJFEQGv/', stage: 'testing', done: [1, 2],
    verdict: '✅ Good: real, free, sellable as an "AI Visibility Audit"',
    idea: {
      title: 'ChatGPT fan-out queries → better SEO articles',
      one_liner: 'See the exact searches ChatGPT runs (browser Network tab), take the top 3 results, merge their headings into one outline.',
      money_score: 8, how_it_earns: 'Better-ranking client articles + sell an "AI Visibility Audit" (₹10–25k)', effort: 'small',
      steps: [
        { text: 'Understand the reel and check it is real', owner: 'agent' },
        { text: 'Run the method on a demo topic and write the merged outline (tracker/003-chatgpt-fanout-outline)', owner: 'agent' },
        { text: 'Do the 5-minute Network-tab check for one real client topic', owner: 'you' },
        { text: 'Claude writes the full article from those searches', owner: 'agent' },
        { text: 'Package it as an "AI Visibility Audit" offer for one client', owner: 'you' },
      ],
    },
  },
  {
    url: 'https://www.instagram.com/reel/DfEt6OONia7/', stage: 'live', done: [1],
    verdict: '✅ Used: Claude runs it, no install. Type "roast: <decision>" in Claude.',
    idea: {
      title: 'Roast Room: 7 AI advisors debate your decisions',
      one_liner: 'Seven AI advisors argue about a business decision, vote, and give a verdict (@100xengineers).',
      money_score: 7, how_it_earns: 'Better decisions; can be offered to clients as a strategy session', effort: 'small',
      steps: [
        { text: 'Run it on "which idea first?" → verdict: AI Visibility Audit first', owner: 'agent' },
        { text: 'Use it for your next real decision', owner: 'you' },
      ],
    },
  },
  {
    url: 'https://www.instagram.com/reel/DfLO6vHsmHq/', stage: 'dropped', done: [],
    verdict: '❌ Skip: Claude Code add-ons for programmers, no money for you',
    idea: {
      title: "Nate Herk's free Claude Code mods",
      one_liner: 'Usage panel, screen-record blur, progress view, edit guard. Link hidden behind "comment HACKED".',
      money_score: 3, how_it_earns: '—', effort: 'small', steps: [],
    },
  },
];

export function seedOnce(state) {
  if (state.meta.seededReel2Real) return false;
  for (const s of SEEDS) {
    if (findDuplicate(state, [s.url])) continue;
    const idea = createIdea(state, s.idea, { urls: [s.url], text: '' });
    idea.verdict = s.verdict;
    for (const n of s.done) markStep(idea, n, true);
    setStage(idea, s.stage);
  }
  state.meta.seededReel2Real = true;
  return true;
}
