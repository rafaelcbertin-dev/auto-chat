import { handleApi } from './admin/api';
import { isLoggedIn, loginResponse, logoutResponse } from './admin/auth';
import { appPage, loginPage } from './admin/ui';
import { MetaSender } from './channels/meta';
import { D1Store } from './db';
import { Engine } from './engine';
import { parseWebhook, timingSafeEqual, verifySignature } from './webhook';

export interface Env {
  DB: D1Database;
  GRAPH_API_VERSION?: string;
  ADMIN_PASSWORD?: string;
  META_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  IG_APP_SECRET?: string;
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

function sender(env: Env) {
  return new MetaSender({
    version: env.GRAPH_API_VERSION || 'v21.0',
    igToken: env.IG_ACCESS_TOKEN,
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
  if (!ok) return new Response('Invalid signature', { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const events = parseWebhook(body);
  if (events.length) {
    const engine = new Engine(new D1Store(env.DB), sender(env));
    // Responde 200 na hora (a Meta exige resposta rápida) e processa em segundo plano
    ctx.waitUntil(
      (async () => {
        for (const ev of events) {
          try {
            await engine.handle(ev);
          } catch (e) {
            console.error('erro ao processar evento', ev.eventId, e);
          }
        }
      })(),
    );
  }
  return new Response('EVENT_RECEIVED', { status: 200 });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === '/webhook') return handleWebhook(req, env, ctx);
    if (p === '/health') return new Response('ok');

    if (p === '/login') {
      if (req.method === 'POST') return loginResponse(req, env.ADMIN_PASSWORD);
      return html(loginPage(!env.ADMIN_PASSWORD, url.searchParams.has('erro')));
    }
    if (p === '/logout') return logoutResponse();

    if (!(await isLoggedIn(req, env.ADMIN_PASSWORD))) {
      if (p.startsWith('/api/')) return Response.json({ error: 'Não autenticado' }, { status: 401 });
      return new Response(null, { status: 303, headers: { Location: '/login' } });
    }

    if (p.startsWith('/api/')) return handleApi(req, url, new D1Store(env.DB), sender(env));
    if (p === '/' || p === '/index.html') return html(appPage());
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_ev: ScheduledController, env: Env): Promise<void> {
    await new D1Store(env.DB).cleanup();
  },
} satisfies ExportedHandler<Env>;
