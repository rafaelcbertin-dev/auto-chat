import type { Channel, OutMessage, Recipient, Sender } from '../types';

export interface MetaConfig {
  version: string;
  igToken?: string;
  /** ID da conta profissional do Instagram (obrigatório no login unificado) */
  igAccountId?: string;
  /**
   * 'facebook' = login unificado (token de usuário do sistema, graph.facebook.com);
   * 'instagram' = token antigo do Instagram Login (graph.instagram.com).
   */
  igHost?: 'facebook' | 'instagram';
  waToken?: string;
  waPhoneNumberId?: string;
  fetch?: typeof fetch;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function withLinksInText(msg: OutMessage): string {
  const links = (msg.buttons ?? []).filter((b) => b.url);
  return links.length ? `${msg.text}\n\n${links.map((b) => `${b.title}: ${b.url}`).join('\n')}` : msg.text;
}

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

  private igBase() {
    return `https://graph.${this.cfg.igHost === 'instagram' ? 'instagram' : 'facebook'}.com/${this.cfg.version}`;
  }

  async replyToComment(commentId: string, text: string): Promise<void> {
    this.need(this.cfg.igToken, 'conexão com o Instagram');
    await this.post(`${this.igBase()}/${encodeURIComponent(commentId)}/replies`, this.cfg.igToken!, {
      message: text,
    });
  }

  async fetchInstagramProfile(userId: string) {
    if (!this.cfg.igToken) return null;
    const url = `${this.igBase()}/${encodeURIComponent(userId)}?fields=name,username`;
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
            buttons: buttons.map((b) =>
              b.url
                ? { type: 'web_url', url: b.url, title: clip(b.title, 20) }
                : { type: 'postback', title: clip(b.title, 20), payload: b.payload },
            ),
          },
        },
      };
    }
    // Respostas rápidas não aceitam link: os links vão no texto
    return {
      text: clip(withLinksInText(msg), 1000),
      quick_replies: buttons
        .filter((b) => !b.url)
        .slice(0, 13)
        .map((b) => ({ content_type: 'text', title: clip(b.title, 20), payload: b.payload })),
    };
  }

  /** Corpo da mensagem no formato do WhatsApp (exportado para testes). */
  static whatsappMessage(to: string, msg: OutMessage): Record<string, unknown> {
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
    const all = msg.buttons ?? [];
    const links = all.filter((b) => b.url);
    const replies = all.filter((b) => !b.url);
    // Um único botão de link: mensagem "call to action" com URL
    if (links.length === 1 && !replies.length) {
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: clip(msg.text, 1024) },
          action: { name: 'cta_url', parameters: { display_text: clip(links[0].title, 20), url: links[0].url } },
        },
      };
    }
    const text = links.length ? withLinksInText({ text: msg.text, buttons: links }) : msg.text;
    if (!replies.length) return { ...base, type: 'text', text: { body: clip(text, 4096), preview_url: true } };
    if (replies.length <= 3) {
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: clip(text, 1024) },
          action: { buttons: replies.map((b) => ({ type: 'reply', reply: { id: b.payload, title: clip(b.title, 20) } })) },
        },
      };
    }
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: clip(text, 1024) },
        action: {
          button: 'Ver opções',
          sections: [{ title: 'Opções', rows: replies.slice(0, 10).map((b) => ({ id: b.payload, title: clip(b.title, 24) })) }],
        },
      },
    };
  }

  private async sendInstagram(to: Recipient, msg: OutMessage) {
    this.need(this.cfg.igToken, 'conexão com o Instagram');
    const recipient = 'commentId' in to ? { comment_id: to.commentId } : { id: to.userId };
    // Login unificado: POST /<IG_ID>/messages. Token antigo do Instagram: POST /me/messages.
    const node = this.cfg.igHost === 'instagram' ? 'me' : this.cfg.igAccountId;
    if (!node) throw new Error('ID da conta do Instagram não configurado: conecte o Instagram no painel');
    await this.post(`${this.igBase()}/${encodeURIComponent(node)}/messages`, this.cfg.igToken!, {
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
