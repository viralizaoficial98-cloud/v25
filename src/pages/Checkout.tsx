import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js/min';
import { ArrowLeft, Lock, Minus, Plus } from 'lucide-react';
import { Alert, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { createOrder, fetchTicketTypes } from '@/lib/api';
import { CONSENT_VERSION } from '@/lib/config';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatEventDate, formatEventTime, formatKz } from '@/lib/format';
import { orderPath, saveOrderAccess } from '@/lib/orderAccess';
import { normalizePhone, registrationSchema, validateQuantities } from '@/lib/validation';
import { useAsync } from '@/hooks/useAsync';
import { useSettings } from '@/hooks/useSettings';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const PRIORITY: CountryCode[] = ['AO', 'PT', 'BR', 'MZ', 'CV', 'ST', 'NA', 'ZA', 'GB', 'FR', 'US', 'CH', 'DE', 'NL', 'BE', 'LU', 'CA'];

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

export default function Checkout() {
  useDocumentTitle('Inscrição · V25 — O Legado');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { settings: s } = useSettings();
  const mode = params.get('modo') === 'reserva' ? 'reserva' : 'compra';
  const { data: types = [], loading, error: loadError } = useAsync(fetchTicketTypes, []);
  const saleable = types.filter((t) => t.on_sale && t.available > 0);

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
  const [step, setStep] = useState<'dados' | 'revisao'>('dados');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const idempotencyKey = useRef(uuid());

  useEffect(() => {
    if (!typeId && saleable.length) setTypeId(saleable[0].id);
  }, [saleable, typeId]);

  const type = types.find((t) => t.id === typeId);
  const maxQty = type ? Math.max(1, Math.min(type.max_per_order, type.available)) : 1;
  useEffect(() => {
    if (!type) return;
    setQuantity((q) => Math.min(Math.max(q, 1), maxQty));
  }, [type, maxQty]);
  useEffect(() => {
    // Por omissão: 1 convidado por pessoa admitida
    if (type) setGuests(quantity * (type.persons_per_ticket === 1 ? 1 : type.persons_per_ticket));
  }, [quantity, type]);

  const total = type?.price_kz ? type.price_kz * quantity : 0;

  const countries = useMemo(() => {
    const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['pt-PT'], { type: 'region' }) : null;
    const label = (c: CountryCode) => `${names?.of(c) ?? c} (+${getCountryCallingCode(c)})`;
    const rest = getCountries().filter((c) => !PRIORITY.includes(c)).sort((a, b) => label(a).localeCompare(label(b), 'pt'));
    return [...PRIORITY, ...rest].map((c) => ({ code: c, label: label(c) }));
  }, []);

  const validate = (): boolean => {
    const r = registrationSchema.safeParse({ fullName, email, phoneCountry: country, phone, ticketTypeId: typeId, quantity, guestsTotal: guests, consent });
    const e: Errors = {};
    if (!r.success) {
      for (const issue of r.error.issues) {
        const k = issue.path[0] as keyof Errors;
        if (!e[k]) e[k] = issue.message;
      }
    }
    if (type) Object.assign(e, validateQuantities(quantity, guests, type));
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const toReview = (ev: FormEvent) => {
    ev.preventDefault();
    if (validate()) {
      setStep('revisao');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    }
  };

  const submit = async () => {
    if (submitting || !type) return;
    if (!validate()) {
      setStep('dados');
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

  if (loading) return <Shell><Spinner label="A preparar a inscrição…" /></Shell>;
  if (loadError) return <Shell><Alert tone="bad">{errorMessage(loadError)}</Alert></Shell>;
  if (!s.sales_open || saleable.length === 0) {
    return (
      <Shell>
        <Alert tone="info" title={s.sales_closed_message || 'A AGUARDAR ABERTURA DAS VENDAS'}>
          Não existem ingressos à venda neste momento. <Link to="/#ingressos" className="underline">Voltar aos ingressos</Link>.
        </Alert>
      </Shell>
    );
  }

  return (
    <Shell title={mode === 'reserva' ? 'Reservar lugar' : 'Comprar ingresso'}>
      <ol className="mb-8 flex gap-2 text-xs font-semibold uppercase tracking-[0.18em]" aria-label="Passos">
        {[
          ['dados', '1. Inscrição'],
          ['revisao', '2. Revisão'],
          ['pagamento', '3. Pagamento'],
        ].map(([k, l]) => (
          <li key={k} aria-current={step === k ? 'step' : undefined} className={step === k ? 'text-gold-light' : 'text-fg/35'}>
            {l}
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {step === 'dados' ? (
          <form onSubmit={toReview} noValidate className="space-y-6 rounded-[1.75rem] border border-fg/10 bg-paper-soft/60 p-6 md:p-8">
            <Field label="Categoria de ingresso" required error={errors.ticketTypeId}>
              {(id, d) => (
                <Select id={id} aria-describedby={d} value={typeId} onChange={(e) => setTypeId(e.target.value)} invalid={!!errors.ticketTypeId}>
                  {saleable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.lot_label ? ` (${t.lot_label})` : ''} — {formatKz(t.price_kz)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Quantidade" required error={errors.quantity} hint={type ? `Máximo ${maxQty} neste pedido` : undefined}>
                {(id, d) => (
                  <div className="flex items-center gap-2">
                    <Button variant="subtle" size="icon" aria-label="Diminuir quantidade" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input id={id} aria-describedby={d} inputMode="numeric" className="text-center" value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(maxQty, Number(e.target.value.replace(/\D/g, '')) || 1)))} invalid={!!errors.quantity} />
                    <Button variant="subtle" size="icon" aria-label="Aumentar quantidade" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Field>
              <Field
                label="Número total de convidados"
                required
                error={errors.guestsTotal}
                hint={type && type.persons_per_ticket > 1 ? `Cada ingresso admite até ${type.persons_per_ticket} pessoas` : 'Um convidado por ingresso'}
              >
                {(id, d) => (
                  <Input id={id} aria-describedby={d} inputMode="numeric" value={guests} readOnly={!type || type.persons_per_ticket === 1}
                    onChange={(e) => setGuests(Number(e.target.value.replace(/\D/g, '')) || 0)} invalid={!!errors.guestsTotal} />
                )}
              </Field>
            </div>

            <div className="hairline" />

            <Field label="Nome completo" required error={errors.fullName}>
              {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} invalid={!!errors.fullName} maxLength={120} />}
            </Field>
            <Field label="Email" required error={errors.email} hint="Enviaremos para aqui a confirmação e os ingressos.">
              {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} maxLength={254} />}
            </Field>
            <Field label="Telefone" required error={errors.phone}>
              {(id, d) => (
                <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-2">
                  <Select aria-label="Indicativo do país" value={country} onChange={(e) => setCountry(e.target.value as CountryCode)}>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </Select>
                  <Input id={id} aria-describedby={d} type="tel" autoComplete="tel-national" inputMode="tel" placeholder={country === 'AO' ? '9XX XXX XXX' : ''} value={phone} onChange={(e) => setPhone(e.target.value)} invalid={!!errors.phone} />
                </div>
              )}
            </Field>

            {/* Armadilha anti-spam: invisível para pessoas */}
            <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
              <label>Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-fg/75">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent || undefined}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-gold/40 bg-paper-muted accent-[#c9a45c]" />
                <span>
                  Autorizo a utilização dos meus dados pessoais (nome, email e telefone) exclusivamente para a gestão desta inscrição, pagamento, emissão de ingressos e comunicações sobre o evento, nos termos da{' '}
                  <Link to="/privacidade" target="_blank" className="text-gold-light underline">Política de Privacidade</Link>.
                </span>
              </label>
              {errors.consent && <p role="alert" className="mt-2 text-xs font-medium text-rose-800">{errors.consent}</p>}
            </div>

            <Button type="submit" size="lg" className="w-full">Continuar para revisão</Button>
          </form>
        ) : (
          <div className="space-y-6 rounded-[1.75rem] border border-fg/10 bg-paper-soft/60 p-6 md:p-8">
            <h2 className="text-3xl font-semibold">Confirme os seus dados</h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              {[
                ['Nome', fullName.trim().replace(/\s+/g, ' ')],
                ['Email', email.trim().toLowerCase()],
                ['Telefone', normalizePhone(phone, country) ?? phone],
                ['Convidados', String(guests)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-[0.2em] text-fg/45">{k}</dt>
                  <dd className="mt-1 break-words font-semibold text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <Alert tone="info" title="Como funciona o pagamento">
              Ao confirmar, é criado um pedido com código único e {mode === 'reserva' ? 'o seu lugar fica reservado' : 'recebe os dados bancários'} durante {s.reservation_hours} horas. Faça a transferência, carregue o comprovativo e aguarde a validação manual. O ingresso é emitido apenas após a confirmação do pagamento.
            </Alert>
            {submitError && (
              <Alert tone="bad">
                {submitError}
                {duplicate && <> <Link to="/consultar" className="font-semibold underline">Consultar pedido existente</Link></>}
              </Alert>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="ghost" onClick={() => setStep('dados')} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" /> Editar dados
              </Button>
              <Button size="lg" className="flex-1" loading={submitting} onClick={submit}>
                <Lock className="h-4 w-4" /> {mode === 'reserva' ? 'Confirmar reserva' : 'Confirmar pedido'}
              </Button>
            </div>
          </div>
        )}

        <aside className="lg:sticky lg:top-28 lg:self-start" aria-label="Resumo do pedido">
          <div className="rounded-[1.75rem] border border-gold/30 bg-gradient-to-b from-espresso/80 to-paper-soft p-6">
            <p className="eyebrow">Resumo do pedido</p>
            <p className="mt-3 font-display text-2xl">{s.event_name}</p>
            <p className="mt-1 text-sm text-fg/55">{formatEventDate(s.starts_at)} · {formatEventTime(s.starts_at)} · {s.venue}</p>
            <div className="hairline my-5" />
            {type ? (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-fg/60">Categoria</dt><dd className="text-right font-semibold">{type.name}{type.lot_label ? ` · ${type.lot_label}` : ''}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-fg/60">Preço unitário</dt><dd>{formatKz(type.price_kz)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-fg/60">Quantidade</dt><dd>× {quantity}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-fg/60">Convidados</dt><dd>{guests}</dd></div>
                <div className="hairline" />
                <div className="flex items-end justify-between gap-4">
                  <dt className="text-fg/60">Total</dt>
                  <dd className="font-display text-3xl text-gold-metal" aria-live="polite">{formatKz(total)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-fg/50">Escolha uma categoria.</p>
            )}
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children, title = 'Inscrição' }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="container max-w-6xl pb-24 pt-28 md:pt-36">
      <Link to="/#ingressos" className="mb-6 inline-flex items-center gap-2 text-sm text-fg/60 hover:text-gold-light">
        <ArrowLeft className="h-4 w-4" /> Voltar aos ingressos
      </Link>
      <h1 className="mb-6 text-5xl font-semibold md:text-6xl">{title}</h1>
      {children}
    </div>
  );
}
