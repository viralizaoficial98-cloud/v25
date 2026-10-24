import { Link } from 'react-router-dom';
import { Facebook, Instagram, Mail, MapPin, MessageCircle, Music2, Phone, Youtube } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { formatEventDate, formatEventTime } from '@/lib/format';
import type { SocialNetwork } from '@/lib/types';
import { Logo } from './Navbar';

const SOCIAL: Record<SocialNetwork, { label: string; icon: typeof Instagram }> = {
  instagram: { label: 'Instagram', icon: Instagram },
  facebook: { label: 'Facebook', icon: Facebook },
  youtube: { label: 'YouTube', icon: Youtube },
  tiktok: { label: 'TikTok', icon: Music2 },
  spotify: { label: 'Spotify', icon: Music2 },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
};

export function Footer() {
  const { settings: s } = useSettings();
  const socials = (Object.entries(s.socials ?? {}) as [SocialNetwork, string][]).filter(([k, v]) => SOCIAL[k] && /^https?:\/\//.test(v ?? ''));
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-gold/10 bg-ink-900 pt-20">
      <div className="container">
        <p className="mx-auto max-w-3xl text-center font-display text-3xl leading-tight text-cream md:text-5xl">
          {s.closing_message.split('. ').map((part, i, arr) => (
            <span key={i} className={i === arr.length - 1 ? 'text-gold-metal' : undefined}>
              {part}
              {i < arr.length - 1 ? '. ' : ''}
            </span>
          ))}
        </p>
        <div className="hairline mt-16" />
        <div className="grid gap-10 py-14 md:grid-cols-3">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-cream/55">{s.subtitle}</p>
            <p className="mt-2 text-sm text-cream/40">{s.group_name}</p>
          </div>
          <div className="space-y-3 text-sm text-cream/65">
            <p className="eyebrow mb-4">Informações</p>
            <p>{formatEventDate(s.starts_at)} · {formatEventTime(s.starts_at)}</p>
            <a href={s.maps_url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 hover:text-gold-light">
              <MapPin className="mt-0.5 h-4 w-4 text-gold" aria-hidden /> {s.venue}, {s.address}
            </a>
            {s.contact_email && (
              <a href={`mailto:${s.contact_email}`} className="flex items-center gap-2 hover:text-gold-light">
                <Mail className="h-4 w-4 text-gold" aria-hidden /> {s.contact_email}
              </a>
            )}
            {s.contact_phone && (
              <a href={`tel:${s.contact_phone.replace(/\s/g, '')}`} className="flex items-center gap-2 hover:text-gold-light">
                <Phone className="h-4 w-4 text-gold" aria-hidden /> {s.contact_phone}
              </a>
            )}
          </div>
          <div>
            <p className="eyebrow mb-4">Acompanhe-nos</p>
            {socials.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {socials.map(([k, url]) => {
                  const S = SOCIAL[k];
                  return (
                    <li key={k}>
                      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={S.label} className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/25 text-gold-light transition hover:bg-gold/10">
                        <S.icon className="h-5 w-5" aria-hidden />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-cream/40">As redes sociais oficiais serão anunciadas em breve.</p>
            )}
            <ul className="mt-6 space-y-2 text-sm">
              <li><Link to="/consultar" className="text-cream/65 hover:text-gold-light">Consultar o meu pedido</Link></li>
              <li><Link to="/privacidade" className="text-cream/65 hover:text-gold-light">Política de privacidade</Link></li>
              <li><Link to="/termos" className="text-cream/65 hover:text-gold-light">Termos e condições</Link></li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-white/5 py-6 text-xs text-cream/40 md:flex-row md:justify-between">
          <p>{s.copyright_text || `© ${year} ${s.group_name}. Todos os direitos reservados.`}</p>
          {s.credits_text && <p>{s.credits_text}</p>}
        </div>
      </div>
    </footer>
  );
}
