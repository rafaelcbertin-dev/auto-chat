import type { Channel, OutMessage, Recipient, Sender } from '../types';

export interface MetaConfig {
  version: string;
  igToken?: string;
  waToken?: string;
  waPhoneNumberId?: string;
  fetch?: typeof fetch;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Envia mensagens pela Graph API oficial da Meta (Instagram e WhatsApp). */
export class MetaSender implements Sender {
  private f: typeof fetch;
  constructor(private cfg: MetaConfig) {
    this.f = cfg.fetch ?? fetch.bind(globalThis);
  }

  async send(channel: Channel, to: Recipient, msg: OutMessage): Promise<void> {
    if (channel === 'instagram') return this.sendInstagram(to, msg);
    if (!('userId' in to)) throw new Error('WhatsApp exige um destinatário (telefone)');
    return this.sendWhatsApp(to.userId, msg);
  }

  async replyToComment(commentId: string, text: string): Promise<void> {
    this.need(this.cfg.igToken, 'IG_ACCESS_TOKEN');
    await this.post(`https://graph.instagram.com/${this.cfg.version}/${encodeURIComponent(commentId)}/replies`, this.cfg.igToken!, {
      message: text,
    });
  }

  async fetchInstagramProfile(userId: string) {
    if (!this.cfg.igToken) return null;
    const url = `https://graph.instagram.com/${this.cfg.version}/${encodeURIComponent(userId)}?fields=name,username`;
    const res = await this.f(url, { headers: { Authorization: `Bearer ${this.cfg.igToken}` } });
    if (!res.ok) return null;
    const j = (await res.json()) as { name?: string; username?: string };
    return { name: j.name, username: j.username };
  }

  /** Corpo da mensagem no formato do Instagram (exportado para testes). */
  static instagramMessage(msg: OutMessage): Record<string, unknown> {
    const buttons = msg.buttons ?? [];
    if (!buttons.length) return { text: clip(msg.text, 1000) };
    if (buttons.length <= 3) {
      return {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: clip(msg.text, 640),
            buttons: buttons.map((b) => ({ type: 'postback', title: clip(b.title, 20), payload: b.payload })),
          },
        },
      };
    }
    return {
      text: clip(msg.text, 1000),
      quick_replies: buttons.slice(0, 13).map((b) => ({ content_type: 'text', title: clip(b.title, 20), payload: b.payload })),
    };
  }

  /** Corpo da mensagem no formato do WhatsApp (exportado para testes). */
  static whatsappMessage(to: string, msg: OutMessage): Record<string, unknown> {
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
    const buttons = msg.buttons ?? [];
    if (!buttons.length) return { ...base, type: 'text', text: { body: clip(msg.text, 4096), preview_url: true } };
    if (buttons.length <= 3) {
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: clip(msg.text, 1024) },
          action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.payload, title: clip(b.title, 20) } })) },
        },
      };
    }
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: clip(msg.text, 1024) },
        action: {
          button: 'Ver opções',
          sections: [{ title: 'Opções', rows: buttons.slice(0, 10).map((b) => ({ id: b.payload, title: clip(b.title, 24) })) }],
        },
      },
    };
  }

  private async sendInstagram(to: Recipient, msg: OutMessage) {
    this.need(this.cfg.igToken, 'IG_ACCESS_TOKEN');
    const recipient = 'commentId' in to ? { comment_id: to.commentId } : { id: to.userId };
    await this.post(`https://graph.instagram.com/${this.cfg.version}/me/messages`, this.cfg.igToken!, {
      recipient,
      message: MetaSender.instagramMessage(msg),
    });
  }

  private async sendWhatsApp(to: string, msg: OutMessage) {
    this.need(this.cfg.waToken, 'WA_ACCESS_TOKEN');
    this.need(this.cfg.waPhoneNumberId, 'WA_PHONE_NUMBER_ID');
    await this.post(
      `https://graph.facebook.com/${this.cfg.version}/${this.cfg.waPhoneNumberId}/messages`,
      this.cfg.waToken!,
      MetaSender.whatsappMessage(to, msg),
    );
  }

  private need(v: string | undefined, name: string) {
    if (!v) throw new Error(`Segredo ${name} não configurado`);
  }

  private async post(url: string, token: string, body: unknown) {
    const res = await this.f(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Meta API ${res.status}: ${detail.slice(0, 500)}`);
    }
  }
}
