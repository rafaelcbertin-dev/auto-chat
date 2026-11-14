import type { InboundEvent } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Converte o corpo de um webhook da Meta em eventos normalizados.
 * Suporta:
 *  - Instagram API with Instagram Login (object = "instagram"): DMs, cliques e comentários
 *  - WhatsApp Cloud API (object = "whatsapp_business_account"): mensagens recebidas
 */
export function parseWebhook(body: any): InboundEvent[] {
  if (!body || typeof body !== 'object') return [];
  if (body.object === 'instagram') return parseInstagram(body);
  if (body.object === 'whatsapp_business_account') return parseWhatsApp(body);
  return [];
}

function parseInstagram(body: any): InboundEvent[] {
  const out: InboundEvent[] = [];
  for (const entry of body.entry ?? []) {
    const ownId = String(entry.id ?? '');

    for (const m of entry.messaging ?? []) {
      const senderId = String(m.sender?.id ?? '');
      if (!senderId || senderId === ownId) continue;
      if (m.message) {
        if (m.message.is_echo || m.message.is_deleted) continue;
        const text: string = m.message.text ?? '';
        const payload: string | undefined = m.message.quick_reply?.payload;
        if (!text && !payload) continue; // figurinhas, áudios etc.
        out.push({
          kind: 'message',
          channel: 'instagram',
          eventId: `ig:${m.message.mid}`,
          text,
          payload,
          from: { id: senderId },
        });
      } else if (m.postback) {
        out.push({
          kind: 'message',
          channel: 'instagram',
          eventId: `ig:pb:${m.postback.mid ?? `${senderId}:${m.timestamp}`}`,
          text: m.postback.title ?? '',
          payload: m.postback.payload,
          from: { id: senderId },
        });
      }
    }

    for (const ch of entry.changes ?? []) {
      if (ch.field !== 'comments' && ch.field !== 'live_comments') continue;
      const v = ch.value ?? {};
      const fromId = String(v.from?.id ?? '');
      if (!fromId || fromId === ownId || !v.id) continue; // ignora os próprios comentários
      out.push({
        kind: 'comment',
        channel: 'instagram',
        eventId: `ig:c:${v.id}`,
        commentId: String(v.id),
        mediaId: v.media?.id ? String(v.media.id) : null,
        text: v.text ?? '',
        from: { id: fromId, username: v.from?.username },
      });
    }
  }
  return out;
}

function parseWhatsApp(body: any): InboundEvent[] {
  const out: InboundEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if (ch.field !== 'messages') continue;
      const v = ch.value ?? {};
      const names = new Map<string, string>();
      for (const c of v.contacts ?? []) if (c.wa_id) names.set(String(c.wa_id), c.profile?.name);

      for (const m of v.messages ?? []) {
        const from = String(m.from ?? '');
        if (!from) continue;
        let text = '';
        let payload: string | undefined;
        switch (m.type) {
          case 'text':
            text = m.text?.body ?? '';
            break;
          case 'interactive':
            if (m.interactive?.button_reply) {
              text = m.interactive.button_reply.title ?? '';
              payload = m.interactive.button_reply.id;
            } else if (m.interactive?.list_reply) {
              text = m.interactive.list_reply.title ?? '';
              payload = m.interactive.list_reply.id;
            }
            break;
          case 'button': // botão de template
            text = m.button?.text ?? '';
            payload = m.button?.payload;
            break;
          default:
            continue; // mídia, localização etc. (ignorados por enquanto)
        }
        if (!text && !payload) continue;
        out.push({
          kind: 'message',
          channel: 'whatsapp',
          eventId: `wa:${m.id}`,
          text,
          payload,
          from: { id: from, name: names.get(from) },
        });
      }
    }
  }
  return out;
}

const enc = new TextEncoder();

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Valida o cabeçalho X-Hub-Signature-256 contra qualquer um dos segredos configurados. */
export async function verifySignature(
  rawBody: string,
  header: string | null,
  secrets: (string | undefined)[],
  allowUnsigned = false,
): Promise<boolean> {
  const valid = secrets.filter((s): s is string => !!s);
  if (!valid.length) return allowUnsigned; // sem segredo configurado: só aceita em desenvolvimento
  if (!header?.startsWith('sha256=')) return false;
  const got = header.slice(7);
  for (const s of valid) {
    if (timingSafeEqual(await hmacHex(s, rawBody), got)) return true;
  }
  return false;
}
