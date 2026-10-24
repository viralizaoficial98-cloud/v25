export type OrderStatus =
  | 'iniciada'
  | 'aguardando_pagamento'
  | 'comprovativo_enviado'
  | 'em_analise'
  | 'aprovado'
  | 'rejeitado'
  | 'cancelado'
  | 'emitido';

export type StaffRole = 'admin' | 'financeiro' | 'checkin';

export interface EventSettings {
  event_name: string;
  subtitle: string;
  slogan: string;
  group_name: string;
  starts_at: string;
  timezone: string;
  venue: string;
  address: string;
  maps_url: string;
  about_text: string;
  closing_message: string;
  sales_open: boolean;
  sales_closed_message: string;
  capacity: number | null;
  reservation_hours: number;
  bank_account_name: string;
  bank_account_number: string;
  bank_iban: string;
  express_number: string;
  payment_instructions: string;
  contact_email: string;
  contact_phone: string;
  socials: Partial<Record<SocialNetwork, string>>;
  copyright_text: string;
  credits_text: string;
  privacy_text: string;
  terms_text: string;
  email_sender_name: string;
  email_reply_to: string;
}

export type SocialNetwork = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'whatsapp' | 'spotify';

export interface PublicTicketType {
  id: string;
  name: string;
  lot_label: string;
  description: string;
  price_kz: number | null;
  available: number;
  quantity_total: number;
  max_per_order: number;
  max_per_customer: number;
  persons_per_ticket: number;
  on_sale: boolean;
  sales_start: string | null;
  sales_end: string | null;
}

export interface TicketTypeRow extends Omit<PublicTicketType, 'available' | 'on_sale'> {
  quantity_reserved: number;
  quantity_sold: number;
  published: boolean;
  sort_order: number;
  created_at: string;
}

export interface CreateOrderResult {
  order_code: string;
  access_token: string;
  total_kz: number;
  status: OrderStatus;
  expires_at: string | null;
  replayed: boolean;
}

export interface OrderTicket {
  ticket_code: string;
  seq: number;
  holder_name: string;
  status: 'valido' | 'utilizado' | 'anulado';
  qr_payload: string;
  checked_in_at: string | null;
}

export interface CustomerOrder {
  order_code: string;
  status: OrderStatus;
  full_name: string;
  email_masked: string;
  phone_masked: string;
  ticket_type: { name: string; lot_label: string; persons_per_ticket: number };
  quantity: number;
  guests_total: number;
  unit_price_kz: number;
  total_kz: number;
  expires_at: string | null;
  rejection_reason: string | null;
  cancel_reason: string | null;
  created_at: string;
  payment: { account_name: string; account_number: string; iban: string; express_number: string; instructions: string };
  history: { status: OrderStatus; at: string }[];
  proofs: { uploaded_at: string; status: 'pendente' | 'aceite' | 'rejeitado'; mime_type: string }[];
  tickets: OrderTicket[];
}

export interface OrderRow {
  id: string;
  order_code: string;
  status: OrderStatus;
  ticket_type_id: string;
  quantity: number;
  guests_total: number;
  unit_price_kz: number;
  total_kz: number;
  full_name: string;
  email: string;
  phone: string;
  consent_at: string;
  consent_version: string;
  expires_at: string | null;
  payment_reference: string | null;
  amount_confirmed_kz: number | null;
  rejection_reason: string | null;
  cancel_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEntry {
  id: string;
  period_label: string;
  title: string;
  description: string;
  image_path: string | null;
  sort_order: number;
  published: boolean;
}

export interface MediaItem {
  id: string;
  kind: 'foto' | 'video' | 'youtube';
  section: 'grupo' | 'memorias';
  title: string;
  caption: string;
  storage_path: string | null;
  youtube_id: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  published: boolean;
}

export interface Member {
  id: string;
  name: string;
  voice: string;
  period_label: string;
  is_current: boolean;
  bio: string;
  photo_path: string | null;
  sort_order: number;
  published: boolean;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  published: boolean;
}

export interface CheckinResult {
  result: 'ok' | 'valido' | 'ja_utilizado' | 'anulado' | 'invalido';
  message?: string;
  ticket_code?: string;
  holder_name?: string;
  seq?: number;
  order_quantity?: number;
  ticket_type?: string;
  persons_per_ticket?: number;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
}
