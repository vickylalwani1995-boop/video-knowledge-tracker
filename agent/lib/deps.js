// Wires real services together from environment variables.
import { config } from './config.js';
import { storeFromConfig } from './store.js';
import { brainFromConfig } from './ai.js';
import { createWhatsApp } from './whatsapp.js';
import { linkPreview } from './preview.js';
import { fetchReel } from './reel.js';
import { extractFrames } from './video.js';

export async function makeDeps(env = process.env) {
  const cfg = config(env);
  const wa = createWhatsApp(cfg);
  let waitUntil = null;
  if (env.VERCEL) waitUntil = (await import('@vercel/functions')).waitUntil;
  return {
    cfg,
    store: await storeFromConfig(cfg),
    brain: await brainFromConfig(cfg),
    wa,
    preview: url => linkPreview(url),
    readReel: url => fetchReel(url),
    extractFrames: buf => extractFrames(buf),
    downloadMedia: id => wa.downloadMedia(id),
    waitUntil,
  };
}
