import type { EventSettings } from './types';

/**
 * Identidade oficial do evento. Usada como valor inicial enquanto a configuração
 * é carregada do Supabase (e quando o backend ainda não está configurado).
 * Dados de pagamento NÃO são mostrados a partir daqui: aparecem apenas dentro de
 * um pedido real, vindos da base de dados.
 */
export const DEFAULT_SETTINGS: EventSettings = {
  event_name: 'V25 — O LEGADO',
  subtitle: '25 Anos de Música, Fé, Amizade e História',
  slogan: 'Uma história que nos une. Um legado que permanece.',
  group_name: 'Vibes – Grupo Vocal',
  starts_at: '2026-12-20T16:00:00+01:00',
  timezone: 'Africa/Luanda',
  venue: 'Hotel Brisa Tropical',
  address: 'Morro Bento, Luanda, Angola',
  maps_url:
    'https://www.google.com/maps/search/?api=1&query=Hotel%20Brisa%20Tropical%2C%20Morro%20Bento%2C%20Luanda',
  about_text: [
    'Em 2026, o Vibes – Grupo Vocal celebra 25 anos de uma trajectória marcada pela música, pela fé, pela amizade e por histórias que atravessam gerações.',
    'O V25 — O Legado será muito mais do que um concerto: será um reencontro emocionante entre antigos e actuais integrantes, reunindo vozes, memórias e pessoas que fizeram parte desta caminhada, incluindo membros que regressam de outros países para celebrar este marco especial.',
    'Uma tarde única para recordar o passado, celebrar o presente e honrar o legado que continuará a inspirar as próximas gerações.',
  ].join('\n\n'),
  closing_message: '25 anos. Uma história. Muitas vozes. Um legado.',
  sales_open: false,
  sales_closed_message: 'A AGUARDAR ABERTURA DAS VENDAS',
  capacity: null,
  reservation_hours: 48,
  bank_account_name: '',
  bank_account_number: '',
  bank_iban: '',
  express_number: '',
  payment_instructions: '',
  contact_email: '',
  contact_phone: '',
  socials: {},
  copyright_text: '',
  credits_text: '',
  privacy_text: '',
  terms_text: '',
  email_sender_name: 'V25 — O Legado',
  email_reply_to: '',
};

export const CONSENT_VERSION = 'v1-2026-10';
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
