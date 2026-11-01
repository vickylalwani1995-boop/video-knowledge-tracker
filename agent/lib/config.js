// All settings come from environment variables (set them in Vercel → Project → Settings → Environment Variables).
// Nothing secret is ever hard-coded or logged.

export function config(env = process.env) {
  return {
    // WhatsApp Cloud API (Meta)
    waToken: env.WHATSAPP_TOKEN || '',
    waPhoneId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    waVerifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    waAppSecret: env.WHATSAPP_APP_SECRET || '',
    waGraphVersion: env.WHATSAPP_GRAPH_VERSION || 'v21.0',
    // Only this number may talk to the agent (digits only, with country code, e.g. 919876543210)
    ownerNumber: (env.OWNER_WHATSAPP || '').replace(/\D/g, ''),
    // Optional approved template used when WhatsApp's 24-hour window is closed
    waTemplate: env.WHATSAPP_TEMPLATE || '',
    waTemplateLang: env.WHATSAPP_TEMPLATE_LANG || 'en_US',

    // AI brain
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    aiModel: env.AI_MODEL || 'claude-opus-5-5',
    aiEffort: env.AI_EFFORT || 'medium',

    // Storage: Upstash Redis (Vercel Marketplace → Upstash, free tier). Falls back to a local file in dev.
    redisUrl: env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '',
    redisToken: env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '',
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
    ai: Boolean(cfg.anthropicKey),
    storage: cfg.redisUrl && cfg.redisToken ? 'redis' : 'local-file',
    cronSecret: Boolean(cfg.cronSecret),
    statusToken: Boolean(cfg.statusToken),
  };
}
