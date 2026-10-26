import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { CalendarDays, Clock, MapPin } from 'lucide-react';
import { OfficialPicture } from '@/components/ui/picture';
import { officialImage } from '@/lib/images';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatEventDate, formatEventTime } from '@/lib/format';
import { useSettings } from '@/hooks/useSettings';
import { Countdown } from './Countdown';

export function Hero() {
  const { settings: s } = useSettings();
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 60]);
  const bg = officialImage('vibes-grupo');
  const ease = [0.22, 1, 0.36, 1] as const;
  const letters = 'V25'.split('');

  return (
    <section id="topo" className="grain relative isolate overflow-hidden pt-24 md:pt-28" aria-labelledby="hero-title">
      {/* Ambiente: versão desfocada da fotografia oficial (não substitui a imagem real) */}
      <div aria-hidden className="absolute inset-0 -z-10 scale-110 bg-cover bg-center opacity-40 blur-3xl" style={{ backgroundImage: `url(${bg.blur})` }} />
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_70%_30%,rgba(201,164,92,.22),transparent_55%),linear-gradient(to_bottom,rgba(11,8,6,.4),#0b0806_92%)]" />

      <div className="container grid items-center gap-10 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pb-24">
        <div className="relative z-10 order-2 lg:order-1">
          <motion.p initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }} className="eyebrow">
            {s.group_name} · Celebração dos 25 anos
          </motion.p>
          <h1 id="hero-title" className="mt-5 font-display font-semibold leading-[0.9]">
            <span className="sr-only">{s.event_name}</span>
            <span aria-hidden className="flex items-end gap-4">
              <span className="flex text-[5.5rem] sm:text-[7.5rem] lg:text-[9.5rem]">
                {letters.map((l, i) => (
                  <motion.span
                    key={i}
                    className="text-gold-metal animate-shine inline-block"
                    initial={reduce ? false : { opacity: 0, y: 40, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 1, delay: 0.15 + i * 0.12, ease }}
                  >
                    {l}
                  </motion.span>
                ))}
              </span>
              <motion.span
                className="mb-3 text-2xl tracking-[0.12em] text-fg sm:mb-5 sm:text-4xl lg:mb-7 lg:text-5xl"
                initial={reduce ? false : { opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 1, delay: 0.6, ease }}
              >
                — O LEGADO
              </motion.span>
            </span>
          </h1>
          <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.8, ease }}>
            <p className="mt-6 max-w-xl text-lg text-fg/85 md:text-xl">{s.subtitle}</p>
            <p className="mt-3 max-w-xl font-display text-xl italic text-gold-light/90 md:text-2xl">“{s.slogan}”</p>

            <Countdown target={s.starts_at} className="mt-8" />

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="#ingressos" className={buttonVariants({ size: 'lg' })}>
                Garantir o meu ingresso
              </a>
              <a href="#historia" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
                Conhecer a nossa história
              </a>
            </div>

            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-fg/60">
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
          initial={reduce ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease }}
        >
          <div aria-hidden className="absolute -inset-6 rounded-[2.5rem] bg-gold/10 blur-3xl" />
          <div className="relative rounded-[2rem] bg-gradient-to-b from-gold/50 via-gold/10 to-transparent p-px">
            {/* Fotografia oficial na proporção original — sem recortar integrantes */}
            <OfficialPicture
              name="vibes-grupo"
              alt="Os integrantes do Vibes – Grupo Vocal reunidos em estúdio"
              sizes="(min-width: 1024px) 46vw, 100vw"
              priority
              className="rounded-[2rem]"
              imgClassName="object-contain"
            />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 rounded-b-[2rem] bg-gradient-to-t from-paper/70 to-transparent" />
          </div>
          <p className="absolute -bottom-4 right-6 rounded-full border border-gold/30 bg-paper/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-gold-light backdrop-blur">
            25 anos de vozes
          </p>
        </motion.div>
      </div>
    </section>
  );
}
