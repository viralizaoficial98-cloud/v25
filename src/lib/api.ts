import { api, MEDIA_BASE } from './http';
import { downloadBlob } from './csv';
import { DEFAULT_SETTINGS } from './config';
import type { CreateOrderResult, CustomerOrder, EventSettings, Faq, GalleryAlbum, GalleryItem, MediaItem, Member, PaymentMethod, PublicTicketType, SiteSection, TimelineEntry, VipCustomerView } from './types';

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

export const setPaymentMethod = (code: string, token: string, method: PaymentMethod) =>
  api<{ payment_method: PaymentMethod }>(`${orderPath(code)}/payment-method`, { json: { method }, headers: tokenHeader(token) });

/** Envio do comprovativo (multipart). Validação de tipo/tamanho repetida no servidor. */
export function uploadProof(code: string, token: string, file: File, method?: PaymentMethod) {
  const form = new FormData();
  form.append('file', file, file.name);
  if (method) form.append('method', method);
  return api<{ status: string }>(`${orderPath(code)}/proofs`, { form, headers: tokenHeader(token) });
}

/** PDF dos ingressos gerado pelo servidor (o mesmo que segue em anexo no email). */
export async function downloadTicketsPdf(code: string, token: string) {
  const blob = await api<Blob>(`${orderPath(code)}/tickets.pdf`, { headers: tokenHeader(token), blob: true });
  downloadBlob(blob, `V25-ingressos-${code}.pdf`, 'application/pdf');
}

// ---------------------------------------------------------------- CMS
/** Conteúdo publicado do site; com preview=true devolve os rascunhos (requer sessão com gestão do site). */
export const fetchSite = (preview = false) => api<{ sections: SiteSection[]; preview: boolean }>(preview ? '/admin/site/preview' : '/public/site');

// ---------------------------------------------------------------- Galeria dos eventos
export function fetchGalleryAlbums(filters: { year?: number | null; category?: string } = {}) {
  const qs = new URLSearchParams();
  if (filters.year) qs.set('year', String(filters.year));
  if (filters.category) qs.set('category', filters.category);
  return api<{ albums: GalleryAlbum[]; years: number[]; categories: string[] }>(`/public/gallery/albums${qs.toString() ? `?${qs}` : ''}`);
}
export const fetchGalleryAlbum = (slug: string, offset = 0, limit = 24) =>
  api<{ album: GalleryAlbum; items: GalleryItem[]; total: number }>(`/public/gallery/albums/${encodeURIComponent(slug)}?offset=${offset}&limit=${limit}`);

// ---------------------------------------------------------------- VIP
export interface VipRequestInput {
  fullName: string;
  email: string;
  phone: string;
  participants: number;
  message: string;
  consentVersion: string;
  honeypot: string;
}
export const createVipRequest = (i: VipRequestInput) =>
  api<{ request_code: string; access_token: string; status: string }>('/public/vip', {
    json: { full_name: i.fullName, email: i.email, phone: i.phone, participants: i.participants, message: i.message, consent: true, consent_version: i.consentVersion, website: i.honeypot },
  });
const vipHeader = (token: string) => ({ 'X-Vip-Token': token });
export const getVip = (code: string, token: string) => api<VipCustomerView>(`/public/vip/${encodeURIComponent(code)}`, { headers: vipHeader(token) });
export const acceptVip = (code: string, token: string) =>
  api<{ order_code: string; access_token: string; total_kz: number }>(`/public/vip/${encodeURIComponent(code)}/accept`, { method: 'POST', headers: vipHeader(token) });
export const declineVip = (code: string, token: string) => api(`/public/vip/${encodeURIComponent(code)}/decline`, { method: 'POST', headers: vipHeader(token) });
