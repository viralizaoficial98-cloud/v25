import { describe, expect, it } from 'vitest';
import { ticketState } from '../ticketState';
import type { PublicTicketType } from '../types';

const T: PublicTicketType = {
  id: 'x', name: 'Normal', lot_label: '', description: '', price_kz: 12500, sale_mode: 'directo', benefits: [], badge: '',
  sales_status: 'abertas', stock_defined: true, available: 50, quantity_total: 100, max_per_order: 4, max_per_customer: 10,
  persons_per_ticket: 1, on_sale: true, sales_start: null, sales_end: null,
};
const now = Date.parse('2026-11-01T12:00:00Z');

describe('estado de venda do cartão', () => {
  it('à venda só quando o servidor autoriza e há stock', () => {
    expect(ticketState(T, true, now)).toMatchObject({ canBuy: true });
    expect(ticketState({ ...T, on_sale: false }, true, now)).toMatchObject({ canBuy: false, label: 'Vendas brevemente' });
    expect(ticketState(T, false, now)).toMatchObject({ canBuy: false, label: 'Vendas brevemente' });
  });
  it('mensagens por motivo', () => {
    expect(ticketState({ ...T, stock_defined: false, quantity_total: 0, available: 0 }, true, now).label).toBe('Disponibilidade a anunciar');
    expect(ticketState({ ...T, available: 0 }, true, now).label).toBe('Esgotado');
    expect(ticketState({ ...T, sales_status: 'esgotadas' }, true, now).label).toBe('Esgotado');
    expect(ticketState({ ...T, sales_status: 'suspensas' }, true, now).label).toBe('Vendas suspensas');
    expect(ticketState({ ...T, sales_end: '2026-10-01T00:00:00Z' }, true, now).label).toBe('Vendas encerradas');
    expect(ticketState({ ...T, sales_start: '2026-12-01T09:00:00Z' }, true, now).label).toMatch(/^Vendas a partir de/);
  });
  it('stock baixo assinalado', () => {
    expect(ticketState({ ...T, available: 10 }, true, now).tone).toBe('low');
  });
});
