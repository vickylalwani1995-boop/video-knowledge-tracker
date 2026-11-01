// WhatsApp Cloud API (Meta): verify the webhook, read incoming messages, send replies, download screenshots.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { chunk } from './format.js';

/** Meta signs every webhook POST with your App Secret. Reject anything that doesn't match. */
export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret) return true; // not configured (local dev) — status page warns about this
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header.slice(7), 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Flatten Meta's nested webhook payload into simple messages. Status updates (delivered/read) are ignored. */
export function parseWebhook(body) {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      for (const m of v.messages || []) {
        const msg = { id: m.id, from: m.from, type: m.type, text: '', mediaId: null, mimeType: null, timestamp: Number(m.timestamp) * 1000 || Date.now() };
        if (m.type === 'text') msg.text = m.text?.body || '';
        else if (m.type === 'image') { msg.text = m.image?.caption || ''; msg.mediaId = m.image?.id; msg.mimeType = m.image?.mime_type; }
        else if (m.type === 'video') { msg.text = m.video?.caption || ''; msg.mediaId = null; msg.note = 'video'; }
        else if (m.type === 'document') { msg.text = m.document?.caption || m.document?.filename || ''; }
        else if (m.type === 'button') msg.text = m.button?.text || '';
        else if (m.type === 'interactive') msg.text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
        else if (m.type === 'audio') msg.note = 'audio';
        out.push(msg);
      }
    }
  }
  return out;
}

export function createWhatsApp(cfg, fetchImpl = fetch) {
  const base = `https://graph.facebook.com/${cfg.waGraphVersion}`;
  const auth = { Authorization: `Bearer ${cfg.waToken}` };

  async function post(payload) {
    const res = await fetchImpl(`${base}/${cfg.waPhoneId}/messages`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`WhatsApp send failed (${res.status}): ${body?.error?.message || 'unknown error'}`);
      err.code = body?.error?.code;
      throw err;
    }
    return body;
  }

  return {
    async sendText(to, text) {
      for (const part of chunk(text)) {
        await post({ to, type: 'text', text: { body: part, preview_url: false } });
      }
    },
    /** Business-initiated message outside the 24h window needs a Meta-approved template. */
    async sendTemplate(to, name, lang, bodyText) {
      const template = { name, language: { code: lang } };
      if (bodyText) template.components = [{ type: 'body', parameters: [{ type: 'text', text: bodyText.slice(0, 1000) }] }];
      await post({ to, type: 'template', template });
    },
    async markRead(messageId) {
      try { await post({ status: 'read', message_id: messageId }); } catch { /* cosmetic only */ }
    },
    /** Is the access token still valid? (Temporary tokens from Meta's API Setup page expire after ~24h.) */
    async checkToken() {
      if (!cfg.waToken || !cfg.waPhoneId) return { ok: false, problem: 'WhatsApp token or phone number id missing' };
      try {
        const res = await fetchImpl(`${base}/${cfg.waPhoneId}?fields=display_phone_number,verified_name`, { headers: auth });
        const body = await res.json().catch(() => ({}));
        if (res.ok) return { ok: true, number: body.display_phone_number, name: body.verified_name };
        const e = body.error || {};
        const expired = e.code === 190 || /expired|session/i.test(e.message || '');
        return { ok: false, expired, problem: expired ? 'WhatsApp token EXPIRED: create a permanent token (see guide) and save it as WHATSAPP_TOKEN' : `WhatsApp rejected the token: ${e.message || res.status}` };
      } catch (err) {
        return { ok: false, problem: `Could not reach WhatsApp: ${err.message}` };
      }
    },
    async downloadMedia(mediaId) {
      const meta = await fetchImpl(`${base}/${mediaId}`, { headers: auth }).then(r => r.json());
      if (!meta?.url) throw new Error('Could not find the image on WhatsApp');
      const res = await fetchImpl(meta.url, { headers: auth });
      if (!res.ok) throw new Error(`Image download failed (${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 4.5 * 1024 * 1024) throw new Error('Image too large, send a smaller screenshot');
      return { base64: buf.toString('base64'), mimeType: (meta.mime_type || 'image/jpeg').split(';')[0] };
    },
  };
}

/** Error 131047 = more than 24h since the user last messaged; only templates can be sent. */
export function isWindowClosed(err) {
  return err?.code === 131047 || /24 hours|re-engagement/i.test(err?.message || '');
}
