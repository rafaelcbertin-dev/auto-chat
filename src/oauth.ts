import { hmacHex, timingSafeEqual } from './webhook';

/*
 * Conexão do Instagram pelo "login unificado" da Meta (Facebook Login for Business
 * com uma configuração de token de usuário do sistema). Apps novos da Meta só
 * oferecem esse caminho. O token resultante não expira e é usado em
 * graph.facebook.com com o ID da conta profissional do Instagram.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

export interface InstagramConnection {
  token: string;
  accountId: string;
  username: string | null;
  connectedAt: number;
  /** Erro ao inscrever a conta nos webhooks (a conexão funciona, mas avisos podem não chegar) */
  subscribeWarning?: string | null;
}

export function buildLoginUrl(appId: string, configId: string, redirectUri: string, state: string): string {
  const u = new URL('https://www.facebook.com/dialog/oauth');
  u.searchParams.set('client_id', appId);
  u.searchParams.set('config_id', configId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('state', state);
  return u.toString();
}

/** state assinado (anti-CSRF), válido por 10 minutos */
export async function makeState(secret: string, now = Date.now()): Promise<string> {
  return `${now}.${await hmacHex(secret, `oauth-state:${now}`)}`;
}

export async function checkState(secret: string, state: string | null, now = Date.now()): Promise<boolean> {
  if (!state) return false;
  const ts = Number(state.split('.')[0]);
  if (!Number.isFinite(ts) || now - ts > STATE_TTL_MS || ts > now + 60_000) return false;
  return timingSafeEqual(state, await makeState(secret, ts));
}

interface GraphError {
  error?: { message?: string; code?: number };
}

async function graph<T>(f: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await f(url, init);
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || body.error) {
    throw new Error(`Meta: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }
  return body;
}

/** Troca o código pelo token, descobre a conta do Instagram e inscreve a conta nos webhooks. */
export async function completeConnection(opts: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  version: string;
  fetch?: typeof fetch;
}): Promise<InstagramConnection> {
  const f = opts.fetch ?? fetch.bind(globalThis);
  const base = `https://graph.facebook.com/${opts.version}`;

  const ex = new URL(`${base}/oauth/access_token`);
  ex.searchParams.set('client_id', opts.appId);
  ex.searchParams.set('client_secret', opts.appSecret);
  ex.searchParams.set('redirect_uri', opts.redirectUri);
  ex.searchParams.set('code', opts.code);
  const { access_token: token } = await graph<{ access_token?: string }>(f, ex.toString());
  if (!token) throw new Error('A Meta não devolveu um token');

  const auth = { Authorization: `Bearer ${token}` };
  const accounts = await graph<{ data?: { id: string; username?: string }[] }>(
    f,
    `${base}/me/assigned_instagram_accounts?fields=id,username`,
    { headers: auth },
  );
  const account = accounts.data?.[0];
  if (!account) throw new Error('Nenhuma conta do Instagram foi compartilhada com o app. Refaça a conexão e selecione a conta.');

  // Inscreve a conta nos webhooks do app. Se a Meta recusar algum campo, tenta o conjunto mínimo.
  let subscribeWarning: string | null = null;
  for (const fields of [['comments', 'messages', 'messaging_postbacks'], ['comments', 'messages']]) {
    try {
      await graph(f, `${base}/${encodeURIComponent(account.id)}/subscribed_apps`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed_fields: fields }),
      });
      subscribeWarning = null;
      break;
    } catch (e) {
      subscribeWarning = String(e instanceof Error ? e.message : e);
    }
  }

  return { token, accountId: String(account.id), username: account.username ?? null, connectedAt: Date.now(), subscribeWarning };
}
