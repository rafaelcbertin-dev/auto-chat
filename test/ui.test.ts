import { describe, expect, it } from 'vitest';
import { appPage } from '../src/admin/ui';

describe('painel', () => {
  it('o script da página compila e conhece várias contas', () => {
    const html = appPage();
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
    expect(html).toContain('data-igoff');
    expect(html).toContain('f-account');
  });
});
