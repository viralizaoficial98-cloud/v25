import { CalendarDays, Clock, MapPin, Navigation } from 'lucide-react';
import { Reveal, SectionHeading } from '@/components/ui/misc';
import { buttonVariants } from '@/components/ui/button';
import { formatEventDate, formatEventTime } from '@/lib/format';
import { useSettings } from '@/hooks/useSettings';
import { useSite } from '@/hooks/useSite';

export function EventInfo() {
  const { settings: s } = useSettings();
  const e = useSite().content.event_info;
  const cards = [
    { icon: CalendarDays, label: 'Data', value: formatEventDate(s.starts_at) },
    { icon: Clock, label: 'Horário', value: formatEventTime(s.starts_at) },
    { icon: MapPin, label: 'Local', value: s.venue },
    { icon: Navigation, label: 'Morada', value: s.address.replace(/, Angola$/, '') },
  ];
  return (
    <section id="informacoes" className="section relative overflow-hidden" aria-labelledby="info-titulo">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(var(--gold-pale)/.7),transparent_65%)]" />
      <div className="container">
        <SectionHeading eyebrow={e.eyebrow} title={<span id="info-titulo">{e.title}</span>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c, i) => (
            <Reveal key={c.label} delay={i * 0.08}>
              <div className="glass group h-full rounded-3xl p-7 transition hover:border-gold/40">
                <c.icon className="h-6 w-6 text-gold" aria-hidden />
                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-fg/50">{c.label}</p>
                <p className="mt-2 font-display text-2xl text-fg">{c.value}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 flex justify-center">
          <a href={s.maps_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            <MapPin className="h-4 w-4" aria-hidden /> {e.maps_label}
            <span className="sr-only">(abre o Google Maps numa nova janela)</span>
          </a>
        </Reveal>
      </div>
    </section>
  );
}
