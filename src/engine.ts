import type {
  Automation,
  CommentEvent,
  Contact,
  FlowNode,
  MessageEvent,
  InboundEvent,
  QuestionNode,
  Recipient,
  Sender,
  Store,
} from './types';

const MAX_STEPS = 25;
const PAYLOAD_PREFIX = 'ac';

export function buttonPayload(automationId: number, nodeId: string, index: number): string {
  return `${PAYLOAD_PREFIX}|${automationId}|${nodeId}|${index}`;
}

export function parseButtonPayload(payload: string | undefined) {
  if (!payload) return null;
  const parts = payload.split('|');
  if (parts.length !== 4 || parts[0] !== PAYLOAD_PREFIX) return null;
  const automationId = Number(parts[1]);
  const index = Number(parts[3]);
  if (!Number.isInteger(automationId) || !Number.isInteger(index)) return null;
  return { automationId, nodeId: parts[2], index };
}

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verifica se o texto dispara a automação. Retorna a "força" do match (0 = não). */
export function matchScore(a: Automation, text: string): number {
  if (a.matchMode === 'any') return 1;
  const t = normalize(text);
  if (!t) return 0;
  for (const kw of a.keywords) {
    const k = normalize(kw);
    if (!k) continue;
    if (a.matchMode === 'exact' && t === k) return 3;
    if (a.matchMode === 'contains') {
      const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
      if (re.test(t)) return 2;
    }
  }
  return 0;
}

export function renderTemplate(text: string, c: Contact): string {
  const first = (c.name ?? '').split(' ')[0] || c.username || '';
  const vars: Record<string, string> = {
    first_name: first,
    name: c.name ?? c.username ?? '',
    username: c.username ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    ...c.fields,
  };
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateAnswer(node: QuestionNode, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (node.validate === 'email') return EMAIL_RE.test(v) ? v.toLowerCase() : null;
  if (node.validate === 'phone') {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15 ? digits : null;
  }
  return v;
}

function findNode(a: Automation, id: string | undefined): FlowNode | undefined {
  if (!id) return undefined;
  return a.flow.nodes.find((n) => n.id === id);
}

export class Engine {
  constructor(
    private store: Store,
    private sender: Sender,
    private log: (...args: unknown[]) => void = console.log,
  ) {}

  async handle(ev: InboundEvent): Promise<void> {
    if (!(await this.store.claimEvent(ev.eventId))) return; // reenvio da Meta

    let contact = await this.store.upsertContact(ev.channel, ev.from.id, {
      username: ev.from.username,
      name: ev.kind === 'message' ? ev.from.name : undefined,
      phone: ev.channel === 'whatsapp' ? ev.from.id : undefined,
    });

    if (contact.isNew && ev.channel === 'instagram' && !contact.username && this.sender.fetchInstagramProfile) {
      const profile = await this.sender.fetchInstagramProfile(ev.from.id).catch(() => null);
      if (profile) {
        contact = await this.store.upsertContact(ev.channel, ev.from.id, profile);
      }
    }

    if (ev.kind === 'comment') return this.onComment(contact, ev);
    return this.onMessage(contact, ev);
  }

  private async onComment(contact: Contact, ev: CommentEvent) {
    await this.store.logMessage(contact.id, 'in', ev.text, { type: 'comment', commentId: ev.commentId, mediaId: ev.mediaId });

    const automations = (await this.store.listAutomations('instagram', 'comment')).filter(
      (a) => !a.mediaId || a.mediaId === ev.mediaId,
    );
    const best = this.pickBest(automations, ev.text);
    if (!best) return;
    if (best.oncePerContact && (await this.store.hasRun(best.id, contact.id))) return;

    if (best.publicReplies.length) {
      const reply = best.publicReplies[Math.floor(Math.random() * best.publicReplies.length)];
      await this.sender
        .replyToComment(ev.commentId, renderTemplate(reply, contact))
        .catch((e) => this.store.logMessage(contact.id, 'error', `Falha ao responder comentário: ${String(e)}`));
    }

    await this.store.recordRun(best.id, contact.id);
    // No Instagram só é permitida UMA resposta privada por comentário;
    // o fluxo continua quando a pessoa clicar num botão ou responder.
    await this.run(best, best.flow.start, contact, { commentId: ev.commentId }, true);
  }

  private async onMessage(contact: Contact, ev: MessageEvent) {
    await this.store.touchInbound(contact.id);
    await this.store.logMessage(contact.id, 'in', ev.text, ev.payload ? { payload: ev.payload } : undefined);
    const to: Recipient = { userId: ev.from.id };

    // 1) Clique em botão
    const click = parseButtonPayload(ev.payload);
    if (click) {
      const a = await this.store.getAutomation(click.automationId);
      const node = a && findNode(a, click.nodeId);
      if (a && node?.type === 'message') {
        const btn = node.buttons?.[click.index];
        await this.store.clearSession(contact.id);
        if (btn?.next) await this.run(a, btn.next, contact, to);
        return;
      }
    }

    // 2) Conversa em andamento (pergunta ou botões aguardando)
    const session = await this.store.getSession(contact.id);
    if (session) {
      const a = await this.store.getAutomation(session.automationId);
      const node = a && findNode(a, session.nodeId);
      if (a && node) {
        const handled = await this.continueSession(a, node, contact, to, ev.text);
        if (handled) return;
      } else {
        await this.store.clearSession(contact.id);
      }
    }

    // 3) Palavra-chave
    const best = this.pickBest(await this.store.listAutomations(ev.channel, 'keyword'), ev.text);
    if (!best) return;
    if (best.oncePerContact && (await this.store.hasRun(best.id, contact.id))) return;
    await this.store.recordRun(best.id, contact.id);
    await this.run(best, best.flow.start, contact, to);
  }

  /** Retorna true se a mensagem foi consumida pela sessão atual. */
  private async continueSession(a: Automation, node: FlowNode, contact: Contact, to: Recipient, text: string) {
    if (node.type === 'question') {
      // Se a pessoa mandou uma palavra-chave específica, deixa a outra automação assumir
      const other = this.pickBest(await this.store.listAutomations(contact.channel, 'keyword'), text);
      if (other && other.matchMode !== 'any' && other.id !== a.id) {
        await this.store.clearSession(contact.id);
        return false;
      }
      const value = validateAnswer(node, text);
      if (value === null) {
        await this.sendText(contact, to, node.retryText || 'Hmm, não entendi. Pode tentar de novo?');
        return true;
      }
      await this.saveAnswer(contact, node.saveTo, value);
      await this.store.clearSession(contact.id);
      if (node.next) await this.run(a, node.next, contact, to);
      return true;
    }

    if (node.type === 'message' && node.buttons?.length) {
      // WhatsApp/Instagram às vezes chegam como texto: aceita o título do botão digitado
      const t = normalize(text);
      const idx = node.buttons.findIndex((b) => normalize(b.title) === t);
      if (idx >= 0) {
        await this.store.clearSession(contact.id);
        const next = node.buttons[idx].next;
        if (next) await this.run(a, next, contact, to);
        return true;
      }
    }
    return false;
  }

  private async saveAnswer(contact: Contact, field: string, value: string) {
    if (field === 'email' || field === 'phone' || field === 'name') {
      await this.store.updateContact(contact.id, { [field]: value });
      (contact as unknown as Record<string, unknown>)[field] = value;
    } else {
      await this.store.updateContact(contact.id, { fields: { [field]: value } });
      contact.fields = { ...contact.fields, [field]: value };
    }
  }

  private pickBest(list: Automation[], text: string): Automation | null {
    let best: Automation | null = null;
    let bestScore = 0;
    for (const a of list) {
      if (!a.enabled) continue;
      const s = matchScore(a, text);
      if (s > bestScore) {
        best = a;
        bestScore = s;
      }
    }
    return best;
  }

  /**
   * Executa o fluxo a partir de `nodeId`. Para quando encontra uma pergunta,
   * uma mensagem com botões ou o fim do fluxo.
   * `singleMessage` = só pode enviar 1 mensagem (resposta privada a comentário).
   */
  async run(a: Automation, nodeId: string, contact: Contact, to: Recipient, singleMessage = false) {
    let current = findNode(a, nodeId);
    let sent = 0;
    for (let step = 0; current && step < MAX_STEPS; step++) {
      const node: FlowNode = current;
      if (node.type === 'tag') {
        if (node.add?.length) await this.store.addTags(contact.id, node.add);
        if (node.remove?.length) await this.store.removeTags(contact.id, node.remove);
        current = findNode(a, node.next);
        continue;
      }

      if (singleMessage && sent >= 1) {
        // Guarda onde parou: a próxima mensagem da pessoa continua daqui
        await this.store.setSession(contact.id, { automationId: a.id, nodeId: node.id });
        return;
      }

      if (node.type === 'question') {
        await this.sendText(contact, to, node.text);
        await this.store.setSession(contact.id, { automationId: a.id, nodeId: node.id });
        return;
      }

      // message
      const buttons = (node.buttons ?? []).map((b, i) => ({ title: b.title, payload: buttonPayload(a.id, node.id, i) }));
      const ok = await this.sendMessage(contact, to, { text: renderTemplate(node.text, contact), buttons });
      sent++;
      if (!ok) return;
      if (buttons.length) {
        await this.store.setSession(contact.id, { automationId: a.id, nodeId: node.id });
        return;
      }
      current = findNode(a, node.next);
    }
  }

  private sendText(contact: Contact, to: Recipient, text: string) {
    return this.sendMessage(contact, to, { text: renderTemplate(text, contact) });
  }

  private async sendMessage(contact: Contact, to: Recipient, msg: { text: string; buttons?: { title: string; payload: string }[] }) {
    try {
      await this.sender.send(contact.channel, to, msg);
      await this.store.logMessage(contact.id, 'out', msg.text, msg.buttons?.length ? { buttons: msg.buttons.map((b) => b.title) } : undefined);
      return true;
    } catch (e) {
      this.log('send failed', e);
      await this.store.logMessage(contact.id, 'error', `Falha ao enviar: ${String(e)}`);
      return false;
    }
  }
}
