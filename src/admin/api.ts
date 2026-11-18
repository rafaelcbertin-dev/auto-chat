import type { D1Store } from '../db';
import type { Automation, Channel, Flow, FlowNode, Sender } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export class ValidationError extends Error {}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

export function validateFlow(raw: any): Flow {
  if (!raw || !Array.isArray(raw.nodes) || !raw.nodes.length) throw new ValidationError('O fluxo precisa de pelo menos um passo');
  const ids = new Set<string>();
  const nodes: FlowNode[] = raw.nodes.map((n: any, i: number) => {
    const id = String(n?.id ?? '').trim();
    if (!id) throw new ValidationError(`Passo ${i + 1} sem id`);
    if (ids.has(id)) throw new ValidationError(`Id de passo repetido: ${id}`);
    ids.add(id);
    const next = n.next ? String(n.next) : undefined;
    if (n.type === 'message') {
      if (!String(n.text ?? '').trim()) throw new ValidationError(`Passo "${id}": texto vazio`);
      const buttons = Array.isArray(n.buttons)
        ? n.buttons
            .map((b: any) => {
              const title = String(b?.title ?? '').trim();
              const url = String(b?.url ?? '').trim();
              if (url) {
                if (!/^https?:\/\/\S+$/i.test(url.replace(/\{\{\s*[\w.]+\s*\}\}/g, 'x'))) {
                  throw new ValidationError(`Passo "${id}": o link do botão "${title}" precisa começar com https://`);
                }
                return { title, url };
              }
              return { title, next: b?.next ? String(b.next) : undefined };
            })
            .filter((b: any) => b.title)
        : [];
      return { id, type: 'message', text: String(n.text), buttons, next };
    }
    if (n.type === 'question') {
      if (!String(n.text ?? '').trim()) throw new ValidationError(`Passo "${id}": pergunta vazia`);
      const saveTo = String(n.saveTo ?? '').trim();
      if (!/^[\w]+$/.test(saveTo)) throw new ValidationError(`Passo "${id}": campo para salvar inválido (use letras, números e _)`);
      const validate = ['email', 'phone'].includes(n.validate) ? n.validate : 'none';
      return { id, type: 'question', text: String(n.text), saveTo, validate, retryText: n.retryText ? String(n.retryText) : undefined, next };
    }
    if (n.type === 'tag') {
      return { id, type: 'tag', add: strList(n.add), remove: strList(n.remove), next };
    }
    throw new ValidationError(`Passo "${id}": tipo desconhecido`);
  });
  const refs = (n: FlowNode) => [n.next, ...(n.type === 'message' ? (n.buttons ?? []).map((b) => b.next) : [])];
  for (const n of nodes) {
    for (const r of refs(n)) if (r && !ids.has(r)) throw new ValidationError(`Passo "${n.id}" aponta para "${r}", que não existe`);
  }
  const start = raw.start && ids.has(String(raw.start)) ? String(raw.start) : nodes[0].id;
  return { start, nodes };
}

export function validateAutomation(raw: any): Omit<Automation, 'id'> {
  const name = String(raw?.name ?? '').trim();
  if (!name) throw new ValidationError('Dê um nome à automação');
  const channel: Channel = raw.channel === 'whatsapp' ? 'whatsapp' : 'instagram';
  const trigger = raw.trigger === 'comment' ? 'comment' : 'keyword';
  if (trigger === 'comment' && channel !== 'instagram') throw new ValidationError('Gatilho de comentário só existe no Instagram');
  const matchMode = ['contains', 'exact', 'any'].includes(raw.matchMode) ? raw.matchMode : 'contains';
  const keywords = strList(raw.keywords);
  if (matchMode !== 'any' && !keywords.length) throw new ValidationError('Informe ao menos uma palavra-chave (ou use "qualquer mensagem")');
  return {
    name,
    enabled: raw.enabled !== false,
    channel,
    trigger,
    keywords,
    matchMode,
    mediaId: trigger === 'comment' && raw.mediaId ? String(raw.mediaId).trim() : null,
    publicReplies: trigger === 'comment' ? strList(raw.publicReplies) : [],
    oncePerContact: !!raw.oncePerContact,
    flow: validateFlow(raw.flow),
    accountId: validateAccountId(channel === 'instagram' ? raw.accountId : null),
  };
}

/** ID da conta profissional do Instagram (só dígitos) ou null = todas as contas. */
export function validateAccountId(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{1,30}$/.test(s)) throw new ValidationError('Conta do Instagram inválida');
  return s;
}

export async function handleApi(
  req: Request,
  url: URL,
  store: D1Store,
  senderFor: (accountId?: string | null) => Promise<Sender>,
): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, '');
  const m = req.method;
  try {
    if (path === '/stats' && m === 'GET') return json(await store.stats());
    if (path === '/tags' && m === 'GET') return json(await store.allTags());

    if (path === '/automations' && m === 'GET') return json(await store.allAutomations());
    if (path === '/automations' && m === 'POST') {
      const a = validateAutomation(await req.json());
      return json({ id: await store.saveAutomation(a) }, 201);
    }
    let mm = path.match(/^\/automations\/(\d+)$/);
    if (mm) {
      const id = Number(mm[1]);
      if (m === 'GET') {
        const a = await store.getAutomation(id);
        return a ? json(a) : json({ error: 'Não encontrada' }, 404);
      }
      if (m === 'PUT') {
        if (!(await store.getAutomation(id))) return json({ error: 'Não encontrada' }, 404);
        const a = validateAutomation(await req.json());
        await store.saveAutomation({ ...a, id });
        return json({ id });
      }
      if (m === 'DELETE') {
        await store.deleteAutomation(id);
        return json({ ok: true });
      }
    }

    if (path === '/contacts' && m === 'GET') {
      const p = url.searchParams;
      return json(
        await store.listContacts({
          q: p.get('q') || undefined,
          tag: p.get('tag') || undefined,
          channel: p.get('channel') || undefined,
          account: p.get('account') || undefined,
          offset: Number(p.get('offset') || 0),
        }),
      );
    }
    mm = path.match(/^\/contacts\/(\d+)(\/tags|\/send)?$/);
    if (mm) {
      const id = Number(mm[1]);
      const contact = await store.getContact(id);
      if (!contact) return json({ error: 'Contato não encontrado' }, 404);
      if (!mm[2] && m === 'GET') return json(contact);
      if (!mm[2] && m === 'DELETE') {
        await store.deleteContact(id);
        return json({ ok: true });
      }
      if (mm[2] === '/tags' && m === 'POST') {
        const body = (await req.json()) as any;
        await store.addTags(id, strList(body.add));
        await store.removeTags(id, strList(body.remove));
        return json({ ok: true });
      }
      if (mm[2] === '/send' && m === 'POST') {
        const body = (await req.json()) as any;
        const text = String(body.text ?? '').trim();
        if (!text) return json({ error: 'Mensagem vazia' }, 400);
        if (!contact.lastInboundAt || Date.now() - contact.lastInboundAt > 24 * 60 * 60 * 1000) {
          return json({ error: 'Fora da janela de 24h: a Meta só permite responder até 24h após a última mensagem da pessoa.' }, 400);
        }
        try {
          // Responde pela conta com que a pessoa falou por último
          const sender = await senderFor(contact.channel === 'instagram' ? contact.accountId : null);
          await sender.send(contact.channel, { userId: contact.externalId }, { text });
          await store.logMessage(id, 'out', text, { manual: true });
        } catch (e) {
          await store.logMessage(id, 'error', `Falha ao enviar: ${String(e)}`);
          return json({ error: String(e) }, 502);
        }
        return json({ ok: true });
      }
    }
    return json({ error: 'Rota não encontrada' }, 404);
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message }, 400);
    if (e instanceof SyntaxError) return json({ error: 'JSON inválido' }, 400);
    throw e;
  }
}
