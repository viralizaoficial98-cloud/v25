import { formatDateTime } from './format';
import type { PublicTicketType } from './types';

export interface TicketState {
  /** Botão “Comprar bilhete” activo */
  canBuy: boolean;
  /** Texto do botão desactivado (verdadeiro e coerente com a configuração) */
  label: string;
  /** Tom da disponibilidade no cartão */
  tone: 'ok' | 'low' | 'bad' | 'neutral';
}

/**
 * Estado de venda de uma categoria directa (Normal/Premium) no site. O servidor decide
 * (`on_sale`); aqui só se escolhe a mensagem correcta para cada motivo de bloqueio.
 */
export function ticketState(t: PublicTicketType, salesOpen: boolean, now = Date.now()): TicketState {
  const available = Math.max(0, t.available);
  if (!t.stock_defined) return { canBuy: false, label: 'Disponibilidade a anunciar', tone: 'neutral' };
  if (t.sales_status === 'esgotadas' || available <= 0) return { canBuy: false, label: 'Esgotado', tone: 'bad' };
  if (t.sales_status === 'suspensas') return { canBuy: false, label: 'Vendas suspensas', tone: 'neutral' };
  if (t.sales_end && new Date(t.sales_end).getTime() <= now) return { canBuy: false, label: 'Vendas encerradas', tone: 'neutral' };
  if (t.sales_start && new Date(t.sales_start).getTime() > now) return { canBuy: false, label: `Vendas a partir de ${formatDateTime(t.sales_start)}`, tone: 'neutral' };
  if (!salesOpen || !t.on_sale) return { canBuy: false, label: 'Vendas brevemente', tone: 'neutral' };
  const low = t.quantity_total > 0 && available / t.quantity_total <= 0.15;
  return { canBuy: true, label: '', tone: low ? 'low' : 'ok' };
}
