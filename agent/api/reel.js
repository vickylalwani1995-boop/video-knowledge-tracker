// Understand a reel from its link:  GET /api/reel?url=<reel link>&token=STATUS_TOKEN
// Returns the caption, creator, and the AI's breakdown after watching the video
// (what it teaches, tools, GitHub repos, links, hype check). Nothing is saved.
import { makeDeps } from '../lib/deps.js';
import { authorized, unauthorized } from '../lib/auth.js';
import { fetchReel } from '../lib/reel.js';
import { findDuplicate } from '../lib/ideas.js';

export async function GET(request, deps) {
  deps = deps?.cfg ? deps : await makeDeps();
  if (!authorized(request, deps.cfg)) return unauthorized();
  const url = new URL(request.url).searchParams.get('url');
  if (!url || !/^https?:\/\//.test(url)) return Response.json({ error: 'Pass ?url=<reel link>' }, { status: 400 });

  const reel = await (deps.readReel || fetchReel)(url);
  let understanding = null;
  let aiError = null;
  if (deps.brain.understandReel) {
    try { understanding = await deps.brain.understandReel(reel); } catch (e) { aiError = e.message; }
  } else aiError = 'AI not connected on the server (ANTHROPIC_API_KEY missing). Read the caption yourself.';
  const state = await deps.store.load().catch(() => null);
  const dup = state ? findDuplicate(state, [url]) : null;

  const { video, ...meta } = reel;
  return Response.json({
    reel: { ...meta, videoWatched: Boolean(video || reel.youtube), videoBytes: video?.bytes || 0 },
    understanding,
    aiError,
    alreadySaved: dup ? { n: dup.n, title: dup.title, stage: dup.stage } : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
