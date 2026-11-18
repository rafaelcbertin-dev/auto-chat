import { describe, expect, it } from 'vitest';
import { hasApiKey } from '../src/admin/auth';

const KEY = 'k'.repeat(40);
const req = (auth?: string) => new Request('https://x.dev/api/stats', { headers: auth ? { Authorization: auth } : {} });

describe('chave da API (painel da Revenda)', () => {
  it('aceita só a chave certa no cabeçalho Bearer', () => {
    expect(hasApiKey(req(`Bearer ${KEY}`), KEY)).toBe(true);
    expect(hasApiKey(req(`Bearer ${KEY}x`), KEY)).toBe(false);
    expect(hasApiKey(req(KEY), KEY)).toBe(false);
    expect(hasApiKey(req(), KEY)).toBe(false);
  });

  it('fica desligada sem chave ou com chave curta', () => {
    expect(hasApiKey(req('Bearer '), undefined)).toBe(false);
    expect(hasApiKey(req('Bearer curta'), 'curta')).toBe(false);
  });
});
