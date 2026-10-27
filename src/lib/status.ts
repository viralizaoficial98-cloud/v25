import type { OrderStatus } from './types';

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'neutral' | 'warn' | 'info' | 'ok' | 'bad'; help: string }> = {
  iniciada: { label: 'Inscrição iniciada', tone: 'neutral', help: 'Lugar reservado. Avance para o pagamento dentro do prazo.' },
  aguardando_pagamento: { label: 'Aguardando pagamento', tone: 'warn', help: 'Faça a transferência e carregue o comprovativo.' },
  comprovativo_enviado: { label: 'A aguardar confirmação de pagamento', tone: 'info', help: 'Recebemos o comprovativo. A equipa financeira vai confirmar manualmente a entrada do valor.' },
  em_analise: { label: 'Em análise', tone: 'info', help: 'A equipa financeira está a confirmar o pagamento no banco.' },
  aprovado: { label: 'Pagamento aprovado', tone: 'ok', help: 'Pagamento confirmado. Os ingressos estão a ser emitidos.' },
  rejeitado: { label: 'Pagamento rejeitado', tone: 'bad', help: 'O comprovativo não foi validado. Veja o motivo e envie um novo.' },
  cancelado: { label: 'Cancelado', tone: 'bad', help: 'Este pedido foi cancelado.' },
  emitido: { label: 'Ingresso emitido', tone: 'ok', help: 'Os seus ingressos digitais estão disponíveis.' },
};

export const TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-fg/[0.04] text-fg/80 ring-fg/15',
  warn: 'bg-amber-50 text-amber-900 ring-amber-300',
  info: 'bg-sky-50 text-sky-900 ring-sky-300',
  ok: 'bg-emerald-50 text-emerald-900 ring-emerald-300',
  bad: 'bg-rose-50 text-rose-900 ring-rose-300',
};
/** Passos visíveis ao cliente (ordem do fluxo feliz). */
export const CUSTOMER_STEPS: { key: OrderStatus[]; label: string }[] = [
  { key: ['iniciada', 'aguardando_pagamento'], label: 'Pedido criado' },
  { key: ['comprovativo_enviado'], label: 'Comprovativo enviado' },
  { key: ['em_analise'], label: 'Em análise' },
  { key: ['aprovado'], label: 'Pagamento aprovado' },
  { key: ['emitido'], label: 'Ingresso emitido' },
];

export function stepIndex(status: OrderStatus): number {
  const order: OrderStatus[] = ['iniciada', 'aguardando_pagamento', 'comprovativo_enviado', 'em_analise', 'aprovado', 'emitido'];
  const i = order.indexOf(status);
  if (i <= 1) return 0;
  return i - 1;
}
