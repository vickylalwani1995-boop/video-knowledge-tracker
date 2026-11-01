// Turn a video the user sent (screen recording / saved reel) into still frames Claude can look at.
// Claude reads images, not video, so we sample evenly across the clip, scale each frame down,
// and label it with its timestamp. On-screen text and subtitles come through clearly; audio does not.

import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(bin, args, timeoutMs = 40_000) {
  return new Promise(resolve => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ err, stdout, stderr: String(stderr || '') }));
  });
}

export function parseDuration(ffmpegOutput) {
  const m = String(ffmpegOutput).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

/** Timestamps (seconds) to sample: evenly spread, skipping the very first/last moments. */
export function frameTimes(duration, maxFrames = 16) {
  if (!(duration > 0)) return [0];
  const n = Math.max(1, Math.min(maxFrames, Math.ceil(duration / 1.5)));
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * duration / n) * 10) / 10);
}

export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * @param {Buffer} buf  video bytes
 * @returns {Promise<{ duration: number, frames: { at: number, label: string, base64: string, mimeType: string }[] }>}
 */
export async function extractFrames(buf, { maxFrames = 16, width = 720, ffmpegPath } = {}) {
  const bin = ffmpegPath || (await import('ffmpeg-static')).default;
  if (!bin) throw new Error('Video tool (ffmpeg) is not available on this server');
  const dir = await mkdtemp(join(tmpdir(), 'reel-'));
  try {
    const input = join(dir, 'in.mp4');
    await writeFile(input, buf);
    const probe = await run(bin, ['-hide_banner', '-i', input]);
    const duration = parseDuration(probe.stderr);
    const times = frameTimes(duration, maxFrames);
    // One fast seek per frame keeps memory low and works for long clips too.
    await Promise.all(times.map((t, i) => run(bin, [
      '-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', input,
      '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-q:v', '5', join(dir, `f${String(i).padStart(2, '0')}.jpg`),
    ])));
    const files = (await readdir(dir)).filter(f => f.endsWith('.jpg')).sort();
    if (!files.length) throw new Error('Could not read this video. Try a screenshot instead.');
    const frames = await Promise.all(files.map(async f => {
      const i = Number(f.slice(1, 3));
      return { at: times[i], label: fmtTime(times[i]), base64: (await readFile(join(dir, f))).toString('base64'), mimeType: 'image/jpeg' };
    }));
    return { duration, frames };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
