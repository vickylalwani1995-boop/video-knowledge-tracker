// Free AI brain: Google Gemini (key from aistudio.google.com, free tier).
// Same three jobs as the Claude brain. Gemini can also watch public YouTube videos directly.

import { SYSTEM, IDEA_SCHEMA, CHAT_SCHEMA, ideaPrompt, stepPrompt, chatPrompt } from './ai.js';
import { detectPlatform } from './ideas.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export function parseJsonLoose(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('The AI returned an unreadable answer. Please send it again.');
}

export function createGeminiBrain(cfg, fetchImpl = fetch) {
  async function once(model, body, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(`Gemini ${res.status}: ${json?.error?.message || 'error'}`.slice(0, 240));
        err.status = res.status;
        throw err;
      }
      const cand = json.candidates?.[0];
      const text = (cand?.content?.parts || []).map(p => p.text || '').join('').trim();
      if (!text) {
        const why = json.promptFeedback?.blockReason || cand?.finishReason || 'empty answer';
        const err = new Error(`Gemini gave no answer (${why}). Try describing the idea in your own words.`);
        err.status = 422;
        throw err;
      }
      return text;
    } catch (e) {
      if (e.name === 'AbortError') { const err = new Error('Gemini took too long'); err.status = 504; throw err; }
      throw e;
    } finally { clearTimeout(timer); }
  }

  /** Try the main model; on timeout / overload / quota, retry once on the lighter model. */
  async function generate(parts, { schema, history = [], timeoutMs = 25_000 } = {}) {
    const contents = [
      ...history.map(h => ({ role: h.role === 'agent' ? 'model' : 'user', parts: [{ text: h.text }] })),
      { role: 'user', parts },
    ];
    while (contents.length && contents[0].role !== 'user') contents.shift();
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {},
    };
    const models = [cfg.geminiModel, cfg.geminiFallbackModel].filter((m, i, a) => m && a.indexOf(m) === i);
    let last;
    for (const model of models) {
      try {
        return await once(model, body, timeoutMs);
      } catch (e) {
        last = e;
        // Older API versions reject responseJsonSchema: retry the same model with JSON mode + schema in the prompt.
        if (e.status === 400 && schema && /schema/i.test(e.message)) {
          const plain = { ...body, generationConfig: { responseMimeType: 'application/json' } };
          plain.contents = [...contents.slice(0, -1), { role: 'user', parts: [...parts, { text: `Reply with JSON only, matching this JSON schema:\n${JSON.stringify(schema)}` }] }];
          try { return await once(model, plain, timeoutMs); } catch (e2) { last = e2; }
        }
        if (![408, 429, 500, 502, 503, 504, 422].includes(last.status)) break;
      }
    }
    throw last;
  }

  return {
    kind: 'gemini',
    async analyzeIdea({ text, preview, image, urls = [] }) {
      const parts = [];
      const yt = urls.find(u => detectPlatform(u) === 'youtube');
      if (yt) parts.push({ file_data: { file_uri: yt } });
      if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
      parts.push({ text: ideaPrompt({ text, preview, hasImage: Boolean(image), hasVideo: Boolean(yt) }) });
      try {
        return parseJsonLoose(await generate(parts, { schema: IDEA_SCHEMA, timeoutMs: yt ? 40_000 : 25_000 }));
      } catch (e) {
        if (!yt) throw e;
        // Video too long / private: fall back to the link text only.
        return parseJsonLoose(await generate(parts.filter(p => !p.file_data), { schema: IDEA_SCHEMA }));
      }
    },
    async doStep({ idea, step }) {
      return generate([{ text: stepPrompt(idea, step) }], { timeoutMs: 30_000 });
    },
    async chat({ text, ideasSummary, history }) {
      return parseJsonLoose(await generate([{ text: chatPrompt(text, ideasSummary) }], { schema: CHAT_SCHEMA, history }));
    },
    async ping() {
      return generate([{ text: 'Reply with the single word OK.' }], { timeoutMs: 15_000 });
    },
  };
}
