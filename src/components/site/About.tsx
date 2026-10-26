import { motion, useReducedMotion } from 'framer-motion';
import { CmsImage } from '@/components/ui/cmsImage';
import { Reveal } from '@/components/ui/misc';
import { useSettings } from '@/hooks/useSettings';
import { useSite } from '@/hooks/useSite';

export function About() {
  const { settings: s } = useSettings();
  const a = useSite().content.about;
  const PILLARS = a.pillars.filter(Boolean);
  const reduce = useReducedMotion();
  const paragraphs = (a.body || s.about_text).split(/\n{2,}/).filter(Boolean);
  const [lead, ...rest] = paragraphs;

  return (
    <section id="evento" className="section overflow-hidden" aria-labelledby="sobre-titulo">
      <div className="container grid gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <Reveal>
            <p className="eyebrow">{a.eyebrow}</p>
            <h2 id="sobre-titulo" className="mt-4 text-5xl font-semibold leading-[1.02] md:text-6xl">
              {a.title} <em className="text-gold-metal not-italic">{a.title_highlight}</em>
            </h2>
          </Reveal>
          <Reveal delay={0.15} className="mt-10 hidden lg:block">
            <div className="relative">
              <div aria-hidden className="absolute -left-4 -top-4 h-full w-full rounded-3xl border border-gold/25" />
              <CmsImage path={a.image} fallback="vibes-ao-vivo" alt={a.image_alt}
                sizes="(min-width: 1024px) 38vw, 100vw"
                className="relative rounded-3xl"
                imgClassName="object-contain"
              />
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-6 lg:col-start-7 lg:pt-16">
          {lead && (
            <Reveal>
              <p className="font-display text-2xl leading-snug text-fg md:text-[2rem] md:leading-[1.25]">
                <span className="float-left mr-3 mt-1 font-display text-7xl leading-[0.8] text-gold-metal md:text-8xl">{lead.charAt(0)}</span>
                {lead.slice(1)}
              </p>
            </Reveal>
          )}
          <div className="mt-8 space-y-6 text-base leading-relaxed text-fg/70 md:text-lg">
            {rest.map((p, i) => (
              <Reveal key={i} delay={0.08 * i}>
                <p>{p}</p>
              </Reveal>
            ))}
          </div>

          <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PILLARS.map((p, i) => (
              <motion.li
                key={p}
                initial={reduce ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * i, duration: 0.7 }}
                className="glass rounded-2xl px-4 py-5 text-center"
              >
                <span className="font-display text-xl text-gold-deep">{p}</span>
              </motion.li>
            ))}
          </ul>

          <Reveal className="mt-10 lg:hidden">
            <CmsImage path={a.image} fallback="vibes-ao-vivo" alt={a.image_alt} className="rounded-3xl" imgClassName="object-contain" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
