// All settings come from environment variables (set them in Vercel → Project → Settings → Environment Variables).
// Nothing secret is ever hard-coded or logged.

/**
 * Read a secret from its normal name, or from numbered pieces (NAME_K1, NAME_K2, …) that an earlier
 * version of this project used. New secrets should always be saved under the normal name.
 */
export function secret(env, name, prefix, minLen = 16) {
  const direct = (env[name] || '').trim();
  if (direct.length >= minLen) return direct;
  const parts = [];
  for (let i = 1; i <= 80 && env[`${prefix}${i}`]; i++) parts.push(env[`${prefix}${i}`].trim());
  const joined = parts.join('');
  return joined.length >= minLen ? joined : direct;
}

export function config(env = process.env) {
  return {
    // WhatsApp Cloud API (Meta)
    waToken: secret(env, 'WHATSAPP_TOKEN', 'WA_K', 20),
    waPhoneId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    waVerifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    waAppSecret: secret(env, 'WHATSAPP_APP_SECRET', 'WA_SEC_K', 16),
    waGraphVersion: env.WHATSAPP_GRAPH_VERSION || 'v21.0',
    // Only this number may talk to the agent (digits only, with country code, e.g. 919876543210)
    ownerNumber: (env.OWNER_WHATSAPP || env.OWNER_WHATSAPP_NUMBER || '').replace(/\D/g, ''),
    // Optional approved template used when WhatsApp's 24-hour window is closed
    waTemplate: env.WHATSAPP_TEMPLATE || '',
    waTemplateLang: env.WHATSAPP_TEMPLATE_LANG || 'en_US',

    // AI brain. Gemini is free (aistudio.google.com); Claude is optional and paid.
    geminiKey: secret(env, 'GEMINI_API_KEY', 'GEMINI_K', 20),
    geminiModel: env.GEMINI_MODEL || 'gemini-flash-latest',
    geminiFallbackModel: env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest',
    aiProvider: (env.AI_PROVIDER || '').toLowerCase(), // 'gemini' | 'claude' | '' (auto: Gemini first)
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    aiModel: env.AI_MODEL || 'claude-opus-5-5',
    aiEffort: env.AI_EFFORT || 'medium',

    // Storage: Upstash Redis (Vercel Marketplace → Upstash, free tier). Falls back to a local file in dev.
    redisUrl: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '',
    redisToken: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '',
    blobToken: env.BLOB_READ_WRITE_TOKEN || '',
    // Vercel's disk is temporary — this fallback is only for local testing. Production needs Redis.
    dataFile: env.DATA_FILE || (env.VERCEL ? '/tmp/idea-agent-state.json' : '.data/state.json'),
    onVercel: Boolean(env.VERCEL),

    // Protects /api/cron (Vercel sends it automatically) and the private status page
    cronSecret: env.CRON_SECRET || '',
    statusToken: env.STATUS_TOKEN || '',

    timezone: env.TIMEZONE || 'Asia/Kolkata',
    ownerName: env.OWNER_NAME || 'boss',
  };
}

/** Which pieces are configured — names only, never values. Used by the status page. */
export function configReport(cfg = config()) {
  return {
    whatsapp: Boolean(cfg.waToken && cfg.waPhoneId),
    webhookVerify: Boolean(cfg.waVerifyToken),
    signatureCheck: Boolean(cfg.waAppSecret),
    owner: Boolean(cfg.ownerNumber),
    ai: aiProviderOf(cfg) !== 'offline',
    aiProvider: aiProviderOf(cfg),
    storage: cfg.redisUrl && cfg.redisToken ? 'redis' : cfg.blobToken ? 'blob' : 'local-file',
    cronSecret: Boolean(cfg.cronSecret),
    statusToken: Boolean(cfg.statusToken),
  };
}

export function aiProviderOf(cfg) {
  // An explicit choice always wins (no silent switch to another AI). Missing key → offline mode.
  if (cfg.aiProvider === 'claude') return cfg.anthropicKey ? 'claude' : 'offline';
  if (cfg.aiProvider === 'gemini') return cfg.geminiKey ? 'gemini' : 'offline';
  if (cfg.geminiKey) return 'gemini';
  if (cfg.anthropicKey) return 'claude';
  return 'offline';
}
