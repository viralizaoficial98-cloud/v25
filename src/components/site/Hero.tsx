import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { CalendarDays, Clock, MapPin } from 'lucide-react';
import { CmsImage } from '@/components/ui/cmsImage';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatEventDate, formatEventTime } from '@/lib/format';
import { useSettings } from '@/hooks/useSettings';
import { useSite } from '@/hooks/useSite';
import { safeHref } from '@/lib/siteDefaults';
import { Countdown } from './Countdown';

/** Separa "V25 — O LEGADO" em marca (V25) e complemento, para o tratamento tipográfico. */
function splitTitle(title: string): [string, string] {
  const m = title.match(/^(\S+)\s*[—–-]\s*(.+)$/);
  return m ? [m[1], `— ${m[2]}`] : [title, ''];
}

export function Hero() {
  const { settings: s } = useSettings();
  const h = useSite().content.hero;
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 50]);
  const ease = [0.22, 1, 0.36, 1] as const;
  const [mark, rest] = splitTitle(h.title || s.event_name);

  return (
    <section id="topo" className="relative isolate overflow-hidden bg-paper pt-24 md:pt-28" aria-labelledby="hero-title">
      {/* Fundo branco com um brilho dourado subtil */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_78%_18%,rgb(var(--gold-pale)/.9),transparent_55%),radial-gradient(ellipse_at_0%_100%,rgb(var(--paper-muted)),transparent_50%)]" />

      <div className="container grid items-center gap-10 pb-16 lg:grid-cols-[1.02fr_1fr] lg:gap-12 lg:pb-24">
        <div className="relative z-10 order-2 lg:order-1">
          <motion.p initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }} className="eyebrow">
            {h.eyebrow}
          </motion.p>
          <h1 id="hero-title" className="mt-5 font-display font-semibold leading-[0.92]">
            <span className="sr-only">{h.title}</span>
            <span aria-hidden className="flex flex-wrap items-end gap-x-4">
              <motion.span
                className="text-gold-metal text-[5rem] sm:text-[7rem] lg:text-[8.5rem]"
                initial={reduce ? false : { opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.1, ease }}
              >
                {mark}
              </motion.span>
              {rest && (
                <motion.span
                  className="mb-3 text-2xl tracking-[0.12em] text-fg sm:mb-5 sm:text-4xl lg:mb-6 lg:text-5xl"
                  initial={reduce ? false : { opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 1, delay: 0.45, ease }}
                >
                  {rest}
                </motion.span>
              )}
            </span>
          </h1>
          <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.6, ease }}>
            <p className="mt-6 max-w-xl text-xl font-medium text-fg md:text-2xl">{h.subtitle}</p>
            {h.description && <p className="mt-4 max-w-xl text-base leading-relaxed text-fg-muted md:text-lg">{h.description}</p>}
            {h.slogan && <p className="mt-4 max-w-xl font-display text-xl italic text-gold-deep md:text-2xl">“{h.slogan}”</p>}

            {h.show_countdown && <Countdown target={s.starts_at} className="mt-8" />}

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              {h.cta_primary.label && (
                <a href={safeHref(h.cta_primary.href)} className={buttonVariants({ size: 'lg' })}>
                  {h.cta_primary.label}
                </a>
              )}
              {h.cta_secondary.label && (
                <a href={safeHref(h.cta_secondary.href)} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
                  {h.cta_secondary.label}
                </a>
              )}
            </div>

            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-medium text-fg-muted">
              <li className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-gold" aria-hidden /> {formatEventDate(s.starts_at)}
              </li>
              <li className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gold" aria-hidden /> {formatEventTime(s.starts_at)}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gold" aria-hidden /> {s.venue}, {s.address.replace(/, Angola$/, '')}
              </li>
            </ul>
          </motion.div>
        </div>

        <motion.div
          style={{ y }}
          className="relative order-1 lg:order-2"
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease }}
        >
          <div aria-hidden className="absolute -inset-4 rounded-[2.5rem] bg-gold-pale/70 blur-2xl" />
          <div className="relative rounded-[2rem] bg-gradient-to-br from-gold-bright/70 via-gold-pale to-paper p-[3px] shadow-card">
            {/* Fotografia oficial do grupo, na proporção original — sem recortar integrantes */}
            <CmsImage
              path={h.image}
              fallback="vibes-grupo"
              alt={h.image_alt}
              sizes="(min-width: 1024px) 46vw, 100vw"
              priority
              className="rounded-[1.85rem] bg-paper"
              imgClassName="object-contain"
            />
          </div>
          <p className="absolute -bottom-4 right-6 rounded-full border border-gold/30 bg-paper px-4 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-gold-deep shadow-soft">
            25 anos de vozes
          </p>
        </motion.div>
      </div>
    </section>
  );
}
