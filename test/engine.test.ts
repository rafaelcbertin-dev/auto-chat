import { beforeEach, describe, expect, it } from 'vitest';
import { validateAutomation } from '../src/admin/api';
import { MetaSender } from '../src/channels/meta';
import { buttonPayload, Engine, matchScore } from '../src/engine';
import type { Automation, Channel, Contact, OutMessage, Recipient, Sender, SessionState, Store, TriggerType } from '../src/types';
import { hmacHex, parseWebhook, verifySignature } from '../src/webhook';

class MemStore implements Store {
  events = new Set<string>();
  contacts: (Contact & { lastInbound?: number })[] = [];
  automations: Automation[] = [];
  sessions = new Map<number, SessionState>();
  runs: [number, number][] = [];
  log: { contactId: number; dir: string; text: string }[] = [];

  async claimEvent(id: string) {
    if (this.events.has(id)) return false;
    this.events.add(id);
    return true;
  }
  async upsertContact(channel: Channel, externalId: string, info: { username?: string; name?: string; phone?: string; accountId?: string }) {
    let c = this.contacts.find((x) => x.channel === channel && x.externalId === externalId);
    const isNew = !c;
    if (!c) {
      c = { id: this.contacts.length + 1, channel, externalId, username: null, name: null, phone: null, email: null, fields: {}, tags: [] };
      this.contacts.push(c);
    }
    c.username = info.username ?? c.username;
    c.name = c.name ?? info.name ?? null;
    c.phone = c.phone ?? info.phone ?? null;
    c.accountId = info.accountId ?? c.accountId ?? null;
    return { ...c, fields: { ...c.fields }, tags: [...c.tags], isNew };
  }
  get(id: number) {
    return this.contacts.find((c) => c.id === id)!;
  }
  async touchInbound(id: number) {
    this.get(id).lastInbound = Date.now();
  }
  async updateContact(id: number, patch: { email?: string; phone?: string; name?: string; fields?: Record<string, string> }) {
    const c = this.get(id);
    if (patch.email !== undefined) c.email = patch.email;
    if (patch.phone !== undefined) c.phone = patch.phone;
    if (patch.name !== undefined) c.name = patch.name;
    if (patch.fields) c.fields = { ...c.fields, ...patch.fields };
  }
  async addTags(id: number, tags: string[]) {
    const c = this.get(id);
    c.tags = [...new Set([...c.tags, ...tags])];
  }
  async removeTags(id: number, tags: string[]) {
    const c = this.get(id);
    c.tags = c.tags.filter((t) => !tags.includes(t));
  }
  async logMessage(contactId: number, dir: 'in' | 'out' | 'error', text: string) {
    this.log.push({ contactId, dir, text });
  }
  async listAutomations(channel: Channel, trigger: TriggerType) {
    return this.automations.filter((a) => a.enabled && a.channel === channel && a.trigger === trigger);
  }
  async getAutomation(id: number) {
    return this.automations.find((a) => a.id === id) ?? null;
  }
  async getSession(id: number) {
    return this.sessions.get(id) ?? null;
  }
  async setSession(id: number, s: SessionState) {
    this.sessions.set(id, s);
  }
  async clearSession(id: number) {
    this.sessions.delete(id);
  }
  async hasRun(a: number, c: number) {
    return this.runs.some(([x, y]) => x === a && y === c);
  }
  async recordRun(a: number, c: number) {
    this.runs.push([a, c]);
  }
}

class FakeSender implements Sender {
  sent: { channel: Channel; to: Recipient; msg: OutMessage }[] = [];
  publicReplies: { commentId: string; text: string }[] = [];
  async send(channel: Channel, to: Recipient, msg: OutMessage) {
    this.sent.push({ channel, to, msg });
  }
  async replyToComment(commentId: string, text: string) {
    this.publicReplies.push({ commentId, text });
  }
}

let n = 0;
const ig = (text: string, payload?: string, from = 'u1') =>
  ({ kind: 'message', channel: 'instagram', eventId: `e${++n}`, text, payload, from: { id: from } }) as const;

function auto(partial: Partial<Automation> & Pick<Automation, 'flow'>): Automation {
  return {
    id: 1,
    name: 'a',
    enabled: true,
    channel: 'instagram',
    trigger: 'keyword',
    keywords: ['ebook'],
    matchMode: 'contains',
    mediaId: null,
    publicReplies: [],
    oncePerContact: false,
    ...partial,
  };
}

const leadFlow = auto({
  flow: {
    start: 'inicio',
    nodes: [
      { id: 'inicio', type: 'message', text: 'Oi {{first_name}}! Quer o ebook?', buttons: [{ title: 'Sim', next: 'email' }, { title: 'Não', next: 'tchau' }] },
      { id: 'email', type: 'question', text: 'Seu e-mail?', saveTo: 'email', validate: 'email', retryText: 'Inválido', next: 'tag' },
      { id: 'tag', type: 'tag', add: ['lead'], next: 'fim' },
      { id: 'fim', type: 'message', text: 'Enviado para {{email}}' },
      { id: 'tchau', type: 'message', text: 'Ok!' },
    ],
  },
});

describe('engine', () => {
  let store: MemStore;
  let sender: FakeSender;
  let engine: Engine;
  beforeEach(() => {
    store = new MemStore();
    sender = new FakeSender();
    engine = new Engine(store, sender, () => {});
  });

  it('keyword → buttons → question → tag → final message', async () => {
    store.automations.push(leadFlow);
    await engine.handle({ ...ig('Quero o EBOOK!'), from: { id: 'u1', name: 'Maria Silva' } });
    expect(sender.sent[0].msg.text).toBe('Oi Maria! Quer o ebook?');
    expect(sender.sent[0].msg.buttons?.map((b) => b.title)).toEqual(['Sim', 'Não']);

    await engine.handle(ig('Sim', buttonPayload(1, 'inicio', 0)));
    expect(sender.sent[1].msg.text).toBe('Seu e-mail?');

    await engine.handle(ig('não sei'));
    expect(sender.sent[2].msg.text).toBe('Inválido');

    await engine.handle(ig('Maria@Exemplo.com'));
    expect(sender.sent[3].msg.text).toBe('Enviado para maria@exemplo.com');
    expect(store.get(1).email).toBe('maria@exemplo.com');
    expect(store.get(1).tags).toEqual(['lead']);
    expect(store.sessions.size).toBe(0);
  });

  it('button title typed as text also works', async () => {
    store.automations.push(leadFlow);
    await engine.handle(ig('ebook'));
    await engine.handle(ig('não'));
    expect(sender.sent.at(-1)!.msg.text).toBe('Ok!');
  });

  it('ignores duplicate webhook deliveries', async () => {
    store.automations.push(leadFlow);
    const ev = ig('ebook');
    await engine.handle(ev);
    await engine.handle(ev);
    expect(sender.sent).toHaveLength(1);
  });

  it('comment trigger: public reply + single private reply, continues on click', async () => {
    store.automations.push(
      auto({
        trigger: 'comment',
        keywords: ['quero'],
        publicReplies: ['Te chamei no direct!'],
        mediaId: 'm1',
        flow: {
          start: 'a',
          nodes: [
            { id: 'a', type: 'message', text: 'Clica aqui', buttons: [{ title: 'Link', next: 'b' }] },
            { id: 'b', type: 'message', text: 'https://x.com', next: 'c' },
            { id: 'c', type: 'message', text: 'Mais alguma coisa?' },
          ],
        },
      }),
    );
    // outro post: não dispara
    await engine.handle({ kind: 'comment', channel: 'instagram', eventId: 'c0', commentId: 'k0', mediaId: 'm2', text: 'quero', from: { id: 'u1' } });
    expect(sender.sent).toHaveLength(0);

    await engine.handle({ kind: 'comment', channel: 'instagram', eventId: 'c1', commentId: 'k1', mediaId: 'm1', text: 'Eu quero!!', from: { id: 'u1', username: 'maria' } });
    expect(sender.publicReplies).toEqual([{ commentId: 'k1', text: 'Te chamei no direct!' }]);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toEqual({ commentId: 'k1' });

    await engine.handle(ig('Link', buttonPayload(1, 'a', 0)));
    expect(sender.sent.slice(1).map((s) => s.msg.text)).toEqual(['https://x.com', 'Mais alguma coisa?']);
    expect(sender.sent[1].to).toEqual({ userId: 'u1' });
  });

  it('oncePerContact and default reply priority', async () => {
    store.automations.push(
      auto({ id: 1, matchMode: 'any', keywords: [], oncePerContact: true, flow: { start: 'x', nodes: [{ id: 'x', type: 'message', text: 'padrão' }] } }),
      auto({ id: 2, keywords: ['preço'], flow: { start: 'y', nodes: [{ id: 'y', type: 'message', text: 'R$ 10' }] } }),
    );
    await engine.handle(ig('oi'));
    await engine.handle(ig('oi de novo'));
    await engine.handle(ig('qual o preco?'));
    expect(sender.sent.map((s) => s.msg.text)).toEqual(['padrão', 'R$ 10']);
  });

  it('keyword escapes a pending question', async () => {
    store.automations.push(leadFlow, auto({ id: 2, keywords: ['menu'], flow: { start: 'm', nodes: [{ id: 'm', type: 'message', text: 'Menu' }] } }));
    await engine.handle(ig('ebook'));
    await engine.handle(ig('Sim', buttonPayload(1, 'inicio', 0)));
    await engine.handle(ig('menu'));
    expect(sender.sent.at(-1)!.msg.text).toBe('Menu');
  });

  it('records send errors and stops the flow', async () => {
    store.automations.push(leadFlow);
    const failing: Sender = { send: async () => { throw new Error('boom'); }, replyToComment: async () => {} };
    await new Engine(store, failing, () => {}).handle(ig('ebook'));
    expect(store.log.some((l) => l.dir === 'error' && l.text.includes('boom'))).toBe(true);
    expect(store.sessions.size).toBe(0);
  });
});

describe('várias contas do Instagram', () => {
  const msg = (id: string, text: string) => ({ start: id, nodes: [{ id, type: 'message' as const, text }] });
  const comment = (eventId: string, text: string, accountId?: string) =>
    ({ kind: 'comment', channel: 'instagram', eventId, commentId: 'k' + eventId, mediaId: null, text, from: { id: 'u9' }, accountId }) as const;

  it('cada conta só dispara as próprias automações; sem conta definida vale para todas', async () => {
    const store = new MemStore();
    const sender = new FakeSender();
    store.automations.push(
      auto({ id: 1, trigger: 'comment', keywords: ['meet'], accountId: '178', flow: msg('a', 'Terravo Meet') }),
      auto({ id: 2, trigger: 'comment', keywords: ['meet'], accountId: '299', flow: msg('b', 'Ampliar Meet') }),
      auto({ id: 3, trigger: 'comment', keywords: ['oi'], accountId: null, flow: msg('c', 'Olá das duas') }),
    );
    const engine = new Engine(store, sender, () => {});
    await engine.handle(comment('x1', 'meet', '299'));
    await engine.handle(comment('x2', 'meet', '178'));
    await engine.handle(comment('x3', 'oi', '299'));
    expect(sender.sent.map((s) => s.msg.text)).toEqual(['Ampliar Meet', 'Terravo Meet', 'Olá das duas']);
  });

  it('palavra no Direct também respeita a conta, e o contato guarda a última conta', async () => {
    const store = new MemStore();
    const sender = new FakeSender();
    store.automations.push(auto({ id: 1, keywords: ['preço'], accountId: '178', flow: msg('a', 'Preço Terravo') }));
    const engine = new Engine(store, sender, () => {});
    await engine.handle({ ...ig('preço'), accountId: '299' });
    expect(sender.sent).toHaveLength(0);
    await engine.handle({ ...ig('preço'), accountId: '178' });
    expect(sender.sent.map((s) => s.msg.text)).toEqual(['Preço Terravo']);
  });

  it('webhook informa a conta (entry.id) em cada evento do Instagram', () => {
    const evs = parseWebhook({
      object: 'instagram',
      entry: [
        { id: '178', changes: [{ field: 'comments', value: { id: 'c1', text: 'meet', from: { id: 'u1' } } }] },
        { id: '299', messaging: [{ sender: { id: 'u2' }, recipient: { id: '299' }, message: { mid: 'm1', text: 'oi' } }] },
      ],
    });
    expect(evs.map((e) => e.accountId)).toEqual(['178', '299']);
  });

  it('valida a conta da automação', () => {
    const base = { name: 'x', keywords: ['a'], flow: { nodes: [{ id: 'a', type: 'message', text: 'oi' }] } };
    expect(validateAutomation({ ...base, accountId: '178' }).accountId).toBe('178');
    expect(validateAutomation(base).accountId).toBeNull();
    expect(() => validateAutomation({ ...base, accountId: '1; DROP' })).toThrow(/Conta/);
  });
});

describe('matchScore', () => {
  it('matches whole words, ignoring accents and case', () => {
    const a = auto({ keywords: ['preço'], flow: { start: 'x', nodes: [] } });
    expect(matchScore(a, 'Qual o PRECO?')).toBeGreaterThan(0);
    expect(matchScore(a, 'precoces')).toBe(0);
  });
});

describe('webhook parsing', () => {
  it('parses Instagram DMs, postbacks and comments, skipping echoes and own comments', () => {
    const evs = parseWebhook({
      object: 'instagram',
      entry: [
        {
          id: 'ME',
          messaging: [
            { sender: { id: 'u1' }, recipient: { id: 'ME' }, message: { mid: 'm1', text: 'oi' } },
            { sender: { id: 'ME' }, recipient: { id: 'u1' }, message: { mid: 'm2', text: 'eco', is_echo: true } },
            { sender: { id: 'u1' }, recipient: { id: 'ME' }, postback: { mid: 'p1', title: 'Sim', payload: 'ac|1|a|0' } },
            { sender: { id: 'u1' }, recipient: { id: 'ME' }, message: { mid: 'm3', text: 'Sim', quick_reply: { payload: 'ac|1|a|0' } } },
          ],
          changes: [
            { field: 'comments', value: { id: 'c1', text: 'quero', from: { id: 'u2', username: 'ana' }, media: { id: 'post1' } } },
            { field: 'comments', value: { id: 'c2', text: 'resposta', from: { id: 'ME', username: 'eu' }, media: { id: 'post1' } } },
          ],
        },
      ],
    });
    expect(evs.map((e) => e.eventId)).toEqual(['ig:m1', 'ig:pb:p1', 'ig:m3', 'ig:c:c1']);
    expect(evs[1]).toMatchObject({ payload: 'ac|1|a|0' });
    expect(evs[3]).toMatchObject({ kind: 'comment', mediaId: 'post1', from: { username: 'ana' } });
  });

  it('parses WhatsApp text and button replies', () => {
    const evs = parseWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ wa_id: '5511999999999', profile: { name: 'João' } }],
                messages: [
                  { from: '5511999999999', id: 'w1', type: 'text', text: { body: 'oi' } },
                  { from: '5511999999999', id: 'w2', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'ac|1|a|0', title: 'Preços' } } },
                  { from: '5511999999999', id: 'w3', type: 'image', image: {} },
                ],
                statuses: [{ id: 's1', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    });
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ channel: 'whatsapp', text: 'oi', from: { id: '5511999999999', name: 'João' } });
    expect(evs[1]).toMatchObject({ payload: 'ac|1|a|0', text: 'Preços' });
  });

  it('verifies signatures', async () => {
    const body = '{"a":1}';
    const sig = 'sha256=' + (await hmacHex('segredo', body));
    expect(await verifySignature(body, sig, ['outro', 'segredo'])).toBe(true);
    expect(await verifySignature(body, sig, ['outro'])).toBe(false);
    expect(await verifySignature(body, null, ['segredo'])).toBe(false);
    expect(await verifySignature(body, null, [])).toBe(false);
    expect(await verifySignature(body, null, [], true)).toBe(true);
  });
});

describe('message formats', () => {
  const btns = (k: number) => Array.from({ length: k }, (_, i) => ({ title: `Opção ${i}`, payload: `p${i}` }));
  it('instagram: button template up to 3, quick replies above', () => {
    expect(MetaSender.instagramMessage({ text: 'oi' })).toEqual({ text: 'oi' });
    expect(MetaSender.instagramMessage({ text: 'oi', buttons: btns(2) })).toMatchObject({ attachment: { payload: { template_type: 'button' } } });
    expect((MetaSender.instagramMessage({ text: 'oi', buttons: btns(5) }) as any).quick_replies).toHaveLength(5);
  });
  it('whatsapp: reply buttons up to 3, list above', () => {
    expect(MetaSender.whatsappMessage('55', { text: 'oi', buttons: btns(3) })).toMatchObject({ type: 'interactive', interactive: { type: 'button' } });
    expect(MetaSender.whatsappMessage('55', { text: 'oi', buttons: btns(4) })).toMatchObject({ interactive: { type: 'list' } });
  });
});

describe('automation validation', () => {
  it('rejects dangling references and comment trigger on WhatsApp', () => {
    expect(() => validateAutomation({ name: 'x', keywords: ['a'], flow: { nodes: [{ id: 'a', type: 'message', text: 'oi', next: 'zzz' }] } })).toThrow(/não existe/);
    expect(() => validateAutomation({ name: 'x', channel: 'whatsapp', trigger: 'comment', keywords: ['a'], flow: { nodes: [{ id: 'a', type: 'message', text: 'oi' }] } })).toThrow(/Instagram/);
    const ok = validateAutomation({ name: 'x', keywords: ['a'], flow: { nodes: [{ id: 'a', type: 'message', text: 'oi' }] } });
    expect(ok.flow.start).toBe('a');
  });
});

describe('botões de link', () => {
  it('envia botão web_url e não espera resposta', async () => {
    const store = new MemStore();
    const sender = new FakeSender();
    store.automations.push(
      auto({
        trigger: 'comment',
        keywords: ['meet'],
        flow: { start: 'a', nodes: [{ id: 'a', type: 'message', text: 'Toca aí', buttons: [{ title: 'Quero o link', url: 'https://x.com/?u={{username}}' }] }] },
      }),
    );
    await new Engine(store, sender, () => {}).handle({ kind: 'comment', channel: 'instagram', eventId: 'k', commentId: 'c', mediaId: null, text: 'Meet', from: { id: 'u', username: 'ana' } });
    expect(sender.sent[0].msg.buttons).toEqual([{ title: 'Quero o link', url: 'https://x.com/?u=ana' }]);
    expect(store.sessions.size).toBe(0);
    expect(MetaSender.instagramMessage(sender.sent[0].msg)).toMatchObject({
      attachment: { payload: { buttons: [{ type: 'web_url', url: 'https://x.com/?u=ana', title: 'Quero o link' }] } },
    });
  });

  it('WhatsApp: um link vira cta_url; link com respostas vai para o texto', () => {
    expect(MetaSender.whatsappMessage('55', { text: 'oi', buttons: [{ title: 'Site', url: 'https://x.com' }] })).toMatchObject({
      interactive: { type: 'cta_url', action: { parameters: { url: 'https://x.com' } } },
    });
    const m = MetaSender.whatsappMessage('55', { text: 'oi', buttons: [{ title: 'Site', url: 'https://x.com' }, { title: 'Preço', payload: 'p' }] }) as any;
    expect(m.interactive.type).toBe('button');
    expect(m.interactive.body.text).toContain('Site: https://x.com');
    expect(m.interactive.action.buttons).toHaveLength(1);
  });

  it('valida que o link começa com http', () => {
    expect(() => validateAutomation({ name: 'x', keywords: ['a'], flow: { nodes: [{ id: 'a', type: 'message', text: 'oi', buttons: [{ title: 'b', url: 'site.com' }] }] } })).toThrow(/https/);
  });
});
