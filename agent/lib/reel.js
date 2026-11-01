// Read a reel/video link: caption, author and (for Instagram) the video file itself,
// so the AI can actually watch it. Runs on Vercel's servers, where Instagram serves public posts.

import { detectPlatform, normalizeUrl } from './ideas.js';

const MAX_VIDEO_BYTES = 18 * 1024 * 1024; // Gemini inline limit is ~20MB per request

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

/** Find the mp4 address inside Instagram's embed page (escaped JSON: \/ and &). */
export function findVideoUrl(html) {
  const m = html.match(/"video_url"\s*:\s*"([^"]+)"/) || html.match(/(https?:\\?\/\\?\/[^"'\s]+?\.mp4[^"'\s]*)/);
  if (!m) return '';
  return m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
}

async function get(url, fetchImpl, { ua, ms = 12000, binary = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': ua || 'facebookexternalhit/1.1', 'Accept-Language': 'en' }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return null;
    if (!binary) return await res.text();
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_VIDEO_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_VIDEO_BYTES ? null : buf;
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Returns { url, platform, author, caption, video?: { base64, mimeType }, youtube?: url, notes[] }.
 * Never throws: whatever could not be read is listed in notes.
 */
export async function fetchReel(url, fetchImpl = fetch, { withVideo = true } = {}) {
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
    if (withVideo) {
      const embed = await get(`${canon}embed/captioned/`, fetchImpl, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
      const videoUrl = embed ? findVideoUrl(embed) : '';
      const buf = videoUrl ? await get(videoUrl, fetchImpl, { binary: true, ms: 20000, ua: 'Mozilla/5.0' }) : null;
      if (buf) out.video = { base64: buf.toString('base64'), mimeType: 'video/mp4', bytes: buf.length };
      else out.notes.push(videoUrl ? 'Video too large or download failed' : 'Video file not available (maybe a photo post)');
    }
    return out;
  }

  // Any other site: title + description
  const page = await get(url, fetchImpl, { ua: 'Mozilla/5.0 (compatible; IdeaAgent/1.0)' });
  if (page) {
    const p = parseInstagramMeta(page);
    out.caption = [p.title, p.caption].filter(Boolean).join(' — ');
  } else out.notes.push('Page could not be opened');
  return out;
}
