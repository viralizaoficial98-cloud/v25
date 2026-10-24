import type { OrderStatus } from './types';

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'neutral' | 'warn' | 'info' | 'ok' | 'bad'; help: string }> = {
  iniciada: { label: 'Inscrição iniciada', tone: 'neutral', help: 'Lugar reservado. Avance para o pagamento dentro do prazo.' },
  aguardando_pagamento: { label: 'Aguardando pagamento', tone: 'warn', help: 'Faça a transferência e carregue o comprovativo.' },
  comprovativo_enviado: { label: 'Comprovativo enviado', tone: 'info', help: 'Recebemos o comprovativo. Aguarda análise da equipa financeira.' },
  em_analise: { label: 'Em análise', tone: 'info', help: 'A equipa financeira está a confirmar o pagamento no banco.' },
  aprovado: { label: 'Pagamento aprovado', tone: 'ok', help: 'Pagamento confirmado. Os ingressos estão a ser emitidos.' },
  rejeitado: { label: 'Pagamento rejeitado', tone: 'bad', help: 'O comprovativo não foi validado. Veja o motivo e envie um novo.' },
  cancelado: { label: 'Cancelado', tone: 'bad', help: 'Este pedido foi cancelado.' },
  emitido: { label: 'Ingresso emitido', tone: 'ok', help: 'Os seus ingressos digitais estão disponíveis.' },
};

export const TONE_CLASSES: Record<string, string> = {
  neutral: 'bg-white/5 text-cream/80 ring-white/15',
  warn: 'bg-amber-500/10 text-amber-200 ring-amber-400/30',
  info: 'bg-sky-500/10 text-sky-200 ring-sky-400/30',
  ok: 'bg-emerald-500/10 text-emerald-200 ring-emerald-400/30',
  bad: 'bg-rose-500/10 text-rose-200 ring-rose-400/30',
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
