// Webhook for WhatsApp Cloud API.
//   GET  → Meta's one-time verification handshake
//   POST → incoming messages from your phone
import { makeDeps } from '../lib/deps.js';
import { parseWebhook, verifySignature } from '../lib/whatsapp.js';
import { handleMessage } from '../lib/agent.js';

export async function GET(request) {
  const { cfg } = makeDeps();
  const q = new URL(request.url).searchParams;
  if (q.get('hub.mode') === 'subscribe' && cfg.waVerifyToken && q.get('hub.verify_token') === cfg.waVerifyToken) {
    return new Response(q.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request, deps = makeDeps()) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), deps.cfg.waAppSecret)) {
    return new Response('Bad signature', { status: 401 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }

  const results = [];
  for (const msg of parseWebhook(body)) {
    try { results.push(await handleMessage(msg, deps)); }
    catch (err) {
      // Never return an error to Meta (it would retry forever); log it for Vercel's runtime logs.
      console.error('handleMessage failed:', err.message);
      results.push({ error: err.message });
    }
  }
  return Response.json({ ok: true, handled: results.length });
}
