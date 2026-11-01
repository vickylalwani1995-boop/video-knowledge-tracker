// The AI brain. Three jobs: analyse a new idea, do a step, answer a question.
// Uses the official Anthropic SDK. Without an API key it falls back to a simple offline plan,
// so the bot still works (just less smart) and tests run without network.

import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `You are the Idea Agent for a digital-marketing operator who runs an agency and also wants side income.
They watch Instagram reels and YouTube videos full of tactics (Meta ads, Google ads, SEO/AEO/GEO, websites, AI automation,
content, offers) but rarely execute them. Your job is to close that gap: turn each idea into something real that makes money,
either for their own business or as a service they sell to clients.

Rules:
- Be concrete and practical. No motivational fluff. Plain, simple English; they are busy and not deeply technical.
- Prefer the fastest path to the first rupee/dollar: a small paid test, a pre-sale, or one client pilot before building big.
- Say honestly when an idea is weak, overhyped, against platform rules, or a scam pattern, and give it a low score.
- Never ask for passwords, API keys or card details. Never suggest scraping private accounts, fake reviews or spam.
- Messages are read on WhatsApp: short lines, *bold* with single asterisks, no markdown headings or tables.`;

const IDEA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Short name, max 8 words' },
    one_liner: { type: 'string', description: 'What the idea actually is, one sentence' },
    category: { type: 'string', enum: ['meta-ads', 'google-ads', 'seo-aeo-geo', 'website', 'content', 'automation', 'offer-product', 'client-service', 'other'] },
    money_score: { type: 'integer', description: '1-10: realistic money potential for THIS person in the next 90 days' },
    money_why: { type: 'string', description: 'One short reason for the score' },
    how_it_earns: { type: 'string', description: 'Who pays, for what, roughly how much' },
    effort: { type: 'string', enum: ['small', 'medium', 'large'] },
    cost_estimate: { type: 'string', description: 'Upfront money/tool cost, e.g. "$0-20 + 3 hours"' },
    first_test: { type: 'string', description: 'The cheapest test that proves or kills the idea within 7 days' },
    client_pitch: { type: 'string', description: 'One or two sentences to pitch this as a paid service to a client' },
    needs_from_you: { type: 'array', items: { type: 'string' }, description: 'Accounts, assets or decisions only the human can provide' },
    steps: {
      type: 'array',
      description: '4-8 execution steps in order. owner=agent when the agent can produce it as text (copy, scripts, outlines, page copy, checklists, emails, ad structures); owner=you when it needs a human (logging in, paying, recording, calling).',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { text: { type: 'string' }, owner: { type: 'string', enum: ['agent', 'you'] } },
        required: ['text', 'owner'],
      },
    },
  },
  required: ['title', 'one_liner', 'category', 'money_score', 'money_why', 'how_it_earns', 'effort', 'cost_estimate', 'first_test', 'client_pitch', 'needs_from_you', 'steps'],
};

const CHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['new_idea', 'answer'], description: 'new_idea if the message describes an idea/tactic to save and plan; otherwise answer' },
    reply: { type: 'string', description: 'The WhatsApp reply (empty if intent is new_idea)' },
  },
  required: ['intent', 'reply'],
};

export function createBrain(cfg, { client } = {}) {
  if (!cfg.anthropicKey && !client) return offlineBrain();
  const anthropic = client || new Anthropic({ apiKey: cfg.anthropicKey, timeout: 55_000, maxRetries: 1 });

  async function call({ content, schema, maxTokens = 16000, history = [] }) {
    const messages = [
      ...history.map(h => ({ role: h.role === 'agent' ? 'assistant' : 'user', content: h.text })),
      { role: 'user', content },
    ];
    // The API needs the first message to be from the user and roles to alternate sensibly.
    while (messages.length && messages[0].role !== 'user') messages.shift();
    const res = await anthropic.beta.messages.create({
      model: cfg.aiModel,
      max_tokens: maxTokens,
      system: SYSTEM,
      messages,
      output_config: { effort: cfg.aiEffort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      // If a safety filter declines (e.g. a "hacking" sounding reel), retry on a fallback model automatically.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (res.stop_reason === 'refusal') {
      throw new Error('The AI declined this one. Try rewording it or describing the idea in your own words.');
    }
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!schema) return text;
    try { return JSON.parse(text); }
    catch { throw new Error('The AI returned an unreadable answer. Please send it again.'); }
  }

  return {
    kind: 'claude',
    async analyzeIdea({ text, preview, image }) {
      const parts = [];
      if (image) parts.push({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } });
      parts.push({
        type: 'text',
        text: [
          'New idea forwarded from my phone. Analyse it and make an execution plan.',
          text ? `My message:\n${text}` : '',
          preview ? `What I could read from the link:\n${preview}` : '',
          image ? 'The attached image is a screenshot of the reel/post.' : '',
          !preview && !image ? 'Note: the video itself could not be opened (Instagram blocks bots). Work from the text; if it is too vague, still make your best plan and put "send a screenshot or the caption" in needs_from_you.' : '',
        ].filter(Boolean).join('\n\n'),
      });
      return call({ content: parts, schema: IDEA_SCHEMA });
    },

    async doStep({ idea, step }) {
      return call({
        content: [
          `Idea #${idea.n}: ${idea.title}`,
          idea.oneLiner,
          `How it earns: ${idea.howItEarns}`,
          `First test: ${idea.firstTest}`,
          `All steps:\n${idea.steps.map(s => `${s.n}. ${s.text}${s.done ? ' (done)' : ''}`).join('\n')}`,
          idea.notes?.length ? `My notes:\n${idea.notes.map(n => `- ${n.text}`).join('\n')}` : '',
          '',
          `Do step ${step.n} now: "${step.text}".`,
          'Produce the finished deliverable itself (actual ad copy, actual page text, actual script, actual message to send, exact click-by-click setup), ready to copy-paste. If part of it truly needs me, say exactly what I must do in 1-3 bullet points at the end. Keep it under 2500 characters.',
        ].filter(Boolean).join('\n'),
        maxTokens: 16000,
      });
    },

    async chat({ text, ideasSummary, history }) {
      return call({
        content: `My ideas right now:\n${ideasSummary || '(none yet)'}\n\nMy message: ${text}`,
        schema: CHAT_SCHEMA,
        history,
      });
    },
  };
}

/** No API key: keyword-based fallback so the pipeline still works end to end. */
export function offlineBrain() {
  return {
    kind: 'offline',
    async analyzeIdea({ text, preview }) {
      const src = `${text || ''} ${preview || ''}`.trim();
      const firstLine = src.replace(/https?:\/\/\S+/g, '').split('\n').map(s => s.trim()).find(Boolean) || 'New idea from a reel';
      return {
        title: firstLine.split(/\s+/).slice(0, 8).join(' '),
        one_liner: firstLine.slice(0, 160),
        category: 'other',
        money_score: 5,
        money_why: 'Not scored: AI brain is not connected yet',
        how_it_earns: 'Decide: use it for your own business, or sell it as a service',
        effort: 'medium',
        cost_estimate: 'unknown',
        first_test: 'Try it once on one real project this week and measure one number before vs after',
        client_pitch: '',
        needs_from_you: ['Add ANTHROPIC_API_KEY so I can make real plans'],
        steps: [
          { text: 'Write down in one sentence what the video teaches', owner: 'you' },
          { text: 'Pick one project or client to test it on', owner: 'you' },
          { text: 'Run the test for 7 days and note the result', owner: 'you' },
          { text: 'If it worked, turn it into a repeatable offer', owner: 'you' },
        ],
      };
    },
    async doStep() {
      return 'My AI brain is not connected yet, so I cannot write this for you. Add ANTHROPIC_API_KEY in Vercel and try again.';
    },
    async chat() {
      return { intent: 'answer', reply: 'I can only run commands until my AI brain is connected. Send *help* to see them.' };
    },
  };
}
