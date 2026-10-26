import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CountryCode } from 'libphonenumber-js/min';
import { Crown, Send } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { createVipRequest } from '@/lib/api';
import { CONSENT_VERSION } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { saveVipAccess, vipPath } from '@/lib/orderAccess';
import { normalizePhone, vipRequestSchema } from '@/lib/validation';
import { PhoneInput } from './PhoneInput';

type Errors = Partial<Record<'fullName' | 'email' | 'phone' | 'participants' | 'message' | 'consent', string>>;

/**
 * Solicitação de acesso VIP. Não há preço público nem pagamento neste passo:
 * a organização analisa o pedido e envia uma proposta; só depois de o cliente
 * a aceitar é criado o pedido de pagamento.
 */
export function VipRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState<CountryCode>('AO');
  const [phone, setPhone] = useState('');
  const [participants, setParticipants] = useState('1');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const r = vipRequestSchema.safeParse({ fullName, email, phoneCountry: country, phone, participants: Number(participants) || 0, message, consent });
    const e: Errors = {};
    if (!r.success) {
      for (const i of r.error.issues) {
        const k = i.path[0] as keyof Errors;
        if (!e[k]) e[k] = i.message;
      }
    }
    setErrors(e);
    if (!r.success) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const res = await createVipRequest({
        fullName: r.data.fullName,
        email: r.data.email,
        phone: normalizePhone(phone, country)!,
        participants: r.data.participants,
        message: r.data.message.trim(),
        consentVersion: CONSENT_VERSION,
        honeypot,
      });
      saveVipAccess(res.request_code, res.access_token);
      onOpenChange(false);
      navigate(vipPath(res.request_code, res.access_token));
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-xl"
      title={<span className="flex items-center gap-2"><Crown className="h-5 w-5 text-gold" aria-hidden /> Solicitar acesso VIP</span>}
      description="O acesso VIP é limitado e depende da aprovação da organização. Não é feito nenhum pagamento neste passo."
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field label="Nome completo" required error={errors.fullName}>
          {(id, d) => <Input id={id} aria-describedby={d} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} invalid={!!errors.fullName} maxLength={120} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <Field label="Email" required error={errors.email}>
            {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} maxLength={254} />}
          </Field>
          <Field label="Participantes" required error={errors.participants}>
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={participants} onChange={(e) => setParticipants(e.target.value.replace(/\D/g, '').slice(0, 3))} invalid={!!errors.participants} />}
          </Field>
        </div>
        <Field label="Telefone" required error={errors.phone}>
          {(id, d) => <PhoneInput id={id} describedBy={d} country={country} onCountry={setCountry} value={phone} onChange={setPhone} invalid={!!errors.phone} />}
        </Field>
        <Field label="Mensagem (opcional)" error={errors.message} hint="Ex.: mesa para família, necessidades especiais, empresa, etc.">
          {(id, d) => <Textarea id={id} aria-describedby={d} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1500} invalid={!!errors.message} />}
        </Field>

        <div aria-hidden className="absolute left-[-9999px] h-px w-px overflow-hidden">
          <label>Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-fg/80">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent || undefined}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-gold/40 accent-[rgb(var(--gold))]" />
            <span>
              Aceito os <Link to="/termos" target="_blank" className="font-semibold text-gold-deep underline">Termos</Link> e autorizo a utilização dos meus dados para a análise desta solicitação, nos termos da{' '}
              <Link to="/privacidade" target="_blank" className="font-semibold text-gold-deep underline">Política de Privacidade</Link>.
            </span>
          </label>
          {errors.consent && <p role="alert" className="mt-2 text-xs font-medium text-rose-800">{errors.consent}</p>}
        </div>

        {failure && <Alert tone="bad">{failure}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          <Send className="h-4 w-4" aria-hidden /> Enviar solicitação
        </Button>
      </form>
    </Dialog>
  );
}
