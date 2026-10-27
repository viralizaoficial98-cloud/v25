import type { SiteLink } from './types';

/**
 * Conteúdos por omissão (iguais aos textos oficiais semeados pela migração 003).
 * Só são usados se a API não responder; em funcionamento normal tudo vem do CMS.
 */
export interface SiteContent {
  hero: { eyebrow: string; title: string; subtitle: string; description: string; slogan: string; cta_primary: SiteLink; cta_secondary: SiteLink; image: string; image_alt: string; show_countdown: boolean };
  about: { eyebrow: string; title: string; title_highlight: string; body: string; image: string; image_alt: string; pillars: string[] };
  banner: { items: { title: string; text: string; cta_label: string; cta_href: string; image: string }[] };
  tickets: { eyebrow: string; title: string; title_highlight: string; intro: string; buy_label: string; vip_label: string; note: string };
  event_info: { eyebrow: string; title: string; maps_label: string };
  history: { eyebrow: string; title: string; title_highlight: string; intro: string; empty_text: string };
  group: { eyebrow: string; title: string; title_highlight: string; intro: string };
  event_gallery: { eyebrow: string; title: string; title_highlight: string; intro: string; more_label: string };
  memories: { eyebrow: string; title: string; title_highlight: string; intro: string };
  faq: { eyebrow: string; title: string };
  footer: { closing_message: string; tagline: string; show_partner_logo: boolean; partner_label: string };
  seo: { meta_title: string; meta_description: string; og_image: string };
}
export type SectionKey = keyof SiteContent;

export const DEFAULT_SITE: SiteContent = {
  hero: {
    eyebrow: 'Vibes — Grupo Vocal · Celebração dos 25 anos',
    title: 'V25 — O LEGADO',
    subtitle: '25 Anos de Música, Fé, Amizade e História',
    description:
      'Prepare-se para celebrar 25 anos de música, fé e histórias que marcaram gerações. Escolha a categoria do seu ingresso e faça parte desta celebração especial!',
    slogan: '25 anos de música. Uma história. Um legado. Uma celebração para recordar.',
    cta_primary: { label: 'GARANTE JÁ O TEU INGRESSO', href: '#ingressos' },
    cta_secondary: { label: 'Conhecer a nossa história', href: '#historia' },
    image: '',
    image_alt: 'Os integrantes do Vibes — Grupo Vocal reunidos em estúdio',
    show_countdown: true,
  },
  about: { eyebrow: 'Sobre o evento', title: 'Muito mais do que', title_highlight: 'um concerto.', body: '', image: '', image_alt: 'Integrantes do Vibes — Grupo Vocal a cantar em conjunto', pillars: ['Música', 'Fé', 'Amizade', 'História'] },
  banner: { items: [{ title: 'VEM FAZER PARTE DESTA HISTÓRIA!', text: '25 anos de música. Uma história. Um legado. Uma celebração para recordar.', cta_label: 'Garante já o teu ingresso', cta_href: '#ingressos', image: '' }] },
  tickets: {
    eyebrow: 'Ingressos e inscrições',
    title: 'Escolhe a tua',
    title_highlight: 'experiência',
    intro: 'Prepare-se para celebrar 25 anos de música, fé e histórias que marcaram gerações. Escolha a categoria do seu ingresso e faça parte desta celebração especial!',
    buy_label: 'Comprar bilhete',
    vip_label: 'Solicitar acesso VIP',
    note: 'Pagamento por transferência bancária ou Transferência Express. O ingresso é emitido após a confirmação do pagamento pela equipa financeira.',
  },
  event_info: { eyebrow: 'Informações do evento', title: 'Marque na sua agenda', maps_label: 'Ver localização' },
  history: { eyebrow: '25 anos de história', title: 'Uma caminhada feita de', title_highlight: 'vozes', intro: 'Os marcos que construíram o legado do Vibes — Grupo Vocal, contados por quem os viveu.', empty_text: 'Estamos a recolher datas, fotografias e memórias junto de antigos e actuais integrantes. Os marcos serão publicados aqui em breve.' },
  group: { eyebrow: 'O grupo', title: 'Vozes que se tornaram', title_highlight: 'família', intro: 'Antigos e actuais integrantes reúnem-se para celebrar 25 anos de harmonia.' },
  event_gallery: { eyebrow: 'Galeria dos eventos', title: 'GALERIA DOS EVENTOS', title_highlight: '', intro: 'Revive os momentos especiais que marcaram a história do Vibes — Grupo Vocal.', more_label: 'Ver mais fotografias' },
  memories: { eyebrow: 'Memórias e galeria', title: 'Momentos que', title_highlight: 'ficam', intro: 'Fotografias e vídeos de 25 anos de palco, ensaios e amizade.' },
  faq: { eyebrow: 'Perguntas frequentes', title: 'Tudo o que precisa de saber' },
  footer: { closing_message: '25 anos. Uma história. Muitas vozes. Um legado.', tagline: '25 Anos de Música, Fé, Amizade e História', show_partner_logo: true, partner_label: 'Organização e produção' },
  seo: { meta_title: 'V25 — O Legado · 25 Anos do Vibes — Grupo Vocal', meta_description: '', og_image: '' },
};

/** Ordem por omissão das secções da one page. */
export const DEFAULT_ORDER: SectionKey[] = ['hero', 'about', 'banner', 'tickets', 'event_info', 'history', 'group', 'event_gallery', 'memories', 'faq', 'footer', 'seo'];

/** Links do CMS: só http(s), relativos e âncoras (a API já valida; aqui é defesa extra). */
export function safeHref(href: string | undefined | null): string {
  const h = (href ?? '').trim();
  return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(h) ? h : '#';
}
