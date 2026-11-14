import { describe, expect, it } from 'vitest';
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
    expect(c).toMatchObject({ token: 'TOK', accountId: '178', username: 'terravo', subscribeWarning: null });
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
    expect(c.subscribeWarning).toMatch(/rota inesperada/);
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
