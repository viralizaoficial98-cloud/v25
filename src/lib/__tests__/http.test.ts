import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, setCsrfToken } from '../http';
import { getOrder, uploadProof } from '../api';

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('cliente da API', () => {
  it('envia CSRF em pedidos que alteram dados e não em GET', async () => {
    const f = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', f);
    setCsrfToken('tok-123');
    await api('/admin/dashboard');
    await api('/admin/emails/test', { json: { to: 'a@b.ao' } });
    const [, getInit] = f.mock.calls[0] as unknown as [string, RequestInit];
    const [url, postInit] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect((getInit.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined();
    expect(url).toBe('/api/admin/emails/test');
    expect((postInit.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok-123');
    expect(postInit.credentials).toBe('same-origin');
  });

  it('converte erros da API em códigos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'ESGOTADO' }, 409)));
    await expect(api('/public/orders', { json: {} })).rejects.toMatchObject({ code: 'ESGOTADO', status: 409 });
  });

  it('renova o token CSRF uma vez quando expira', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ error: 'CSRF_INVALIDO' }, 403))
      .mockResolvedValueOnce(json({ csrf_token: 'novo' }))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal('fetch', f);
    await expect(api('/admin/emails/test', { json: {} })).resolves.toEqual({ ok: true });
    expect(((f.mock.calls[2] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['X-CSRF-Token']).toBe('novo');
  });

  it('sem rede: erro SEM_LIGACAO', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(api('/public/settings')).rejects.toBeInstanceOf(ApiError);
  });

  it('token do pedido vai em cabeçalho, nunca no URL', async () => {
    const f = vi.fn(async () => json({}));
    vi.stubGlobal('fetch', f);
    await getOrder('V25-ABC234', 'segredo');
    await uploadProof('V25-ABC234', 'segredo', new File(['%PDF-1.4'], 'c.pdf', { type: 'application/pdf' }));
    for (const [url, init] of f.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).not.toContain('segredo');
      expect((init.headers as Record<string, string>)['X-Order-Token']).toBe('segredo');
    }
    expect((f.mock.calls[1] as unknown as [string, RequestInit])[1].body).toBeInstanceOf(FormData);
  });
});
