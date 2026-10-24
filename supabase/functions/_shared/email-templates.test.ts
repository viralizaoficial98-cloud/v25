import { describe, expect, it } from 'vitest';
import { renderEmail, type EmailContext, type TemplateName } from './email-templates';

const ctx: EmailContext = {
  order_code: 'V25-ABC234',
  full_name: 'Maria <script>Silva',
  quantity: 2,
  guests_total: 2,
  total_kz: 30000,
  ticket_type: 'Normal',
  event: { name: 'V25 — O LEGADO', starts_at: '2026-12-20T16:00:00+01:00', venue: 'Hotel Brisa Tropical', address: 'Morro Bento, Luanda, Angola', maps_url: 'https://maps' },
  payment: { account_name: '27 LUAS', account_number: '140065995 10 001', iban: 'AO06004000004006599510166', express_number: '920000000' },
  tickets: [{ ticket_code: 'T-ABCDEFGH', seq: 1, qr_cid: 'qr-1' }],
  link: 'https://v25.example/pedido/V25-ABC234#t=x',
  motivo: 'Valor não identificado',
};

describe('templates de email', () => {
  const all: TemplateName[] = ['pedido_criado', 'comprovativo_recebido', 'pagamento_aprovado', 'pagamento_rejeitado', 'ingresso_disponivel', 'lembrete_evento', 'acesso_pedido', 'pedido_cancelado', 'teste_smtp'];
  it.each(all)('%s gera assunto, HTML e texto', (t) => {
    const m = renderEmail(t, ctx);
    expect(m.subject.length).toBeGreaterThan(5);
    expect(m.html).toContain('V25');
    expect(m.text.length).toBeGreaterThan(5);
    expect(m.html).not.toContain('<script>');
  });
  it('pedido criado inclui IBAN, valor e aviso de que comprovativo não confirma pagamento', () => {
    const m = renderEmail('pedido_criado', ctx);
    expect(m.html).toContain('AO06004000004006599510166');
    expect(m.html).toContain('30 000 Kz');
    expect(m.html).toMatch(/não confirma o pagamento/);
  });
  it('rejeição mostra o motivo; ingresso inclui QR', () => {
    expect(renderEmail('pagamento_rejeitado', ctx).html).toContain('Valor não identificado');
    expect(renderEmail('ingresso_disponivel', ctx).html).toContain('cid:qr-1');
  });
});
