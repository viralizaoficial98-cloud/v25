import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { CountryCode } from 'libphonenumber-js/min';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Lock, MapPin, Minus, Plus, Ticket } from 'lucide-react';
import { Alert, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { PhoneInput } from '@/components/vip/PhoneInput';
import { CheckoutSteps } from '@/components/order/CheckoutSteps';
import { createOrder, fetchTicketTypes } from '@/lib/api';
import { CONSENT_VERSION } from '@/lib/config';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatEventDate, formatEventTime, formatKz } from '@/lib/format';
import { orderPath, saveOrderAccess } from '@/lib/orderAccess';
import { normalizePhone, registrationSchema, validateQuantities } from '@/lib/validation';
import { useAsync } from '@/hooks/useAsync';
import { useSettings } from '@/hooks/useSettings';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/cn';

function uuid() {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type Errors = Partial<Record<'fullName' | 'email' | 'phone' | 'ticketTypeId' | 'quantity' | 'guestsTotal' | 'consent', string>>;
type Step = 'selecao' | 'dados' | 'resumo';
const STEP_INDEX: Record<Step, number> = { selecao: 0, dados: 1, resumo: 2 };
const SELECTION_FIELDS: (keyof Errors)[] = ['ticketTypeId', 'quantity', 'guestsTotal'];

/**
 * Etapas 1–3 do checkout (seleção, dados, resumo). O pedido só é criado no fim; o
 * total é sempre recalculado no servidor a partir do preço em vigor.
 * As etapas 4 (pagamento) e 5 (confirmação) decorrem na página do pedido.
 */
export default function Checkout() {
  useDocumentTitle('Comprar ingresso · V25 — O Legado');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { settings: s } = useSettings();
  const mode = params.get('modo') === 'reserva' ? 'reserva' : 'compra';
  const { data: types = [], loading, error: loadError } = useAsync(fetchTicketTypes, []);
  const saleable = types.filter((t) => t.sale_mode !== 'consulta' && t.on_sale && t.available > 0);

  const [typeId, setTypeId] = useState(params.get('tipo') ?? '');
  const [quantity, setQuantity] = useState(1);
  const [guests, setGuests] = useState(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<CountryCode>('AO');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState<Step>('selecao');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const idempotencyKey = useRef(uuid());

  useEffect(() => {
    if (saleable.length && !saleable.some((t) => t.id === typeId)) setTypeId(saleable[0].id);
  }, [saleable, typeId]);

  const type = saleable.find((t) => t.id === typeId);
  const maxQty = type ? Math.max(1, Math.min(type.max_per_order, type.available)) : 1;
  useEffect(() => {
    if (type) setQuantity((q) => Math.min(Math.max(q, 1), maxQty));
  }, [type, maxQty]);
  useEffect(() => {
    if (type) setGuests(quantity * type.persons_per_ticket);
  }, [quantity, type]);

  const subtotal = type?.price_kz ? type.price_kz * quantity : 0;

  const validate = (only?: (keyof Errors)[]): boolean => {
    const r = registrationSchema.safeParse({ fullName, email, phoneCountry: country, phone, ticketTypeId: typeId, quantity, guestsTotal: guests, consent });
    let e: Errors = {};
    if (!r.success) {
      for (const issue of r.error.issues) {
        const k = issue.path[0] as keyof Errors;
        if (!e[k]) e[k] = issue.message;
      }
    }
    if (type) Object.assign(e, validateQuantities(quantity, guests, type));
    if (only) e = Object.fromEntries(Object.entries(e).filter(([k]) => only.includes(k as keyof Errors)));
    setErrors(e);
    if (Object.keys(e).length) requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    return Object.keys(e).length === 0;
  };

  const go = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toDados = () => validate(SELECTION_FIELDS) && go('dados');
  const toResumo = (ev: FormEvent) => {
    ev.preventDefault();
    if (validate()) go('resumo');
  };

  const submit = async () => {
    if (submitting || !type) return;
    if (!validate()) {
      go('dados');
      return;
    }
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
      navigate(orderPath(r.order_code, r.access_token), { replace: true });
    } catch (e) {
      setSubmitError(errorMessage(e));
      setDuplicate(errorCode(e) === 'PEDIDO_DUPLICADO');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Shell><Spinner label="A preparar a compra…" /></Shell>;
  if (loadError) return <Shell><Alert tone="bad">{errorMessage(loadError)}</Alert></Shell>;
  if (!s.sales_open || saleable.length === 0) {
    return (
      <Shell>
        <Alert tone="info" title={s.sales_closed_message || 'A AGUARDAR ABERTURA DAS VENDAS'}>
          Não existem ingressos à venda neste momento. <Link to="/#ingressos" className="font-semibold underline">Voltar aos ingressos</Link>.
        </Alert>
      </Shell>
    );
  }

  const summary = (
    <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Resumo do pedido">
      <div className="rounded-[1.75rem] border border-gold/30 bg-paper p-6 shadow-card">
        <p className="eyebrow">Resumo</p>
        <p className="mt-3 font-display text-2xl font-semibold">{s.event_name}</p>
        <p className="mt-1 text-sm text-fg-muted">{formatEventDate(s.starts_at)} · {formatEventTime(s.starts_at)}</p>
        <p className="text-sm text-fg-muted">{s.venue}</p>
        <div className="hairline my-5" />
        {type ? (
          <dl className="space-y-3 text-sm">
            <Row k="Categoria" v={<strong>{type.name}{type.lot_label ? ` · ${type.lot_label}` : ''}</strong>} />
            <Row k="Preço unitário" v={formatKz(type.price_kz)} />
            <Row k="Quantidade" v={`× ${quantity}`} />
            {type.persons_per_ticket > 1 && <Row k="Convidados" v={guests} />}
            <Row k="Subtotal" v={formatKz(subtotal)} />
            <div className="hairline" />
            <div className="flex items-end justify-between gap-4">
              <dt className="font-semibold text-fg">Total</dt>
              <dd className="font-display text-3xl font-semibold text-gold-metal" aria-live="polite">{formatKz(subtotal)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">Escolha uma categoria.</p>
        )}
        <p className="mt-5 text-[11px] leading-snug text-fg-muted">Valores em Kwanzas, confirmados pelo servidor ao criar o pedido.</p>
      </div>
    </aside>
  );

  return (
    <Shell title={mode === 'reserva' ? 'Reservar lugar' : 'Comprar ingresso'}>
      <CheckoutSteps current={STEP_INDEX[step]} />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {step === 'selecao' && (
          <section className="space-y-6 rounded-[1.75rem] border border-fg/10 bg-paper p-6 shadow-soft md:p-8" aria-labelledby="sel-t">
            <h2 id="sel-t" className="text-3xl font-semibold">1. Escolha o seu ingresso</h2>
            <div role="radiogroup" aria-label="Categoria de ingresso" className="grid gap-3">
              {saleable.map((t) => {
                const active = t.id === typeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTypeId(t.id)}
                    className={cn(
                      'flex items-center justify-between gap-4 rounded-2xl border p-5 text-left transition',
                      active ? 'border-gold bg-gold-pale/50 ring-1 ring-gold/40' : 'border-fg/15 hover:border-gold/60',
                    )}
                  >
                    <span className="flex items-start gap-3">
                      <span className={cn('mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', active ? 'border-gold bg-gold text-paper' : 'border-fg/30')}>
                        {active && <Check className="h-3 w-3" aria-hidden />}
                      </span>
                      <span>
                        <span className="block font-display text-2xl font-semibold">{t.name}</span>
                        {t.benefits.length > 0 && <span className="mt-1 block text-xs text-fg-muted">{t.benefits.slice(0, 3).join(' · ')}</span>}
                        <span className="mt-1 block text-xs text-fg-muted">{t.available} disponíveis · máx. {t.max_per_order} por pedido</span>
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-2xl font-semibold text-gold-deep">{formatKz(t.price_kz)}</span>
                  </button>
                );
              })}
            </div>
            {errors.ticketTypeId && <p role="alert" className="text-xs font-medium text-rose-800">{errors.ticketTypeId}</p>}

            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Quantidade" required error={errors.quantity} hint={type ? `Máximo ${maxQty} neste pedido` : undefined}>
                {(id, d) => (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" aria-label="Diminuir quantidade" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input id={id} aria-describedby={d} inputMode="numeric" className="text-center text-lg font-semibold" value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, Number(e.target.value.replace(/\D/g, '')) || 1)))} invalid={!!errors.quantity} />
                    <Button variant="outline" size="icon" aria-label="Aumentar quantidade" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Field>
              {type && type.persons_per_ticket > 1 && (
                <Field label="Número total de convidados" required error={errors.guestsTotal} hint={`Cada ingresso admite até ${type.persons_per_ticket} pessoas`}>
                  {(id, d) => (
                    <Input id={id} aria-describedby={d} inputMode="numeric" value={guests} onChange={(e) => setGuests(Number(e.target.value.replace(/\D/g, '')) || 0)} invalid={!!errors.guestsTotal} />
                  )}
                </Field>
              )}
            </div>
            <Button size="lg" className="w-full" onClick={toDados}>
              Continuar <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </section>
        )}

        {step === 'dados' && (
          <form onSubmit={toResumo} noValidate className="space-y-6 rounded-[1.75rem] border border-fg/10 bg-paper p-6 shadow-soft md:p-8" aria-labelledby="dados-t">
            <h2 id="dados-t" className="text-3xl font-semibold">2. Os seus dados</h2>
            <Field label="Nome completo" required error={errors.fullName}>
              {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} invalid={!!errors.fullName} maxLength={120} />}
            </Field>
            <Field label="Email" required error={errors.email} hint="Enviaremos para aqui a confirmação e os ingressos.">
              {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} maxLength={254} />}
            </Field>
            <Field label="Telefone" required error={errors.phone}>
              {(id, d) => <PhoneInput id={id} describedBy={d} country={country} onCountry={setCountry} value={phone} onChange={setPhone} invalid={!!errors.phone} />}
            </Field>
            <Field label="Quantidade de ingressos">
              {(id) => <Input id={id} value={`${quantity} × ${type?.name ?? ''}`} readOnly className="bg-paper-soft" />}
            </Field>

            {/* Armadilha anti-spam: invisível para pessoas */}
            <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
              <label>Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-fg/80">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent || undefined}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-gold/40 accent-[rgb(var(--gold))]" />
                <span>
                  Li e aceito os <Link to="/termos" target="_blank" className="font-semibold text-gold-deep underline">Termos e Condições</Link> e autorizo a utilização dos meus dados (nome, email e telefone) exclusivamente para a gestão desta compra, pagamento, emissão de ingressos e comunicações sobre o evento, nos termos da{' '}
                  <Link to="/privacidade" target="_blank" className="font-semibold text-gold-deep underline">Política de Privacidade</Link>.
                </span>
              </label>
              {errors.consent && <p role="alert" className="mt-2 text-xs font-medium text-rose-800">{errors.consent}</p>}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="ghost" onClick={() => go('selecao')}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
              <Button type="submit" size="lg" className="flex-1">Rever o pedido <ArrowRight className="h-4 w-4" aria-hidden /></Button>
            </div>
          </form>
        )}

        {step === 'resumo' && type && (
          <section className="space-y-6 rounded-[1.75rem] border border-fg/10 bg-paper p-6 shadow-soft md:p-8" aria-labelledby="resumo-t">
            <h2 id="resumo-t" className="text-3xl font-semibold">3. Confirme o seu pedido</h2>
            <div className="rounded-2xl bg-paper-soft p-5">
              <p className="flex items-center gap-2 font-display text-2xl font-semibold"><Ticket className="h-5 w-5 text-gold" aria-hidden /> {type.name}</p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <Row k="Preço unitário" v={formatKz(type.price_kz)} />
                <Row k="Quantidade" v={quantity} />
                <Row k="Subtotal" v={formatKz(subtotal)} />
                <Row k="Total a pagar" v={<strong className="text-gold-deep">{formatKz(subtotal)}</strong>} />
              </dl>
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-muted">
                <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-gold" aria-hidden />{formatEventDate(s.starts_at)} · {formatEventTime(s.starts_at)}</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-gold" aria-hidden />{s.venue}, {s.address.replace(/, Angola$/, '')}</span>
              </p>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              {[
                ['Nome', fullName.trim().replace(/\s+/g, ' ')],
                ['Email', email.trim().toLowerCase()],
                ['Telefone', normalizePhone(phone, country) ?? phone],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">{k}</dt>
                  <dd className="mt-1 break-words font-semibold text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <Alert tone="info" title="Próximo passo: pagamento">
              Ao confirmar, é criado um pedido com número único e são-lhe apresentados os dados para pagamento por <strong>Transferência Bancária</strong> ou <strong>Transferência Express</strong>.
              O lugar fica reservado durante {s.reservation_hours} horas. O ingresso é emitido apenas depois de a equipa financeira confirmar o pagamento.
            </Alert>
            {submitError && (
              <Alert tone="bad">
                {submitError}
                {duplicate && <> <Link to="/consultar" className="font-semibold underline">Consultar pedido existente</Link></>}
              </Alert>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" onClick={() => go('dados')} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" /> Voltar e corrigir
              </Button>
              <Button size="lg" className="flex-1" loading={submitting} onClick={submit}>
                <Lock className="h-4 w-4" /> Confirmar e avançar para pagamento
              </Button>
            </div>
          </section>
        )}

        {summary}
      </div>
    </Shell>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg-muted">{k}</dt>
      <dd className="text-right text-fg">{v}</dd>
    </div>
  );
}

function Shell({ children, title = 'Comprar ingresso' }: { children: ReactNode; title?: string }) {
  return (
    <div className="container max-w-6xl pb-24 pt-28 md:pt-36">
      <Link to="/#ingressos" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-fg-muted hover:text-gold-deep">
        <ArrowLeft className="h-4 w-4" /> Voltar aos ingressos
      </Link>
      <h1 className="mb-6 text-4xl font-semibold md:text-6xl">{title}</h1>
      {children}
    </div>
  );
}
