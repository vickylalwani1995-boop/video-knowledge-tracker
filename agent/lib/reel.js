// Read a reel/video link the honest way: the public title/caption a normal link preview shows.
// We identify ourselves truthfully and never disguise the request or pull video files out of
// Instagram pages. To let the AI watch an Instagram video, send the video itself (screen recording)
// to the WhatsApp bot. YouTube videos are watched directly by Gemini through Google's official support.

import { detectPlatform, normalizeUrl } from './ideas.js';

const UA = 'IdeaAgent/1.0 (personal link preview; +https://idea-agent-ochre.vercel.app)';

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** og:description looks like: `6,581 likes, 6,028 comments - user on Sept 12, 2026: "caption…"` */
export function parseInstagramMeta(html) {
  const meta = name => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]*content="([^"]*)"`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="${name}"`, 'i'));
    return m ? decodeEntities(m[1]) : '';
  };
  const desc = meta('og:description') || meta('description');
  const title = meta('og:title');
  const m = desc.match(/^(.*?)\s-\s([\w.]+)\son\s([^:]+):\s*"?([\s\S]*?)"?\.?\s*$/);
  return {
    author: m?.[2] || (title.match(/^(.*?) on Instagram/)?.[1] ?? ''),
    stats: m?.[1] || '',
    date: m?.[3] || '',
    caption: (m?.[4] || desc).trim(),
    title,
  };
}

async function get(url, fetchImpl, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: ctrl.signal, redirect: 'follow' });
    return res.ok ? await res.text() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Returns { url, platform, author, caption, youtube?: url, notes[] }.
 * Never throws: whatever could not be read is listed in notes.
 */
export async function fetchReel(url, fetchImpl = fetch) {
  const platform = detectPlatform(url);
  const out = { url, key: normalizeUrl(url), platform, author: '', caption: '', notes: [] };

  if (platform === 'youtube') {
    const raw = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, fetchImpl);
    try { const j = JSON.parse(raw); out.caption = j.title; out.author = j.author_name; } catch { out.notes.push('YouTube title not available'); }
    out.youtube = url; // Gemini watches YouTube links directly
    return out;
  }

  if (platform === 'instagram') {
    const canon = out.key.endsWith('/') ? out.key : `${out.key}/`;
    const page = await get(canon, fetchImpl);
    if (page) Object.assign(out, parseInstagramMeta(page));
    if (!out.caption) out.notes.push('Instagram did not share the caption (private post or blocked)');
    out.notes.push('To let the AI watch the video itself, screen-record the reel and send the video to the WhatsApp bot');
    return out;
  }

  // Any other site: title + description
  const page = await get(url, fetchImpl);
  if (page) {
    const p = parseInstagramMeta(page);
    out.caption = [p.title, p.caption].filter(Boolean).join(' — ');
  } else out.notes.push('Page could not be opened');
  return out;
}
