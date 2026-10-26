import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Hourglass } from 'lucide-react';
import { EmptyState, SectionHeading, Spinner } from '@/components/ui/misc';
import { fetchTimeline, mediaUrl } from '@/lib/api';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/cn';

export function Timeline() {
  const { data = [], loading } = useAsync(fetchTimeline, []);
  const [active, setActive] = useState(0);
  const current = data[active];

  return (
    <section id="historia" className="section bg-gradient-to-b from-paper via-paper-soft to-paper" aria-labelledby="historia-titulo">
      <div className="container">
        <SectionHeading
          eyebrow="25 anos de história"
          title={<span id="historia-titulo">Uma caminhada feita de <span className="text-gold-metal">vozes</span></span>}
          intro="Os marcos que construíram o legado do Vibes – Grupo Vocal, contados por quem os viveu."
        />

        {loading ? (
          <div className="flex justify-center"><Spinner /></div>
        ) : data.length === 0 ? (
          <EmptyState icon={<Hourglass className="h-8 w-8" />} title="A história está a ser reunida">
            Estamos a recolher datas, fotografias e memórias junto de antigos e actuais integrantes. Os marcos serão publicados aqui em breve.
          </EmptyState>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            {/* Lista de marcos (navegável por teclado) */}
            <ol className="relative space-y-1 border-l border-gold/20 pl-6" aria-label="Marcos históricos">
              {data.map((e, i) => (
                <li key={e.id} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -left-[31px] top-4 h-3 w-3 rounded-full border transition',
                      i === active ? 'border-gold-light bg-gold shadow-[0_0_18px_rgba(232,207,142,.8)]' : 'border-gold/40 bg-paper',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-current={i === active ? 'step' : undefined}
                    className={cn('w-full rounded-xl px-4 py-3 text-left transition', i === active ? 'bg-gold/10' : 'hover:bg-fg/5')}
                  >
                    <span className="block text-xs font-semibold uppercase tracking-[0.24em] text-gold">{e.period_label}</span>
                    <span className={cn('mt-1 block font-display text-xl', i === active ? 'text-fg' : 'text-fg/60')}>{e.title}</span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="lg:sticky lg:top-28 lg:self-start" aria-live="polite">
              <AnimatePresence mode="wait">
                {current && (
                  <motion.article
                    key={current.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.45 }}
                    className="glass overflow-hidden rounded-3xl"
                  >
                    {current.image_path && (
                      <img src={mediaUrl(current.image_path) ?? ''} alt={current.title} loading="lazy" className="max-h-[420px] w-full bg-paper-muted object-contain" />
                    )}
                    <div className="p-7 md:p-9">
                      <p className="eyebrow">{current.period_label}</p>
                      <h3 className="mt-3 text-3xl font-semibold md:text-4xl">{current.title}</h3>
                      {current.description && <p className="mt-4 whitespace-pre-line leading-relaxed text-fg/70">{current.description}</p>}
                    </div>
                  </motion.article>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
