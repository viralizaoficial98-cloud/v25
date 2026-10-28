import { lazy, Suspense, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Crown, Hourglass, ShieldCheck, Sparkles, Ticket, Users } from 'lucide-react';
import { Alert, Badge, CmsHeading, EmptyState, Spinner } from '@/components/ui/misc';
import { buttonVariants, Button } from '@/components/ui/button';
import { ticketState } from '@/lib/ticketState';
import { cn } from '@/lib/cn';
import { fetchTicketTypes } from '@/lib/api';
import { formatDateTime, formatKz } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { useSettings } from '@/hooks/useSettings';
import { useSite } from '@/hooks/useSite';
import { errorMessage } from '@/lib/errors';
import type { PublicTicketType } from '@/lib/types';

// Popup de compra e formulário VIP carregados só quando são abertos
const CheckoutModal = lazy(() => import('@/components/checkout/CheckoutModal'));
const VipRequestDialog = lazy(() => import('@/components/vip/VipRequestDialog').then((m) => ({ default: m.VipRequestDialog })));

function availabilityLabel(t: PublicTicketType) {
  if (t.sale_mode === 'consulta') return 'Disponibilidade limitada · sujeito a aprovação';
  if (!t.stock_defined) return 'Disponibilidade a anunciar';
  if (t.sales_status === 'esgotadas' || t.available <= 0) return 'Esgotado';
  if (t.sales_status === 'suspensas') return 'Vendas suspensas';
  return `${t.available} de ${t.quantity_total} disponíveis`;
}

function TicketCard({ t, index, onVip, onBuy }: { t: PublicTicketType; index: number; onVip: () => void; onBuy: () => void }) {
  const reduce = useReducedMotion();
  const site = useSite().content.tickets;
  const { settings: s } = useSettings();
  const vip = t.sale_mode === 'consulta';
  const featured = vip || /premium/i.test(t.name);
  // O servidor decide (on_sale); aqui escolhe-se a mensagem verdadeira de cada estado
  const st = ticketState(t, s.sales_open);
  const canBuy = !vip && st.canBuy;
  const soldOut = !vip && st.tone === 'bad';
  const low = canBuy && st.tone === 'low';

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.7, delay: index * 0.1 }}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-[1.75rem] border bg-paper p-7 shadow-card transition duration-500 hover:-translate-y-1',
        vip ? 'border-gold/60 ring-1 ring-gold/30' : featured ? 'border-gold/40' : 'border-fg/10',
      )}
    >
      {vip && <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gold-metal" />}
      <div className="flex items-start justify-between gap-3">
        <div>
          {t.lot_label && <p className="eyebrow">{t.lot_label}</p>}
          <h3 className="mt-1 font-display text-3xl font-semibold tracking-wide text-fg">{t.name}</h3>
        </div>
        {vip ? <Crown className="h-7 w-7 shrink-0 text-gold" aria-hidden /> : featured ? <Sparkles className="h-6 w-6 shrink-0 text-gold" aria-hidden /> : <Ticket className="h-6 w-6 shrink-0 text-gold" aria-hidden />}
      </div>
      {t.badge && <Badge tone="warn" className="mt-3 self-start">{t.badge}</Badge>}

      <p className="mt-5 font-display text-4xl font-semibold text-gold-metal">
        {vip ? 'Por consulta' : formatKz(t.price_kz)}
      </p>
      {!vip && t.persons_per_ticket > 1 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
          <Users className="h-3.5 w-3.5" aria-hidden /> Cada ingresso admite até {t.persons_per_ticket} pessoas
        </p>
      )}
      {t.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-fg-muted">{t.description}</p>}

      {t.benefits.length > 0 && (
        <ul className="mt-5 space-y-2.5 text-sm text-fg">
          {t.benefits.map((b) => (
            <li key={b} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-pale text-gold-deep">
                <Check className="h-3 w-3" aria-hidden />
              </span>
              {b}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-6 grid gap-2 border-t border-fg/10 pt-5 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-fg-muted">Disponibilidade</dt>
          <dd className={cn('text-right font-semibold', soldOut ? 'text-rose-800' : low ? 'text-amber-800' : 'text-fg')}>{availabilityLabel(t)}</dd>
        </div>
        {!vip && (
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">Limite</dt>
            <dd className="text-right font-semibold text-fg">{t.max_per_order} por pedido</dd>
          </div>
        )}
        {t.sales_end && !vip && (
          <div className="flex justify-between gap-3">
            <dt className="text-fg-muted">Vendas até</dt>
            <dd className="text-right font-semibold text-fg">{formatDateTime(t.sales_end)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-auto pt-7">
        {vip ? (
          <>
            <Button size="lg" className="w-full" onClick={onVip}>
              <Crown className="h-4 w-4" aria-hidden /> {site.vip_label}
            </Button>
            <p className="mt-3 text-center text-[11px] leading-snug text-fg-muted">
              O acesso VIP depende da aprovação da organização. Receberá uma proposta antes de qualquer pagamento.
            </p>
          </>
        ) : canBuy ? (
          <Button size="lg" className="w-full" onClick={onBuy} aria-haspopup="dialog">
            {site.buy_label}
          </Button>
        ) : (
          <span aria-disabled="true" className={cn(buttonVariants({ variant: 'subtle', size: 'lg' }), 'pointer-events-none w-full')}>
            {st.label}
          </span>
        )}
      </div>
    </motion.li>
  );
}

export function Tickets() {
  const { settings: s } = useSettings();
  const site = useSite().content.tickets;
  const { data = [], loading, error } = useAsync(fetchTicketTypes, []);
  const [vipOpen, setVipOpen] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const anyDirect = data.some((t) => t.sale_mode === 'directo');

  return (
    <section id="ingressos" className="section bg-gradient-to-b from-paper via-paper-soft to-paper" aria-labelledby="ingressos-titulo">
      <div className="container">
        <CmsHeading id="ingressos-titulo" s={site} />

        {loading ? (
          <div className="flex justify-center"><Spinner label="A carregar ingressos…" /></div>
        ) : error ? (
          <Alert tone="bad" title="Não foi possível carregar os ingressos" className="mx-auto max-w-xl">{errorMessage(error)}</Alert>
        ) : data.length === 0 ? (
          <EmptyState icon={<Hourglass className="h-9 w-9" />} title={s.sales_closed_message || 'A AGUARDAR ABERTURA DAS VENDAS'} className="mx-auto max-w-2xl">
            As categorias de ingresso serão anunciadas em breve.
          </EmptyState>
        ) : (
          <>
            {!s.sales_open && anyDirect && (
              <Alert tone="info" title={s.sales_closed_message || 'A AGUARDAR ABERTURA DAS VENDAS'} className="mx-auto mb-8 max-w-2xl">
                Pode conhecer as categorias desde já; a compra fica disponível quando as vendas abrirem.
              </Alert>
            )}
            <ul className={cn('grid gap-6', data.length === 1 ? 'mx-auto max-w-md' : data.length === 2 ? 'mx-auto max-w-4xl md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3')}>
              {data.map((t, i) => (
                <TicketCard key={t.id} t={t} index={i} onVip={() => setVipOpen(true)} onBuy={() => setBuying(t.id)} />
              ))}
            </ul>
            {site.note && (
              <p className="mx-auto mt-10 flex max-w-2xl items-start justify-center gap-2 text-center text-xs text-fg-muted">
                <ShieldCheck className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                {site.note}
              </p>
            )}
          </>
        )}
      </div>
      {buying && (
        <Suspense fallback={null}>
          <CheckoutModal ticketTypeId={buying} open={!!buying} onOpenChange={(v) => !v && setBuying(null)} />
        </Suspense>
      )}
      {vipOpen && (
        <Suspense fallback={null}>
          <VipRequestDialog open={vipOpen} onOpenChange={setVipOpen} />
        </Suspense>
      )}
    </section>
  );
}
