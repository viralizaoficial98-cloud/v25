import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CountryCode } from 'libphonenumber-js/min';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Lock, MapPin, Minus, Plus, ShieldCheck } from 'lucide-react';
import { Alert, Spinner, StatusBadge } from '@/components/ui/misc';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { PhoneInput } from '@/components/vip/PhoneInput';
import { BankCard } from '@/components/order/BankCard';
import { ProofUpload } from '@/components/order/ProofUpload';
import { CheckoutSteps } from '@/components/order/CheckoutSteps';
import { createOrder, fetchTicketTypes, getOrder, quoteOrder, setPaymentMethod } from '@/lib/api';
import { CONSENT_VERSION } from '@/lib/config';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatEventDate, formatEventTime, formatKz } from '@/lib/format';
import { orderPath, saveOrderAccess } from '@/lib/orderAccess';
import { normalizePhone, registrationSchema } from '@/lib/validation';
import { useAsync } from '@/hooks/useAsync';
import { useSettings } from '@/hooks/useSettings';
import { cn } from '@/lib/cn';
import type { CustomerOrder, PaymentMethod } from '@/lib/types';

function uuid() {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type Step = 'selecao' | 'dados' | 'pagamento' | 'comprovativo' | 'concluido';
const STEP_INDEX: Record<Step, number> = { selecao: 0, dados: 1, pagamento: 2, comprovativo: 3, concluido: 4 };
type Errors = Partial<Record<'fullName' | 'email' | 'phone' | 'ticketTypeId' | 'quantity' | 'guestsTotal' | 'consent', string>>;
type Quote = Awaited<ReturnType<typeof quoteOrder>>;

/**
 * Compra de bilhetes Normal/Premium em 4 etapas (popup e página /checkout):
 * 1. Seleção (total calculado no servidor) → 2. Dados (cria o pedido) →
 * 3. Coordenadas oficiais validadas → 4. Comprovativo → “Aguardando validação financeira”.
 * O bilhete só é emitido depois da aprovação manual da equipa financeira.
 */
export function CheckoutFlow({ initialTypeId, mode = 'compra', onClose }: { initialTypeId?: string; mode?: 'compra' | 'reserva'; onClose?: () => void }) {
  const { settings: s } = useSettings();
  const reduce = useReducedMotion();
  const { data: types = [], loading, error: loadError } = useAsync(fetchTicketTypes, []);
  const saleable = useMemo(() => types.filter((t) => t.sale_mode !== 'consulta' && t.on_sale && t.available > 0), [types]);

  const [step, setStep] = useState<Step>('selecao');
  const [typeId, setTypeId] = useState(initialTypeId ?? '');
  const [quantity, setQuantity] = useState(1);
  const [guests, setGuests] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<CountryCode>('AO');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [access, setAccess] = useState<{ code: string; token: string } | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('transferencia');
  const idempotencyKey = useRef(uuid());
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (saleable.length && !saleable.some((t) => t.id === typeId)) setTypeId(saleable[0].id);
  }, [saleable, typeId]);

  const type = saleable.find((t) => t.id === typeId);
  const maxQty = quote?.max_per_order ?? (type ? Math.max(1, Math.min(type.max_per_order, type.available)) : 1);

  useEffect(() => {
    if (type) setGuests(quantity * type.persons_per_ticket);
  }, [quantity, type]);

  // Total sempre calculado pelo servidor (preço em vigor, stock, limites)
  useEffect(() => {
    if (!type || step !== 'selecao') return;
    let alive = true;
    setQuoting(true);
    const t = setTimeout(() => {
      quoteOrder(type.id, quantity)
        .then((q) => {
          if (!alive) return;
          setQuote(q);
          setQuoteError(null);
          if (quantity > q.max_per_order) setQuantity(Math.max(1, q.max_per_order));
        })
        .catch((e) => {
          if (!alive) return;
          setQuote(null);
          setQuoteError(errorMessage(e));
        })
        .finally(() => alive && setQuoting(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [type, quantity, step]);

  const go = (next: Step) => {
    setStep(next);
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
  };

  const validate = (): boolean => {
    const r = registrationSchema.safeParse({ fullName, email, phoneCountry: country, phone, ticketTypeId: typeId, quantity, guestsTotal: guests, consent });
    const e: Errors = {};
    if (!r.success) {
      for (const issue of r.error.issues) {
        const k = issue.path[0] as keyof Errors;
        if (!e[k]) e[k] = issue.message;
      }
    }
    if (type && (guests < quantity || guests > quantity * type.persons_per_ticket)) {
      e.guestsTotal = `Entre ${quantity} e ${quantity * type.persons_per_ticket} convidados.`;
    }
    setErrors(e);
    if (Object.keys(e).length) requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-checkout] [aria-invalid="true"]')?.focus());
    return Object.keys(e).length === 0;
  };

  const loadOrder = async (code: string, token: string) => {
    const o = await getOrder(code, token);
    setOrder(o);
    if (o.payment_method) setMethod(o.payment_method);
    return o;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (submitting || !type || !validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    setDuplicate(false);
    try {
      const r = await createOrder({
        ticketTypeId: type.id,
        quantity,
        guestsTotal: guests,
        fullName: fullName.trim().replace(/\s+/g, ' '),
        email: email.trim().toLowerCase(),
        phone: normalizePhone(phone, country)!,
        consentVersion: CONSENT_VERSION,
        idempotencyKey: idempotencyKey.current,
        mode,
        honeypot,
      });
      saveOrderAccess(r.order_code, r.access_token);
      setAccess({ code: r.order_code, token: r.access_token });
      await loadOrder(r.order_code, r.access_token);
      go('pagamento');
    } catch (e) {
      setSubmitError(errorMessage(e));
      setDuplicate(errorCode(e) === 'PEDIDO_DUPLICADO');
    } finally {
      setSubmitting(false);
    }
  };

  const chooseMethod = (m: PaymentMethod) => {
    setMethod(m);
    if (access) setPaymentMethod(access.code, access.token, m).catch(() => undefined);
  };

  if (loading) return <div className="py-10 text-center"><Spinner label="A preparar a compra…" /></div>;
  if (loadError) return <Alert tone="bad">{errorMessage(loadError)}</Alert>;
  if (!order && (!s.sales_open || saleable.length === 0)) {
    return (
      <Alert tone="info" title={s.sales_closed_message || 'A AGUARDAR ABERTURA DAS VENDAS'}>
        Não existem bilhetes à venda neste momento.
      </Alert>
    );
  }

  const unit = quote?.unit_price_kz ?? order?.unit_price_kz ?? type?.price_kz ?? null;
  const total = order?.total_kz ?? quote?.total_kz ?? null;
  const panel = 'rounded-[1.5rem] border border-fg/10 bg-paper p-5 shadow-soft md:p-7';
  const motionProps = reduce
    ? {}
    : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const } };

  const summary = (
    <div className="rounded-2xl border border-gold/30 bg-gold-soft/60 p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-xl font-semibold text-fg">{s.event_name}</p>
        <p className="text-xs text-fg-muted">
          <CalendarDays className="mr-1 inline h-3.5 w-3.5 text-gold" aria-hidden />
          {formatEventDate(s.starts_at)} · {formatEventTime(s.starts_at)}
          <MapPin className="ml-2 mr-1 inline h-3.5 w-3.5 text-gold" aria-hidden />
          {s.venue}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        <Cell k="Categoria" v={order?.ticket_type.name ?? type?.name ?? '—'} />
        <Cell k="Preço unitário" v={formatKz(unit)} />
        <Cell k="Quantidade" v={String(order?.quantity ?? quantity)} />
        <Cell k="Total" v={<span className="font-display text-lg font-semibold text-gold-deep">{formatKz(total)}</span>} />
      </dl>
    </div>
  );

  return (
    <div data-checkout className="space-y-6">
      <div ref={top} className="scroll-mt-24" />
      <CheckoutSteps current={STEP_INDEX[step]} />
      <AnimatePresence mode="wait">
        {step === 'selecao' && (
          <motion.section key="selecao" {...motionProps} className={cn(panel, 'space-y-6')} aria-labelledby="co-sel">
            <h2 id="co-sel" className="font-display text-2xl font-semibold md:text-3xl">1. Seleção do bilhete</h2>
            <div role="radiogroup" aria-label="Categoria de bilhete" className="grid gap-3">
              {saleable.map((t) => {
                const active = t.id === typeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => { setTypeId(t.id); setQuantity(1); }}
                    className={cn('flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition', active ? 'border-gold bg-gold-pale/50 ring-1 ring-gold/40' : 'border-fg/15 hover:border-gold/60')}
                  >
                    <span className="flex items-start gap-3">
                      <span className={cn('mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', active ? 'border-gold bg-gold text-paper' : 'border-fg/30')}>
                        {active && <Check className="h-3 w-3" aria-hidden />}
                      </span>
                      <span>
                        <span className="block font-display text-xl font-semibold">{t.name}</span>
                        {t.benefits.length > 0 && <span className="mt-0.5 block text-xs text-fg-muted">{t.benefits.slice(0, 2).join(' · ')}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-xl font-semibold text-gold-deep">{formatKz(t.price_kz)}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
              <Field label="Quantidade de bilhetes" required hint={`Máximo ${maxQty} neste pedido`}>
                {(id, d) => (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" aria-label="Diminuir quantidade" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}><Minus className="h-4 w-4" /></Button>
                    <Input id={id} aria-describedby={d} inputMode="numeric" className="text-center text-lg font-semibold" value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, Number(e.target.value.replace(/\D/g, '')) || 1)))} />
                    <Button variant="outline" size="icon" aria-label="Aumentar quantidade" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty}><Plus className="h-4 w-4" /></Button>
                  </div>
                )}
              </Field>
              <div className="rounded-2xl bg-paper-soft p-4 text-sm" aria-live="polite">
                <div className="flex justify-between"><span className="text-fg-muted">Preço unitário</span><span>{formatKz(quote?.unit_price_kz ?? type?.price_kz)}</span></div>
                <div className="mt-1 flex items-end justify-between">
                  <span className="text-fg-muted">Total</span>
                  <span className="font-display text-2xl font-semibold text-gold-metal">{quoting && !quote ? '…' : formatKz(quote?.total_kz)}</span>
                </div>
                <p className="mt-1 text-[11px] text-fg-muted">Total confirmado pelo servidor.</p>
              </div>
            </div>
            {quoteError && <Alert tone="bad">{quoteError}</Alert>}
            <Button size="lg" className="w-full" disabled={!quote || quoting || quote.quantity !== quantity} onClick={() => go('dados')}>
              Continuar <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </motion.section>
        )}

        {step === 'dados' && (
          <motion.form key="dados" {...motionProps} onSubmit={submit} noValidate className={cn(panel, 'space-y-5')} aria-labelledby="co-dados">
            <h2 id="co-dados" className="font-display text-2xl font-semibold md:text-3xl">2. Dados do comprador</h2>
            {summary}
            <Field label="Nome completo" required error={errors.fullName}>
              {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} invalid={!!errors.fullName} maxLength={120} />}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Email" required error={errors.email} hint="Recebe aqui a confirmação e os bilhetes.">
                {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} maxLength={254} />}
              </Field>
              <Field label="Telefone" required error={errors.phone}>
                {(id, d) => <PhoneInput id={id} describedBy={d} country={country} onCountry={setCountry} value={phone} onChange={setPhone} invalid={!!errors.phone} />}
              </Field>
            </div>
            {type && type.persons_per_ticket > 1 && (
              <Field label="Número total de convidados" required error={errors.guestsTotal} hint={`Cada bilhete admite até ${type.persons_per_ticket} pessoas`}>
                {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={guests} onChange={(e) => setGuests(Number(e.target.value.replace(/\D/g, '')) || 0)} invalid={!!errors.guestsTotal} />}
              </Field>
            )}
            <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
              <label>Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
            </div>
            <div>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-fg/80">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent || undefined}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-gold/40 accent-[rgb(var(--gold))]" />
                <span>
                  Li e aceito os <Link to="/termos" target="_blank" className="font-semibold text-gold-deep underline">Termos e Condições</Link> e autorizo a utilização dos meus dados apenas para esta compra, pagamento, emissão dos bilhetes e comunicações sobre o evento (
                  <Link to="/privacidade" target="_blank" className="font-semibold text-gold-deep underline">Política de Privacidade</Link>).
                </span>
              </label>
              {errors.consent && <p role="alert" className="mt-2 text-xs font-medium text-rose-800">{errors.consent}</p>}
            </div>
            {submitError && (
              <Alert tone="bad">
                {submitError}
                {duplicate && <> <Link to="/consultar" className="font-semibold underline">Consultar pedido existente</Link></>}
              </Alert>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" onClick={() => go('selecao')} disabled={submitting}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
              <Button type="submit" size="lg" className="flex-1" loading={submitting}><Lock className="h-4 w-4" /> Confirmar pedido e ver pagamento</Button>
            </div>
            <p className="flex items-start gap-2 text-xs text-fg-muted">
              <ShieldCheck className="h-4 w-4 shrink-0 text-gold" aria-hidden />
              O pedido fica reservado durante {s.reservation_hours} horas. O bilhete com QR Code é emitido apenas depois da validação do pagamento pela equipa financeira.
            </p>
          </motion.form>
        )}

        {step === 'pagamento' && order && access && (
          <motion.section key="pagamento" {...motionProps} className="space-y-4" aria-label="Instruções de pagamento">
            <Alert tone="ok" title={`Pedido ${order.order_code} registado`}>
              Utilize <strong>{order.order_code}</strong> como referência/descritivo da transferência.
            </Alert>
            {summary}
            <BankCard
              method={method}
              onMethod={chooseMethod}
              confirmed={order.payment.confirmed}
              bankName={order.payment.bank_name}
              accountName={order.payment.account_name}
              accountNumber={order.payment.account_number}
              iban={order.payment.iban}
              expressNumber={order.payment.express_number}
              amount={order.total_kz}
              reference={order.order_code}
            />
            {order.payment.confirmed && (
              <ol className="list-decimal space-y-1 rounded-2xl bg-paper-soft p-4 pl-8 text-sm text-fg-muted">
                <li>Transfira <strong className="text-fg">exactamente {formatKz(order.total_kz)}</strong> para a conta acima.</li>
                <li>No descritivo indique <strong className="text-fg">{order.order_code}</strong>.</li>
                <li>Guarde o comprovativo (PDF, JPG ou PNG) e anexe-o no passo seguinte.</li>
              </ol>
            )}
            {order.payment.instructions && <p className="text-xs leading-relaxed text-fg-muted">{order.payment.instructions}</p>}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to={orderPath(order.order_code, access.token)} onClick={onClose} className={cn(buttonVariants({ variant: 'outline' }), 'sm:flex-1')}>
                Pagar mais tarde (guardar ligação)
              </Link>
              <Button size="lg" className="sm:flex-[2]" disabled={!order.payment.confirmed} onClick={() => go('comprovativo')}>
                Já transferi — anexar comprovativo <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </motion.section>
        )}

        {step === 'comprovativo' && order && access && (
          <motion.section key="comprovativo" {...motionProps} className="space-y-4" aria-label="Comprovativo">
            {summary}
            <ProofUpload
              code={order.order_code}
              token={access.token}
              method={method}
              onUploaded={async () => {
                await loadOrder(access.code, access.token).catch(() => undefined);
                go('concluido');
              }}
            />
            <Button variant="ghost" onClick={() => go('pagamento')}><ArrowLeft className="h-4 w-4" /> Rever dados de pagamento</Button>
          </motion.section>
        )}

        {step === 'concluido' && order && access && (
          <motion.section key="concluido" {...motionProps} className={cn(panel, 'space-y-5 text-center')} aria-labelledby="co-fim">
            <CheckCircle2 className="mx-auto h-12 w-12 text-gold" aria-hidden />
            <h2 id="co-fim" className="font-display text-2xl font-semibold md:text-3xl">Comprovativo enviado</h2>
            <p className="font-mono text-2xl font-bold tracking-wider">{order.order_code}</p>
            <StatusBadge status={order.status} className="text-sm" />
            <p className="mx-auto max-w-md text-sm text-fg-muted">
              <strong className="text-fg">O comprovativo ainda não confirma o pagamento.</strong> A equipa financeira vai verificar a entrada do valor.
              Depois da aprovação, os bilhetes com QR Code ficam disponíveis na página do pedido e são enviados para {order.email_masked}.
            </p>
            {summary}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link to={orderPath(order.order_code, access.token)} onClick={onClose} className={buttonVariants({ size: 'lg' })}>Acompanhar o pedido</Link>
              {onClose && <Button variant="outline" onClick={onClose}>Fechar</Button>}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function Cell({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-muted">{k}</dt>
      <dd className="truncate text-fg">{v}</dd>
    </div>
  );
}
