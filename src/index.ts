import { handleApi } from './admin/api';
import { hasApiKey, isLoggedIn, loginResponse, logoutResponse } from './admin/auth';
import { appPage, loginPage, messagePage, privacyPage, dataDeletionPage } from './admin/ui';
import { MetaSender } from './channels/meta';
import { D1Store } from './db';
import { Engine } from './engine';
import { getAccounts, mergeAccounts, pickAccount, publicAccount, saveAccounts } from './accounts';
import { buildLoginUrl, checkState, completeConnection, makeState } from './oauth';
import { parseWebhook, timingSafeEqual, verifySignature } from './webhook';

export interface Env {
  DB: D1Database;
  GRAPH_API_VERSION?: string;
  /** ID do app na Meta (público) */
  META_APP_ID?: string;
  /** Identificação da configuração do "login unificado" (público) */
  META_LOGIN_CONFIG_ID?: string;
  ADMIN_PASSWORD?: string;
  /** Chave da API para o painel de Gestão da Revenda (mínimo 32 caracteres) */
  AUTOCHAT_API_KEY?: string;
  META_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  IG_APP_SECRET?: string;
  /** Opcional: token antigo do Instagram Login (apps criados antes do login unificado) */
  IG_ACCESS_TOKEN?: string;
  WA_ACCESS_TOKEN?: string;
  WA_PHONE_NUMBER_ID?: string;
  /** "true" só em desenvolvimento local, para testar webhooks sem assinatura */
  ALLOW_UNSIGNED_WEBHOOKS?: string;
}


const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  });

const version = (env: Env) => env.GRAPH_API_VERSION || 'v26.0';

/** Envio pela conta do Instagram indicada (sem conta: a primeira conectada). */
async function sender(env: Env, store: D1Store, accountId?: string | null) {
  const list = await getAccounts(store);
  const conn = pickAccount(list, accountId);
  // Sem nenhuma conta conectada, vale o token antigo (IG_ACCESS_TOKEN), se existir
  const legacy = !list.length;
  return new MetaSender({
    version: version(env),
    igToken: conn?.token ?? (legacy ? env.IG_ACCESS_TOKEN : undefined),
    igAccountId: conn?.accountId,
    igHost: conn || !legacy ? 'facebook' : 'instagram',
    waToken: env.WA_ACCESS_TOKEN,
    waPhoneNumberId: env.WA_PHONE_NUMBER_ID,
  });
}

async function handleWebhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    // Verificação do webhook pela Meta
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') ?? '';
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    if (mode === 'subscribe' && env.META_VERIFY_TOKEN && timingSafeEqual(token, env.META_VERIFY_TOKEN)) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  const ok = await verifySignature(
    raw,
    req.headers.get('X-Hub-Signature-256'),
    [env.META_APP_SECRET, env.IG_APP_SECRET],
    env.ALLOW_UNSIGNED_WEBHOOKS === 'true',
  );
  if (!ok) {
    console.warn('webhook: assinatura inválida', { len: raw.length, hasHeader: !!req.headers.get('X-Hub-Signature-256') });
    return new Response('Invalid signature', { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const events = parseWebhook(body);
  const b = body as { object?: string; entry?: { id?: string; changes?: { field?: string }[]; messaging?: unknown[] }[] };
  console.log('webhook recebido', {
    object: b?.object,
    entries: b?.entry?.map((e) => ({ id: e.id, fields: e.changes?.map((c) => c.field), messaging: e.messaging?.length ?? 0 })),
    eventos: events.map((e) => `${e.kind}:${e.eventId}`),
  });
  if (events.length) {
    const store = new D1Store(env.DB);
    // Responde 200 na hora (a Meta exige resposta rápida) e processa em segundo plano
    ctx.waitUntil(
      (async () => {
        for (const ev of events) {
          try {
            // Cada evento responde pela conta que o recebeu
            const engine = new Engine(store, await sender(env, store, ev.channel === 'instagram' ? ev.accountId : null));
            await engine.handle(ev);
          } catch (e) {
            console.error('erro ao processar evento', ev.eventId, String(e));
          }
        }
      })(),
    );
  }
  return new Response('EVENT_RECEIVED', { status: 200 });
}

/** Retorno do login da Meta: troca o código pelo token e salva a conexão. */
async function handleOAuthCallback(url: URL, env: Env): Promise<Response> {
  const fail = (msg: string) => html(messagePage('Não foi possível conectar', msg, true), 400);
  if (url.searchParams.get('error')) {
    return fail(url.searchParams.get('error_description') || 'O login foi cancelado.');
  }
  if (!env.ADMIN_PASSWORD || !(await checkState(env.ADMIN_PASSWORD, url.searchParams.get('state')))) {
    return fail('O link de conexão expirou. Volte ao painel e clique em "Conectar Instagram" de novo.');
  }
  if (!env.META_APP_ID || !env.META_APP_SECRET) return fail('Faltam META_APP_ID ou META_APP_SECRET na configuração.');
  try {
    const added = await completeConnection({
      code: url.searchParams.get('code')!,
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      redirectUri: `${url.origin}/`,
      version: version(env),
    });
    // Conectar outra conta não desconecta as que já estão ligadas
    const store = new D1Store(env.DB);
    await saveAccounts(store, mergeAccounts(await getAccounts(store), added));
  } catch (e) {
    return fail(String(e instanceof Error ? e.message : e));
  }
  return new Response(null, { status: 303, headers: { Location: '/#painel' } });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === '/webhook') return handleWebhook(req, env, ctx);
    if (p === '/health') return new Response('ok');
    if (p === '/privacidade') return html(privacyPage(url.origin));
    if (p === '/exclusao-de-dados') return html(dataDeletionPage());

    if (p === '/login') {
      if (req.method === 'POST') return loginResponse(req, env.ADMIN_PASSWORD);
      return html(loginPage(!env.ADMIN_PASSWORD, url.searchParams.has('erro')));
    }
    if (p === '/logout') return logoutResponse();

    // O painel da Revenda usa só a API, com a chave AUTOCHAT_API_KEY
    const viaApiKey = p.startsWith('/api/') && hasApiKey(req, env.AUTOCHAT_API_KEY);
    if (!viaApiKey && !(await isLoggedIn(req, env.ADMIN_PASSWORD))) {
      if (p.startsWith('/api/')) return Response.json({ error: 'Não autenticado' }, { status: 401 });
      return new Response(null, { status: 303, headers: { Location: '/login' } });
    }

    const store = new D1Store(env.DB);

    if (p === '/connect/instagram') {
      if (!env.META_APP_ID || !env.META_LOGIN_CONFIG_ID) {
        return html(messagePage('Configuração incompleta', 'Defina META_APP_ID e META_LOGIN_CONFIG_ID no wrangler.toml e publique de novo.', true), 400);
      }
      const state = await makeState(env.ADMIN_PASSWORD!);
      return Response.redirect(buildLoginUrl(env.META_APP_ID, env.META_LOGIN_CONFIG_ID, `${url.origin}/`, state), 302);
    }
    if (p === '/' && url.searchParams.has('state')) return handleOAuthCallback(url, env);

    if (p === '/api/instagram' && req.method === 'GET') {
      const list = await getAccounts(store);
      const first = list[0];
      return Response.json({
        connected: !!first || !!env.IG_ACCESS_TOKEN,
        accounts: list.map(publicAccount),
        // Campos da primeira conta (compatibilidade com o painel antigo)
        username: first?.username ?? null,
        accountId: first?.accountId ?? null,
        connectedAt: first?.connectedAt ?? null,
        subscribeWarning: first?.subscribeWarning ?? null,
        canConnect: !!(env.META_APP_ID && env.META_LOGIN_CONFIG_ID),
        hasAppSecret: !!(env.META_APP_SECRET || env.IG_APP_SECRET),
        whatsapp: !!(env.WA_ACCESS_TOKEN && env.WA_PHONE_NUMBER_ID),
      });
    }
    if (p === '/api/instagram' && req.method === 'DELETE') {
      // ?account=<id> desconecta só essa conta; sem o parâmetro, só vale com uma conta conectada
      const list = await getAccounts(store);
      const id = url.searchParams.get('account');
      if (!id && list.length > 1) return Response.json({ error: 'Diga qual conta desconectar' }, { status: 400 });
      await saveAccounts(store, id ? list.filter((a) => a.accountId !== id) : []);
      return Response.json({ ok: true });
    }

    if (p.startsWith('/api/')) return handleApi(req, url, store, (accountId) => sender(env, store, accountId));
    if (p === '/' || p === '/index.html') return html(appPage());
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_ev: ScheduledController, env: Env): Promise<void> {
    await new D1Store(env.DB).cleanup();
  },
} satisfies ExportedHandler<Env>;
