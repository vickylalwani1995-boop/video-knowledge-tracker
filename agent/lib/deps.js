// Wires real services together from environment variables.
import { config } from './config.js';
import { storeFromConfig } from './store.js';
import { createBrain } from './ai.js';
import { createWhatsApp } from './whatsapp.js';
import { linkPreview } from './preview.js';

export function makeDeps(env = process.env) {
  const cfg = config(env);
  const wa = createWhatsApp(cfg);
  return {
    cfg,
    store: storeFromConfig(cfg),
    brain: createBrain(cfg),
    wa,
    preview: url => linkPreview(url),
    downloadMedia: id => wa.downloadMedia(id),
  };
}
