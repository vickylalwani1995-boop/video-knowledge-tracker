// Webhook for WhatsApp Cloud API (this is the URL saved in Meta: /api/webhook/whatsapp).
//   GET  → Meta's one-time verification handshake
//   POST → incoming messages. We answer Meta instantly and keep working in the background,
//          so slow AI replies never cause timeouts or duplicate deliveries.
import { makeDeps } from '../../lib/deps.js';
import { parseWebhook, verifySignature } from '../../lib/whatsapp.js';
import { handleMessage } from '../../lib/agent.js';

export async function GET(request, deps) {
  const { cfg } = deps || await makeDeps();
  const q = new URL(request.url).searchParams;
  if (q.get('hub.mode') === 'subscribe' && cfg.waVerifyToken && q.get('hub.verify_token') === cfg.waVerifyToken) {
    return new Response(q.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request, deps) {
  const d = deps || await makeDeps();
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), d.cfg.waAppSecret)) {
    return new Response('Bad signature', { status: 401 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }

  const messages = parseWebhook(body);
  const work = (async () => {
    for (const msg of messages) {
      try { await handleMessage(msg, d); }
      catch (err) { console.error('handleMessage failed:', err.message); }
    }
  })();
  if (d.waitUntil) d.waitUntil(work); else await work;
  return Response.json({ ok: true, received: messages.length });
}
