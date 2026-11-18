import { describe, expect, it } from 'vitest';
import { getAccounts, LEGACY_KEY, mergeAccounts, pickAccount, publicAccount, saveAccounts } from '../src/accounts';
import { MetaSender } from '../src/channels/meta';
import { buildLoginUrl, checkState, completeConnection, makeState } from '../src/oauth';

type Call = { url: string; init?: RequestInit };
function fakeFetch(routes: Record<string, unknown>, calls: Call[]) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const body = key ? routes[key] : { error: { message: 'rota inesperada ' + url } };
    const isErr = typeof body === 'object' && body !== null && 'error' in body;
    return new Response(JSON.stringify(body), { status: isErr ? 400 : 200 });
  }) as typeof fetch;
}

describe('login unificado', () => {
  it('monta a URL do diálogo com config_id', () => {
    const u = new URL(buildLoginUrl('APP', 'CFG', 'https://x.dev/', 'st'));
    expect(u.origin + u.pathname).toBe('https://www.facebook.com/dialog/oauth');
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: 'APP', config_id: 'CFG', redirect_uri: 'https://x.dev/', response_type: 'code', state: 'st' });
  });

  it('state assinado expira e não aceita outro segredo', async () => {
    const st = await makeState('senha', 1_000_000);
    expect(await checkState('senha', st, 1_000_000 + 60_000)).toBe(true);
    expect(await checkState('outra', st, 1_000_000 + 60_000)).toBe(false);
    expect(await checkState('senha', st, 1_000_000 + 11 * 60_000)).toBe(false);
    expect(await checkState('senha', null)).toBe(false);
  });

  it('troca o código, acha a conta e inscreve nos webhooks', async () => {
    const calls: Call[] = [];
    const f = fakeFetch(
      {
        '/oauth/access_token': { access_token: 'TOK' },
        '/me/assigned_instagram_accounts': { data: [{ id: '178', username: 'terravo' }] },
        '/178/subscribed_apps': { success: true },
      },
      calls,
    );
    const c = await completeConnection({ code: 'C', appId: 'A', appSecret: 'S', redirectUri: 'https://x.dev/', version: 'v26.0', fetch: f });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ token: 'TOK', accountId: '178', username: 'terravo', subscribeWarning: null });
    expect(calls[0].url).toContain('graph.facebook.com/v26.0/oauth/access_token');
    expect(calls[0].url).toContain('client_secret=S');
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer TOK');
    expect(JSON.parse(String(calls[2].init?.body)).subscribed_fields).toContain('messages');
  });

  it('erro claro quando nenhuma conta foi compartilhada', async () => {
    const f = fakeFetch({ '/oauth/access_token': { access_token: 'T' }, '/me/assigned_instagram_accounts': { data: [] } }, []);
    await expect(completeConnection({ code: 'C', appId: 'A', appSecret: 'S', redirectUri: 'r', version: 'v26.0', fetch: f })).rejects.toThrow(/Nenhuma conta/);
  });

  it('se a inscrição falhar, a conexão continua com aviso', async () => {
    const f = fakeFetch({ '/oauth/access_token': { access_token: 'T' }, '/me/assigned_instagram_accounts': { data: [{ id: '1' }] } }, []);
    const c = await completeConnection({ code: 'C', appId: 'A', appSecret: 'S', redirectUri: 'r', version: 'v26.0', fetch: f });
    expect(c[0].subscribeWarning).toMatch(/rota inesperada/);
  });

  it('duas contas compartilhadas de uma vez: as duas entram e são inscritas', async () => {
    const calls: Call[] = [];
    const f = fakeFetch(
      {
        '/oauth/access_token': { access_token: 'TOK' },
        '/me/assigned_instagram_accounts': { data: [{ id: '178', username: 'terravoorigem' }, { id: '299', username: 'ampliar' }] },
        '/178/subscribed_apps': { success: true },
        '/299/subscribed_apps': { success: true },
      },
      calls,
    );
    const c = await completeConnection({ code: 'C', appId: 'A', appSecret: 'S', redirectUri: 'r', version: 'v26.0', fetch: f });
    expect(c.map((x) => x.username)).toEqual(['terravoorigem', 'ampliar']);
    expect(calls.filter((x) => x.url.includes('subscribed_apps')).map((x) => x.url.split('/')[4])).toEqual(['178', '299']);
  });
});

describe('várias contas', () => {
  const conn = (accountId: string, username: string, token = 'T' + accountId) => ({ token, accountId, username, connectedAt: 1 });

  it('conectar outra conta mantém as existentes; reconectar a mesma troca só o token dela', () => {
    const a = mergeAccounts([conn('178', 'terravoorigem')], [conn('299', 'ampliar')]);
    expect(a.map((x) => x.accountId)).toEqual(['178', '299']);
    const b = mergeAccounts(a, [conn('178', 'terravoorigem', 'NOVO')]);
    expect(b.map((x) => x.token)).toEqual(['NOVO', 'T299']);
  });

  it('escolhe a conta pelo ID e nunca cai em outra conta', () => {
    const list = [conn('178', 'terravoorigem'), conn('299', 'ampliar')];
    expect(pickAccount(list, '299')?.username).toBe('ampliar');
    expect(pickAccount(list)?.username).toBe('terravoorigem');
    expect(pickAccount(list, '555')).toBeUndefined();
  });

  it('lê a conexão antiga (uma conta só) e a substitui pela lista ao salvar', async () => {
    const data = new Map<string, unknown>([[LEGACY_KEY, conn('178', 'terravoorigem')]]);
    const store = {
      getSetting: async <T>(k: string) => (data.get(k) ?? null) as T | null,
      setSetting: async (k: string, v: unknown) => void data.set(k, v),
      deleteSetting: async (k: string) => void data.delete(k),
    };
    expect((await getAccounts(store)).map((x) => x.accountId)).toEqual(['178']);
    await saveAccounts(store, mergeAccounts(await getAccounts(store), [conn('299', 'ampliar')]));
    expect(data.has(LEGACY_KEY)).toBe(false);
    expect((await getAccounts(store)).map((x) => x.username)).toEqual(['terravoorigem', 'ampliar']);
    expect(publicAccount(conn('1', 'x'))).not.toHaveProperty('token');
  });
});

describe('envio no login unificado', () => {
  it('usa graph.facebook.com/<IG_ID>/messages e resposta privada por comment_id', async () => {
    const calls: Call[] = [];
    const s = new MetaSender({ version: 'v26.0', igToken: 'T', igAccountId: '178', igHost: 'facebook', fetch: fakeFetch({ '/178/messages': { message_id: 'm' }, '/c1/replies': { id: 'r' } }, calls) });
    await s.send('instagram', { commentId: 'c1' }, { text: 'oi' });
    await s.send('instagram', { userId: 'u1' }, { text: 'oi' });
    await s.replyToComment('c1', 'valeu');
    expect(calls.map((c) => c.url)).toEqual([
      'https://graph.facebook.com/v26.0/178/messages',
      'https://graph.facebook.com/v26.0/178/messages',
      'https://graph.facebook.com/v26.0/c1/replies',
    ]);
    expect(JSON.parse(String(calls[0].init?.body)).recipient).toEqual({ comment_id: 'c1' });
  });

  it('token antigo do Instagram continua em graph.instagram.com/me', async () => {
    const calls: Call[] = [];
    const s = new MetaSender({ version: 'v26.0', igToken: 'T', igHost: 'instagram', fetch: fakeFetch({ '/me/messages': {} }, calls) });
    await s.send('instagram', { userId: 'u1' }, { text: 'oi' });
    expect(calls[0].url).toBe('https://graph.instagram.com/v26.0/me/messages');
  });

  it('erro claro sem conexão', async () => {
    const s = new MetaSender({ version: 'v26.0' });
    await expect(s.send('instagram', { userId: 'u' }, { text: 'x' })).rejects.toThrow(/conexão com o Instagram/);
  });
});
