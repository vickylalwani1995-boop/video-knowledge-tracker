// Best-effort: read a link's title/caption so the AI knows what the reel is about.
// Instagram often blocks this; when it does, the agent asks for a screenshot or the caption instead.

import { detectPlatform } from './ideas.js';

const decode = s => String(s || '')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

export function parseMeta(html) {
  const get = prop => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
    const m = html.match(re);
    return m ? decode(m[1] ?? m[2]).trim() : '';
  };
  const title = get('og:title') || decode((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]).trim();
  const description = get('og:description') || get('description');
  return { title, description };
}

async function fetchText(url, fetchImpl, headers = {}, ms = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetchImpl(url, { headers, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return '';
    return (await res.text()).slice(0, 400_000);
  } catch { return ''; } finally { clearTimeout(t); }
}

export async function linkPreview(url, fetchImpl = fetch) {
  const platform = detectPlatform(url);
  if (platform === 'youtube') {
    const raw = await fetchText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, fetchImpl);
    try {
      const j = JSON.parse(raw);
      return `YouTube video: "${j.title}" by ${j.author_name}`;
    } catch { return ''; }
  }
  const html = await fetchText(url, fetchImpl, {
    // Instagram/Facebook serve link-preview tags to their own crawler user agent.
    'User-Agent': platform === 'instagram' || platform === 'facebook' ? 'facebookexternalhit/1.1' : 'Mozilla/5.0 (compatible; IdeaAgent/1.0)',
    'Accept-Language': 'en',
  });
  if (!html) return '';
  const { title, description } = parseMeta(html);
  const text = [title, description].filter(Boolean).join(' — ');
  // Instagram's login wall returns a generic title; that tells the AI nothing.
  if (!text || /^instagram$/i.test(title) && !description || /log ?in/i.test(title) && !description) return '';
  return `${platform} post: ${text}`.slice(0, 1500);
}
