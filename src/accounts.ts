import type { InstagramConnection } from './oauth';

/** Onde as contas ficam no D1 (tabela settings). */
export const ACCOUNTS_KEY = 'instagram_accounts';
/** Chave antiga, de quando só existia uma conta (a migração 0003 a converte). */
export const LEGACY_KEY = 'instagram_connection';

export interface SettingsStore {
  getSetting<T>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown): Promise<void>;
  deleteSetting(key: string): Promise<void>;
}

/** Todas as contas conectadas, na ordem em que foram conectadas. */
export async function getAccounts(store: SettingsStore): Promise<InstagramConnection[]> {
  const list = await store.getSetting<InstagramConnection[]>(ACCOUNTS_KEY);
  if (Array.isArray(list)) return list.filter((a) => a && a.accountId && a.token);
  const legacy = await store.getSetting<InstagramConnection>(LEGACY_KEY);
  return legacy?.accountId ? [legacy] : [];
}

/** Junta as contas novas às existentes: a mesma conta é atualizada (token novo), as outras continuam. */
export function mergeAccounts(current: InstagramConnection[], added: InstagramConnection[]): InstagramConnection[] {
  const out = [...current];
  for (const a of added) {
    const i = out.findIndex((x) => x.accountId === a.accountId);
    if (i >= 0) out[i] = a;
    else out.push(a);
  }
  return out;
}

export async function saveAccounts(store: SettingsStore, list: InstagramConnection[]) {
  if (list.length) await store.setSetting(ACCOUNTS_KEY, list);
  else await store.deleteSetting(ACCOUNTS_KEY);
  await store.deleteSetting(LEGACY_KEY);
}

/** Conta pelo ID; sem ID, a primeira. Um ID que não está conectado não cai em outra conta. */
export function pickAccount(list: InstagramConnection[], accountId?: string | null): InstagramConnection | undefined {
  return accountId ? list.find((a) => a.accountId === accountId) : list[0];
}

/** O que o painel pode ver (sem o token). */
export const publicAccount = (a: InstagramConnection) => ({
  accountId: a.accountId,
  username: a.username,
  connectedAt: a.connectedAt,
  subscribeWarning: a.subscribeWarning ?? null,
});
