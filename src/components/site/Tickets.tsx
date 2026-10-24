import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Hourglass, ShieldCheck, Ticket, Users } from 'lucide-react';
import { Alert, Badge, EmptyState, SectionHeading, Spinner } from '@/components/ui/misc';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { fetchTicketTypes } from '@/lib/api';
import { formatDateTime, formatKz } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { useSettings } from '@/hooks/useSettings';
import { isBackendConfigured } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';

export function Tickets() {
  const { settings: s } = useSettings();
  const reduce = useReducedMotion();
  const { data = [], loading, error } = useAsync(fetchTicketTypes, []);
  const anyOnSale = s.sales_open && data.some((t) => t.on_sale);

  return (
    <section id="ingressos" className="section bg-gradient-to-b from-ink via-espresso/40 to-ink" aria-labelledby="ingressos-titulo">
      <div className="container">
        <SectionHeading
          eyebrow="Ingressos e inscrições"
          title={<span id="ingressos-titulo">Garanta o seu lugar <span className="text-gold-metal">nesta história</span></span>}
          intro="Escolha a sua categoria, faça a inscrição e receba os dados para pagamento por transferência. O ingresso digital é emitido após a confirmação do pagamento pela nossa equipa."
        />

        {loading ? (
          <div className="flex justify-center"><Spinner label="A carregar ingressos…" /></div>
        ) : error ? (
          <Alert tone="bad" title="Não foi possível carregar os ingressos" className="mx-auto max-w-xl">{errorMessage(error)}</Alert>
        ) : !isBackendConfigured || data.length === 0 || !s.sales_open ? (
          <div className="mx-auto max-w-2xl">
            <EmptyState icon={<Hourglass className="h-9 w-9" />} title={s.sales_closed_message || 'A AGUARDAR ABERTURA DAS VENDAS'}>
              Os tipos de ingresso e preços serão anunciados em breve. Acompanhe as nossas redes sociais para saber quando abrem as vendas.
            </EmptyState>
            {data.length > 0 && (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {data.map((t) => (
                  <li key={t.id} className="glass flex items-center justify-between rounded-2xl px-5 py-4">
                    <span className="font-display text-xl">{t.name}</span>
                    <Badge>Brevemente</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <ul className={cn('grid gap-6', data.length === 1 ? 'mx-auto max-w-md' : data.length === 2 ? 'mx-auto max-w-4xl md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3')}>
              {data.map((t, i) => {
                const soldOut = t.available <= 0;
                const disabled = !t.on_sale || soldOut;
                const low = !soldOut && t.quantity_total > 0 && t.available / t.quantity_total <= 0.15;
                return (
                  <motion.li
                    key={t.id}
                    initial={reduce ? false : { opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: i * 0.1 }}
                    className={cn(
                      'relative flex flex-col overflow-hidden rounded-[1.75rem] border bg-gradient-to-b from-ink-700 to-ink-800 p-7 shadow-card',
                      disabled ? 'border-white/10 opacity-80' : 'border-gold/30 hover:border-gold/60',
                    )}
                  >
                    <div aria-hidden className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gold/10 blur-2xl" />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {t.lot_label && <p className="eyebrow">{t.lot_label}</p>}
                        <h3 className="mt-1 text-3xl font-semibold text-cream">{t.name}</h3>
                      </div>
                      <Ticket className="h-6 w-6 shrink-0 text-gold" aria-hidden />
                    </div>
                    <p className="mt-5 font-display text-4xl font-semibold text-gold-metal">{formatKz(t.price_kz)}</p>
                    {t.persons_per_ticket > 1 && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-cream/60">
                        <Users className="h-3.5 w-3.5" aria-hidden /> Cada ingresso admite até {t.persons_per_ticket} pessoas
                      </p>
                    )}
                    {t.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-cream/65">{t.description}</p>}

                    <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 text-xs">
                      <div>
                        <dt className="text-cream/45">Disponíveis</dt>
                        <dd className={cn('mt-0.5 font-semibold', soldOut ? 'text-rose-300' : low ? 'text-amber-200' : 'text-cream')}>
                          {soldOut ? 'Esgotado' : `${t.available} de ${t.quantity_total}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-cream/45">Limite</dt>
                        <dd className="mt-0.5 font-semibold text-cream">
                          {t.max_per_order} por pedido · {t.max_per_customer} por cliente
                        </dd>
                      </div>
                      {t.sales_end && (
                        <div className="col-span-2">
                          <dt className="text-cream/45">Vendas até</dt>
                          <dd className="mt-0.5 font-semibold text-cream">{formatDateTime(t.sales_end)}</dd>
                        </div>
                      )}
                    </dl>

                    <div className="mt-7 grid gap-2.5">
                      {disabled ? (
                        <span className={cn(buttonVariants({ variant: 'subtle' }), 'pointer-events-none')}>
                          {soldOut ? 'Esgotado' : t.sales_start && new Date(t.sales_start) > new Date() ? `Vendas a partir de ${formatDateTime(t.sales_start)}` : 'Indisponível'}
                        </span>
                      ) : (
                        <>
                          <Link to={`/checkout?tipo=${t.id}&modo=compra`} className={buttonVariants({ size: 'lg' })}>
                            Comprar ingresso
                          </Link>
                          <Link to={`/checkout?tipo=${t.id}&modo=reserva`} className={buttonVariants({ variant: 'outline' })}>
                            Reservar lugar
                          </Link>
                        </>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
            {anyOnSale && (
              <p className="mx-auto mt-10 flex max-w-2xl items-start justify-center gap-2 text-center text-xs text-cream/50">
                <ShieldCheck className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                Pagamento por transferência bancária ou Transferência Express. A reserva mantém o lugar durante {s.reservation_hours} horas; o ingresso é emitido apenas após verificação manual do pagamento.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
