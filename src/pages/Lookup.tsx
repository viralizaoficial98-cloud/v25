import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { requestOrderAccess } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { forgetOrderAccess, orderPath, savedOrders } from '@/lib/orderAccess';
import { isBackendConfigured } from '@/lib/supabase';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Lookup() {
  useDocumentTitle('Consultar pedido · V25 — O Legado');
  const [saved, setSaved] = useState(savedOrders);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim())) {
      setError('Indique um email válido.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestOrderAccess(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-3xl pb-24 pt-28 md:pt-36">
      <p className="eyebrow">Área do participante</p>
      <h1 className="mt-3 text-5xl font-semibold md:text-6xl">Consultar pedido</h1>
      <p className="mt-4 text-cream/65">Por segurança, cada pedido só pode ser aberto através da ligação privada criada na inscrição.</p>

      {saved.length > 0 && (
        <section className="mt-10" aria-labelledby="neste-dispositivo">
          <h2 id="neste-dispositivo" className="text-2xl font-semibold">Pedidos neste dispositivo</h2>
          <ul className="mt-4 space-y-2">
            {saved.map((o) => (
              <li key={o.code} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink-800/60 px-5 py-4">
                <Link to={orderPath(o.code, o.token)} className="flex flex-1 items-center justify-between gap-3 hover:text-gold-light">
                  <span>
                    <span className="font-mono text-lg font-bold tracking-wider">{o.code}</span>
                    <span className="block text-xs text-cream/45">Guardado em {formatDateTime(o.savedAt)}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 text-gold" />
                </Link>
                <button
                  type="button"
                  aria-label={`Esquecer ${o.code} neste dispositivo`}
                  className="rounded-full p-2 text-cream/40 hover:bg-white/5 hover:text-rose-200"
                  onClick={() => {
                    forgetOrderAccess(o.code);
                    setSaved(savedOrders());
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 rounded-[1.75rem] border border-gold/20 bg-ink-800/60 p-6 md:p-8" aria-labelledby="recuperar">
        <h2 id="recuperar" className="flex items-center gap-2 text-2xl font-semibold"><Mail className="h-5 w-5 text-gold" /> Recuperar acesso por email</h2>
        <p className="mt-2 text-sm text-cream/60">Indique o email usado na inscrição. Se existirem pedidos associados, enviaremos novas ligações seguras para esse endereço.</p>
        {!isBackendConfigured ? (
          <Alert tone="warn" className="mt-5">Funcionalidade indisponível: integração com o servidor pendente.</Alert>
        ) : sent ? (
          <Alert tone="ok" className="mt-5" title="Pedido recebido">
            Se o email tiver pedidos associados, receberá as ligações em breve. Verifique também a pasta de spam. Se não receber nada, contacte a organização.
          </Alert>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <Field label="Email" error={error ?? undefined}>
              {(id, d) => <Input id={id} aria-describedby={d} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} />}
            </Field>
            <Button type="submit" loading={busy}>Enviar ligações</Button>
          </form>
        )}
      </section>
    </div>
  );
}
