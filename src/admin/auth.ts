import { hmacHex, timingSafeEqual } from '../webhook';

const COOKIE = 'ac_session';
const MAX_AGE_S = 30 * 24 * 60 * 60;

async function sign(password: string, expires: number) {
  return `${expires}.${await hmacHex(password, `autochat-admin:${expires}`)}`;
}

export async function isLoggedIn(req: Request, password: string | undefined): Promise<boolean> {
  if (!password) return false;
  const cookie = req.headers.get('Cookie') ?? '';
  const raw = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const [exp] = raw.split('.');
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  return timingSafeEqual(raw, await sign(password, expires));
}

export async function loginResponse(req: Request, password: string | undefined): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const given = String(form?.get('password') ?? '');
  if (!password || !timingSafeEqual(given, password)) {
    return new Response(null, { status: 303, headers: { Location: '/login?erro=1' } });
  }
  const expires = Date.now() + MAX_AGE_S * 1000;
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/',
      'Set-Cookie': `${COOKIE}=${await sign(password, expires)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_S}`,
    },
  });
}

export function logoutResponse(): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: '/login', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` },
  });
}
