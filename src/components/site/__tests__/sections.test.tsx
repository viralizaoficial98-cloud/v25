import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Tickets } from '../Tickets';
import { EventInfo } from '../EventInfo';
import { Countdown } from '../Countdown';
import { SettingsProvider } from '@/hooks/useSettings';
import { DEFAULT_SETTINGS } from '@/lib/config';

/** Simula a API PHP: GET /api/public/settings e /api/public/ticket-types. */
function mockApi(settings: Partial<typeof DEFAULT_SETTINGS>, ticketTypes: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.endsWith('/public/settings') ? { ...DEFAULT_SETTINGS, ...settings }
      : url.endsWith('/public/ticket-types') ? ticketTypes
      : url.endsWith('/public/orders/quote') ? { ticket_type_id: TYPE.id, name: 'Normal', quantity: 1, unit_price_kz: 15000, total_kz: 15000, available: 8, max_per_order: 4, persons_per_ticket: 1 }
      : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}

const TYPE = {
  id: '8b7c6a1e-1111-4a2b-9c3d-123456789abc', name: 'Normal', lot_label: '1.º Lote', description: '', price_kz: 15000,
  available: 8, quantity_total: 10, max_per_order: 4, max_per_customer: 6, persons_per_ticket: 1, on_sale: true, sales_start: null, sales_end: null,
  sale_mode: 'directo', benefits: ['Acesso ao evento'], badge: '', stock_defined: true, sales_status: 'abertas',
};
const VIP = {
  ...TYPE, id: '8b7c6a1e-2222-4a2b-9c3d-123456789abc', name: 'VIP', price_kz: null, sale_mode: 'consulta', on_sale: false,
  available: 0, quantity_total: 0, stock_defined: false, badge: 'Por consulta', benefits: ['Lugar reservado'],
};

afterEach(() => vi.unstubAllGlobals());

describe('secção de ingressos (dados da API)', () => {
  it('vendas fechadas: mostra A AGUARDAR ABERTURA DAS VENDAS e nenhum botão de compra', async () => {
    mockApi({ sales_open: false }, []);
    render(<SettingsProvider><MemoryRouter><Tickets /></MemoryRouter></SettingsProvider>);
    expect(await screen.findByText('A AGUARDAR ABERTURA DAS VENDAS')).toBeInTheDocument();
    expect(screen.queryByText(/comprar bilhete/i)).not.toBeInTheDocument();
  });

  it('vendas abertas: mostra preço em Kz, benefícios, disponibilidade e botão de compra', async () => {
    mockApi({ sales_open: true }, [TYPE]);
    render(<SettingsProvider><MemoryRouter><Tickets /></MemoryRouter></SettingsProvider>);
    expect(await screen.findByText('15 000 Kz')).toBeInTheDocument();
    expect(screen.getByText('8 de 10 disponíveis')).toBeInTheDocument();
    expect(screen.getByText('Acesso ao evento')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /comprar bilhete/i })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('VIP por consulta: sem preço público, sem compra directa, botão SOLICITAR ACESSO VIP', async () => {
    mockApi({ sales_open: true }, [TYPE, VIP]);
    render(<SettingsProvider><MemoryRouter><Tickets /></MemoryRouter></SettingsProvider>);
    expect(await screen.findByText('Por consulta', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /comprar bilhete/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /solicitar acesso vip/i })).toBeInTheDocument();
    expect(screen.getByText(/depende da aprovação da organização/i)).toBeInTheDocument();
  });

  it('stock ainda não definido: “Disponibilidade a anunciar” sem botão de compra', async () => {
    mockApi({ sales_open: true }, [{ ...TYPE, stock_defined: false, available: 0, quantity_total: 0, on_sale: false }]);
    render(<SettingsProvider><MemoryRouter><Tickets /></MemoryRouter></SettingsProvider>);
    expect(await screen.findAllByText('Disponibilidade a anunciar')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /comprar bilhete/i })).not.toBeInTheDocument();
  });

  it('vendas abertas mas quantidade por definir: nunca mostra botão de compra', async () => {
    mockApi({ sales_open: true }, [{ ...TYPE, stock_defined: false, available: 0, quantity_total: 0, on_sale: true }]);
    render(<SettingsProvider><MemoryRouter><Tickets /></MemoryRouter></SettingsProvider>);
    expect(await screen.findAllByText('Disponibilidade a anunciar')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /comprar bilhete/i })).not.toBeInTheDocument();
  });

  it('esgotado: botão desactivado “Esgotado”', async () => {
    mockApi({ sales_open: true }, [{ ...TYPE, available: 0, on_sale: false }]);
    render(<SettingsProvider><MemoryRouter><Tickets /></MemoryRouter></SettingsProvider>);
    expect(await screen.findAllByText('Esgotado')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /comprar bilhete/i })).not.toBeInTheDocument();
  });

  it('COMPRAR BILHETE abre o popup com a categoria seleccionada e o total calculado pelo servidor', async () => {
    mockApi({ sales_open: true, payment_ready: true }, [TYPE]);
    render(<SettingsProvider><MemoryRouter><Tickets /></MemoryRouter></SettingsProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /comprar bilhete/i }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 4000 });
    expect(await within(dialog).findByRole('radio', { name: /Normal/ })).toHaveAttribute('aria-checked', 'true');
    const calls = () => (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => String(c[0]));
    await waitFor(() => expect(calls().some((u) => u.endsWith('/public/orders/quote'))).toBe(true));
    // Total só depois da resposta do servidor (botão “Continuar” activo)
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /continuar/i })).toBeEnabled());
    expect(within(dialog).getAllByText('15 000 Kz').length).toBeGreaterThan(1);
  });

  it('vendas suspensas e esgotada (estado definido no painel): mensagens verdadeiras, sem compra', async () => {
    mockApi({ sales_open: true }, [
      { ...TYPE, sales_status: 'suspensas', on_sale: false },
      { ...TYPE, id: '8b7c6a1e-3333-4a2b-9c3d-123456789abc', name: 'Premium', sales_status: 'esgotadas', on_sale: false },
    ]);
    render(<SettingsProvider><MemoryRouter><Tickets /></MemoryRouter></SettingsProvider>);
    expect(await screen.findAllByText('Vendas suspensas')).not.toHaveLength(0);
    expect(screen.getAllByText('Esgotado').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /comprar bilhete/i })).not.toBeInTheDocument();
  });

  it('API indisponível: mostra erro em vez de simular dados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    render(<SettingsProvider><MemoryRouter><Tickets /></MemoryRouter></SettingsProvider>);
    expect(await screen.findByText(/Não foi possível carregar os ingressos/)).toBeInTheDocument();
  });
});

describe('outras secções', () => {
  it('informações do evento com data, hora, local e link para o Google Maps', () => {
    render(<EventInfo />);
    expect(screen.getByText('20 de Dezembro de 2026')).toBeInTheDocument();
    expect(screen.getByText('16h00')).toBeInTheDocument();
    expect(screen.getByText('Hotel Brisa Tropical')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /ver localização/i });
    expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/search\//);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
  it('contagem regressiva acessível', () => {
    render(<Countdown target="2099-01-01T00:00:00+01:00" />);
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });
});
