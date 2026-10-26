import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock3, Link2, MapPin, RefreshCw, XCircle } from 'lucide-react';
import { Alert, CopyButton, Spinner, StatusBadge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { BankCard } from '@/components/order/BankCard';
import { ProofUpload } from '@/components/order/ProofUpload';
import { TicketList } from '@/components/order/TicketList';
import { cancelOrder, confirmReservation, getOrder, setPaymentMethod } from '@/lib/api';
import { CheckoutSteps } from '@/components/order/CheckoutSteps';
import type { PaymentMethod } from '@/lib/types';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatEventDate, formatEventTime, formatKz } from '@/lib/format';
import { orderUrl, saveOrderAccess, tokenFor, tokenFromHash } from '@/lib/orderAccess';
import { ORDER_STATUS } from '@/lib/status';
import { useAsync } from '@/hooks/useAsync';
import { useSettings } from '@/hooks/useSettings';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function OrderPage() {
  const { code = '' } = useParams();
  const { hash } = useLocation();
  const { settings } = useSettings();
  const upperCode = code.toUpperCase();
  const [token] = useState(() => tokenFromHash(hash) ?? tokenFor(upperCode));
  useDocumentTitle(`Pedido ${upperCode} · V25 — O Legado`);

  useEffect(() => {
    if (token) saveOrderAccess(upperCode, token);
  }, [token, upperCode]);

  const { data: order, error, loading, reload } = useAsync(() => (token ? getOrder(upperCode, token) : Promise.reject(new Error('ACESSO_INVALIDO'))), [upperCode, token]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading && !order) return <Wrap><Spinner label="A abrir o seu pedido…" /></Wrap>;
  if (error || !order || !token) {
    return (
      <Wrap>
        <h1 className="text-5xl font-semibold">Pedido {upperCode}</h1>
        <Alert tone="bad" className="mt-6" title="Não foi possível abrir o pedido">
          {errorMessage(error)} <Link to="/consultar" className="font-semibold underline">Recuperar acesso</Link>
        </Alert>
      </Wrap>
    );
  }

  const st = ORDER_STATUS[order.status];
  const canPay = ['iniciada', 'aguardando_pagamento', 'rejeitado'].includes(order.status);
  const inReview = ['comprovativo_enviado', 'em_analise'].includes(order.status);
  const chosen: PaymentMethod = method ?? order.payment_method ?? 'transferencia';
  const done = ['aprovado', 'emitido'].includes(order.status);
  // Etapas do checkout: 4 = pagamento, 5 = confirmação (em análise); concluídas após aprovação
  const current = canPay ? 3 : inReview ? 4 : done ? 5 : 3;
  const showSteps = order.status !== 'cancelado';
  const chooseMethod = (m: PaymentMethod) => {
    setMethod(m);
    // Preferência guardada no pedido (ajuda a equipa financeira); falhas não bloqueiam o cliente
    setPaymentMethod(order.order_code, token, m).catch(() => undefined);
  };

  return (
    <Wrap>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">O seu pedido</p>
          <h1 className="mt-2 font-mono text-4xl font-bold tracking-wider text-fg md:text-5xl">{order.order_code}</h1>
          <p className="mt-2 text-sm text-fg/55">Criado em {formatDateTime(order.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={order.status} className="text-sm" />
          <Button variant="ghost" size="sm" onClick={() => reload()} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>
      </div>

      {showSteps && (
        <div className="mt-8"><CheckoutSteps current={current} /></div>
      )}

      <p className="mt-6 text-fg/75">{st.help}</p>

      {order.status === 'rejeitado' && order.rejection_reason && (
        <Alert tone="bad" className="mt-6" title="Motivo da rejeição">{order.rejection_reason}</Alert>
      )}
      {order.status === 'cancelado' && <Alert tone="bad" className="mt-6" title="Pedido cancelado">{order.cancel_reason}</Alert>}
      {order.expires_at && canPay && (
        <Alert tone="warn" className="mt-6" title="Prazo da reserva">
          Envie o comprovativo até <strong>{formatDateTime(order.expires_at)}</strong> (hora de Luanda). Depois desse prazo a reserva expira e os lugares voltam a ficar disponíveis.
        </Alert>
      )}
      {actionError && <Alert tone="bad" className="mt-6">{actionError}</Alert>}

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          {order.status === 'iniciada' && (
            <div className="rounded-[1.75rem] border border-gold/30 bg-paper p-6 shadow-soft">
              <h2 className="text-2xl font-semibold">O seu lugar está reservado</h2>
              <p className="mt-2 text-sm text-fg/60">Quando estiver pronto para pagar, avance para o pagamento. Pode também enviar já o comprovativo, se a transferência estiver feita.</p>
              <Button className="mt-5" loading={busy === 'confirm'} onClick={() => act('confirm', () => confirmReservation(order.order_code, token))}>
                Avançar para pagamento
              </Button>
            </div>
          )}

          {canPay && (
            <>
              <BankCard
                method={chosen}
                onMethod={chooseMethod}
                accountName={order.payment.account_name}
                accountNumber={order.payment.account_number}
                iban={order.payment.iban}
                expressNumber={order.payment.express_number}
                amount={order.total_kz}
                reference={order.order_code}
              />
              {order.payment.instructions && <p className="text-sm leading-relaxed text-fg/60">{order.payment.instructions}</p>}
              <ProofUpload code={order.order_code} token={token} method={chosen} onUploaded={() => reload()} />
            </>
          )}

          {inReview && (
            <div className="relative overflow-hidden rounded-[1.75rem] border border-gold/40 bg-paper p-6 shadow-card md:p-8">
              <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gold-metal" />
              <p className="eyebrow">Etapa 5 · Confirmação</p>
              <h2 className="mt-3 flex items-center gap-3 font-display text-3xl font-semibold tracking-wide text-fg md:text-4xl">
                <Clock3 className="h-8 w-8 shrink-0 text-gold" aria-hidden /> PAGAMENTO EM ANÁLISE
              </h2>
              <dl className="mt-6 grid gap-4 rounded-2xl bg-paper-soft p-5 text-sm sm:grid-cols-2">
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Número do pedido</dt><dd className="mt-1 font-mono text-lg font-bold tracking-wider">{order.order_code}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Estado</dt><dd className="mt-1"><StatusBadge status={order.status} /></dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Resumo</dt><dd className="mt-1 font-semibold">{order.quantity} × {order.ticket_type.name} · {formatKz(order.total_kz)}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Comprovativo enviado</dt><dd className="mt-1 font-semibold">{formatDateTime(order.proof_uploaded_at ?? order.proofs[0]?.uploaded_at)}</dd></div>
                {order.payment_method && (
                  <div><dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fg-muted">Método</dt><dd className="mt-1 font-semibold">{order.payment_method === 'express' ? 'Transferência Express' : 'Transferência Bancária'}</dd></div>
                )}
              </dl>
              <h3 className="mt-6 font-semibold text-fg">O que acontece agora</h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-fg-muted">
                <li><strong className="text-fg">O comprovativo ainda não confirma o pagamento.</strong> A equipa financeira verifica a entrada do valor na conta.</li>
                <li>Após a aprovação, os ingressos (com QR Code individual) aparecem nesta página e são enviados para {order.email_masked}.</li>
                <li>Se houver algum problema, o pedido é marcado como rejeitado com o motivo e poderá enviar novo comprovativo.</li>
              </ol>
            </div>
          )}

          {order.status === 'aprovado' && (
            <Alert tone="ok" title="Pagamento aprovado">Os seus ingressos estão a ser emitidos. Actualize a página dentro de instantes.</Alert>
          )}

          {order.status === 'emitido' && order.tickets.length > 0 && <TicketList order={order} settings={settings} token={token} />}

          {order.proofs.length > 0 && (
            <div>
              <h2 className="mb-3 text-xl font-semibold">Comprovativos enviados</h2>
              <ul className="space-y-2 text-sm">
                {order.proofs.map((p, i) => (
                  <li key={i} className="flex items-center justify-between rounded-xl bg-paper-soft px-4 py-3 ring-1 ring-fg/5">
                    <span>{formatDateTime(p.uploaded_at)} · {p.mime_type === 'application/pdf' ? 'PDF' : 'Imagem'}</span>
                    <span className="flex items-center gap-1.5">
                      {p.status === 'aceite' ? <CheckCircle2 className="h-4 w-4 text-emerald-800" /> : p.status === 'rejeitado' ? <XCircle className="h-4 w-4 text-rose-800" /> : <Clock3 className="h-4 w-4 text-sky-800" />}
                      {p.status === 'aceite' ? 'Aceite' : p.status === 'rejeitado' ? 'Rejeitado' : 'Pendente'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-[1.75rem] border border-gold/25 bg-paper p-6 shadow-soft">
            <p className="eyebrow">Resumo</p>
            {order.event.starts_at && (
              <div className="mt-3 space-y-1 text-xs text-fg-muted">
                <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-gold" aria-hidden />{formatEventDate(order.event.starts_at)} · {formatEventTime(order.event.starts_at)}</p>
                <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gold" aria-hidden />{order.event.venue}</p>
              </div>
            )}
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-fg/55">Titular</dt><dd className="text-right font-semibold">{order.full_name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg/55">Email</dt><dd>{order.email_masked}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg/55">Telefone</dt><dd>{order.phone_masked}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg/55">Categoria</dt><dd className="text-right">{order.ticket_type.name}{order.source === 'vip' ? ' · proposta VIP' : ''}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg/55">Preço unitário</dt><dd>{formatKz(order.unit_price_kz)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg/55">Quantidade</dt><dd>{order.quantity}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg/55">Convidados</dt><dd>{order.guests_total}</dd></div>
              <div className="hairline" />
              <div className="flex items-end justify-between gap-3"><dt className="text-fg/55">Total</dt><dd className="font-display text-3xl text-gold-metal">{formatKz(order.total_kz)}</dd></div>
            </dl>
          </div>
          <div className="rounded-[1.75rem] border border-fg/10 bg-paper p-6 text-sm shadow-soft">
            <p className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4 text-gold" /> Ligação segura do pedido</p>
            <p className="mt-2 text-fg/55">Guarde esta ligação privada para voltar ao seu pedido. Não a partilhe.</p>
            <CopyButton className="mt-4" value={orderUrl(order.order_code, token)} label="Copiar ligação" />
          </div>
          {canPay && (
            <Button variant="ghost" className="w-full text-rose-800 hover:bg-rose-500/10" onClick={() => setConfirmCancel(true)}>
              Cancelar pedido
            </Button>
          )}
        </aside>
      </div>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel} title="Cancelar pedido?" description="Os lugares reservados serão libertados. Esta acção não pode ser desfeita.">
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Manter pedido</Button>
          <Button
            variant="danger"
            loading={busy === 'cancel'}
            onClick={() => act('cancel', () => cancelOrder(order.order_code, token)).then(() => setConfirmCancel(false))}
          >
            Sim, cancelar
          </Button>
        </div>
      </Dialog>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="container max-w-6xl pb-24 pt-28 md:pt-36">{children}</div>;
}
