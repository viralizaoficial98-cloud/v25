import { api, MEDIA_BASE } from './http';
import { downloadBlob } from './csv';
import { DEFAULT_SETTINGS } from './config';
import type { CreateOrderResult, CustomerOrder, EventSettings, Faq, MediaItem, Member, PublicTicketType, TimelineEntry } from './types';

export async function fetchSettings(): Promise<EventSettings> {
  const data = await api<Partial<EventSettings>>('/public/settings');
  return { ...DEFAULT_SETTINGS, ...data };
}

export const fetchTicketTypes = () => api<PublicTicketType[]>('/public/ticket-types');
export const fetchTimeline = () => api<TimelineEntry[]>('/public/timeline');
export const fetchMembers = () => api<Member[]>('/public/members');
export const fetchFaqs = () => api<Faq[]>('/public/faqs');

/** Paginação inclusiva (from..to), como antes. */
export function fetchMedia(section: MediaItem['section'], from = 0, to = 11): Promise<MediaItem[]> {
  return api<MediaItem[]>(`/public/media?section=${section}&offset=${from}&limit=${to - from + 1}`);
}

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${MEDIA_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export interface CreateOrderInput {
  ticketTypeId: string;
  quantity: number;
  guestsTotal: number;
  fullName: string;
  email: string;
  phone: string;
  consentVersion: string;
  idempotencyKey: string;
  mode: 'compra' | 'reserva';
  honeypot: string;
}

export function createOrder(i: CreateOrderInput) {
  return api<CreateOrderResult>('/public/orders', {
    json: {
      ticket_type_id: i.ticketTypeId,
      quantity: i.quantity,
      guests_total: i.guestsTotal,
      full_name: i.fullName,
      email: i.email,
      phone: i.phone,
      consent: true,
      consent_version: i.consentVersion,
      idempotency_key: i.idempotencyKey,
      mode: i.mode,
      website: i.honeypot,
    },
  });
}

// O token de acesso vai num cabeçalho (não fica em URLs nem em registos do servidor)
const tokenHeader = (token: string) => ({ 'X-Order-Token': token });
const orderPath = (code: string) => `/public/orders/${encodeURIComponent(code)}`;

export const getOrder = (code: string, token: string) => api<CustomerOrder>(orderPath(code), { headers: tokenHeader(token) });
export const confirmReservation = (code: string, token: string) => api(`${orderPath(code)}/confirm`, { method: 'POST', headers: tokenHeader(token) });
export const cancelOrder = (code: string, token: string) => api(`${orderPath(code)}/cancel`, { method: 'POST', headers: tokenHeader(token) });
export const requestOrderAccess = (email: string) => api('/public/access-request', { json: { email } });

/** Envio do comprovativo (multipart). Validação de tipo/tamanho repetida no servidor. */
export function uploadProof(code: string, token: string, file: File) {
  const form = new FormData();
  form.append('file', file, file.name);
  return api<{ status: string }>(`${orderPath(code)}/proofs`, { form, headers: tokenHeader(token) });
}

/** PDF dos ingressos gerado pelo servidor (o mesmo que segue em anexo no email). */
export async function downloadTicketsPdf(code: string, token: string) {
  const blob = await api<Blob>(`${orderPath(code)}/tickets.pdf`, { headers: tokenHeader(token), blob: true });
  downloadBlob(blob, `V25-ingressos-${code}.pdf`, 'application/pdf');
}
