import { requireSupabase, supabase } from './supabase';
import type { CreateOrderResult, CustomerOrder, EventSettings, Faq, MediaItem, Member, PublicTicketType, TimelineEntry } from './types';
import { DEFAULT_SETTINGS } from './config';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export async function fetchSettings(): Promise<EventSettings> {
  if (!supabase) return DEFAULT_SETTINGS;
  const { data, error } = await supabase.from('event_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as EventSettings;
}

export async function fetchTicketTypes(): Promise<PublicTicketType[]> {
  if (!supabase) return [];
  const rows = await rpc<PublicTicketType[]>('list_ticket_types');
  return rows.map((r) => ({ ...r, price_kz: r.price_kz === null ? null : Number(r.price_kz) }));
}

export async function fetchTimeline(): Promise<TimelineEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('timeline_entries').select('*').eq('published', true).order('sort_order');
  if (error) throw error;
  return data as TimelineEntry[];
}

export async function fetchMedia(section: MediaItem['section'], from = 0, to = 11): Promise<MediaItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('media_items')
    .select('*')
    .eq('published', true)
    .eq('section', section)
    .order('sort_order')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return data as MediaItem[];
}

export async function fetchMembers(): Promise<Member[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('members').select('*').eq('published', true).order('sort_order');
  if (error) throw error;
  return data as Member[];
}

export async function fetchFaqs(): Promise<Faq[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('faqs').select('*').eq('published', true).order('sort_order');
  if (error) throw error;
  return data as Faq[];
}

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
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
  return rpc<CreateOrderResult>('create_order', {
    p_ticket_type_id: i.ticketTypeId,
    p_quantity: i.quantity,
    p_guests_total: i.guestsTotal,
    p_full_name: i.fullName,
    p_email: i.email,
    p_phone: i.phone,
    p_consent: true,
    p_consent_version: i.consentVersion,
    p_idempotency_key: i.idempotencyKey,
    p_mode: i.mode,
    p_honeypot: i.honeypot || null,
  });
}

export const getOrder = (code: string, token: string) => rpc<CustomerOrder>('get_order', { p_code: code, p_token: token });
export const confirmReservation = (code: string, token: string) => rpc('confirm_reservation', { p_code: code, p_token: token });
export const cancelOrder = (code: string, token: string) => rpc('cancel_order', { p_code: code, p_token: token });
export const requestOrderAccess = (email: string) => rpc('request_order_access', { p_email: email });

/** Envio do comprovativo em 3 passos: reservar slot → upload privado → confirmar. */
export async function uploadProof(code: string, token: string, file: File, mime: string, sha256: string | null) {
  const sb = requireSupabase();
  const slot = await rpc<{ path: string }>('begin_proof_upload', {
    p_code: code,
    p_token: token,
    p_mime: mime,
    p_size: file.size,
    p_sha256: sha256,
  });
  const { error } = await sb.storage.from('proofs').upload(slot.path, file, { contentType: mime, upsert: false });
  if (error) throw error;
  return rpc<{ status: string }>('complete_proof_upload', { p_code: code, p_token: token, p_path: slot.path });
}
