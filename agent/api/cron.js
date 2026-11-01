// Scheduled briefs. Vercel Cron calls /api/cron?job=morning|evening|weekly with the CRON_SECRET.
import { makeDeps } from '../lib/deps.js';
import { runJob } from '../lib/jobs.js';

export async function GET(request, deps) {
  deps = deps || await makeDeps();
  const { cfg } = deps;
  if (!cfg.cronSecret || request.headers.get('authorization') !== `Bearer ${cfg.cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const job = new URL(request.url).searchParams.get('job') || 'morning';
  try {
    return Response.json(await runJob(job, deps));
  } catch (err) {
    console.error(`cron ${job} failed:`, err.message);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
