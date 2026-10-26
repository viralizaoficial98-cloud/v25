import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Clock3, Crown, RefreshCw, XCircle } from 'lucide-react';
import { Alert, CopyButton, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { acceptVip, declineVip, getVip } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKz } from '@/lib/format';
import { orderPath, saveOrderAccess, saveVipAccess, tokenFromHash, vipPath, vipTokenFor } from '@/lib/orderAccess';
import { useAsync } from '@/hooks/useAsync';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { VipStatus } from '@/lib/types';

const STATUS: Record<VipStatus, { label: string; help: string; tone: 'info' | 'warn' | 'ok' | 'bad' }> = {
  nova: { label: 'Solicitação recebida', help: 'A organização vai analisar o seu pedido de acesso VIP. Receberá uma proposta por email.', tone: 'info' },
  em_analise: { label: 'Em análise', help: 'A organização está a analisar a disponibilidade e as condições do acesso VIP.', tone: 'info' },
  proposta_enviada: { label: 'Proposta disponível', help: 'Reveja as condições abaixo. O pagamento só é pedido depois de aceitar a proposta.', tone: 'warn' },
  aceite: { label: 'Proposta aceite', help: 'Foi criado o pedido de pagamento VIP. Siga as instruções de pagamento no pedido.', tone: 'ok' },
  recusada_cliente: { label: 'Proposta recusada', help: 'Recusou a proposta. Se mudar de ideias, contacte a organização.', tone: 'bad' },
  rejeitada: { label: 'Solicitação não aprovada', help: 'A organização não pôde aprovar esta solicitação.', tone: 'bad' },
  cancelada: { label: 'Solicitação cancelada', help: 'Esta solicitação foi cancelada.', tone: 'bad' },
};

/** Página privada da solicitação VIP (código + token no fragmento do URL). */
export default function VipPage() {
  const { code = '' } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const upper = code.toUpperCase();
  const [token] = useState(() => tokenFromHash(hash) ?? vipTokenFor(upper));
  useDocumentTitle(`Acesso VIP ${upper} · V25 — O Legado`);
  useEffect(() => {
    if (token) saveVipAccess(upper, token);
  }, [token, upper]);

  const { data: vip, error, loading, reload } = useAsync(() => (token ? getVip(upper, token) : Promise.reject(new Error('ACESSO_INVALIDO'))), [upper, token]);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'accept' | 'decline' | null>(null);

  const accept = async () => {
    if (!token) return;
    setBusy('accept');
    setActionError(null);
    try {
      const r = await acceptVip(upper, token);
      saveOrderAccess(r.order_code, r.access_token);
      navigate(orderPath(r.order_code, r.access_token));
    } catch (e) {
      setActionError(errorMessage(e));
      setConfirm(null);
      await reload();
    } finally {
      setBusy(null);
    }
  };
  const decline = async () => {
    if (!token) return;
    setBusy('decline');
    setActionError(null);
    try {
      await declineVip(upper, token);
      setConfirm(null);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading && !vip) return <Wrap><Spinner label="A abrir a sua solicitação…" /></Wrap>;
  if (error || !vip || !token) {
    return (
      <Wrap>
        <h1 className="text-4xl font-semibold">Solicitação VIP {upper}</h1>
        <Alert tone="bad" className="mt-6" title="Não foi possível abrir a solicitação">
          {errorMessage(error)} Utilize a ligação que recebeu por email.
        </Alert>
      </Wrap>
    );
  }

  const st = STATUS[vip.status];
  const p = vip.proposal;
  const proposalOpen = vip.status === 'proposta_enviada' && p?.status === 'enviada';

  return (
    <Wrap>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2"><Crown className="h-4 w-4" aria-hidden /> Acesso VIP</p>
          <h1 className="mt-2 font-mono text-4xl font-bold tracking-wider md:text-5xl">{vip.request_code}</h1>
          <p className="mt-2 text-sm text-fg-muted">Enviada em {formatDateTime(vip.created_at)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => reload()} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
      </div>

      <Alert tone={st.tone} title={st.label} className="mt-8">{st.help}{vip.status_reason && <> Motivo: {vip.status_reason}</>}</Alert>
      {actionError && <Alert tone="bad" className="mt-4">{actionError}</Alert>}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {p && p.status !== 'substituida' ? (
            <section className="relative overflow-hidden rounded-[1.75rem] border border-gold/40 bg-paper p-6 shadow-card md:p-8" aria-labelledby="prop-t">
              <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gold-metal" />
              <p className="eyebrow">Proposta da organização</p>
              <h2 id="prop-t" className="mt-2 font-display text-3xl font-semibold">{p.tickets} ingresso{p.tickets === 1 ? '' : 's'} VIP</h2>
              <p className="mt-4 font-display text-4xl font-semibold text-gold-metal">{formatKz(p.total_kz)}</p>
              <p className="text-xs text-fg-muted">Valor total aprovado pela organização ({formatKz(Math.round(p.total_kz / p.tickets))} por ingresso)</p>
              <h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-fg-muted">Condições</h3>
              <p className="mt-2 whitespace-pre-line text-fg">{p.conditions}</p>
              <p className="mt-5 text-sm text-fg-muted">Válida até <strong className="text-fg">{formatDateTime(p.valid_until)}</strong> (hora de Luanda).</p>

              {proposalOpen ? (
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Button size="lg" className="flex-1" onClick={() => setConfirm('accept')}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Aceitar e avançar para pagamento
                  </Button>
                  <Button variant="outline" onClick={() => setConfirm('decline')}>
                    <XCircle className="h-4 w-4" aria-hidden /> Recusar
                  </Button>
                </div>
              ) : p.status === 'aceite' && p.order_code ? (
                <Alert tone="ok" className="mt-6" title="Proposta aceite">
                  Pedido de pagamento <strong>{p.order_code}</strong> criado. Utilize a ligação do pedido (também enviada por email) para pagar.
                </Alert>
              ) : p.status === 'expirada' ? (
                <Alert tone="warn" className="mt-6" title="Proposta expirada">Contacte a organização para receber uma nova proposta.</Alert>
              ) : null}
            </section>
          ) : (
            <section className="rounded-[1.75rem] border border-fg/10 bg-paper p-6 shadow-soft md:p-8">
              <Clock3 className="h-8 w-8 text-gold" aria-hidden />
              <h2 className="mt-4 text-2xl font-semibold">A aguardar proposta</h2>
              <p className="mt-2 text-fg-muted">
                O acesso VIP depende da aprovação da organização. Não é necessário qualquer pagamento até receber e aceitar uma proposta com o valor e as condições.
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-[1.75rem] border border-gold/25 bg-paper p-6 shadow-soft">
            <p className="eyebrow">A sua solicitação</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-fg-muted">Nome</dt><dd className="text-right font-semibold">{vip.full_name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg-muted">Email</dt><dd>{vip.email_masked}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg-muted">Participantes</dt><dd>{vip.participants}</dd></div>
            </dl>
            {vip.message && <p className="mt-4 whitespace-pre-line rounded-xl bg-paper-soft p-3 text-sm text-fg-muted">{vip.message}</p>}
          </div>
          <div className="rounded-[1.75rem] border border-fg/10 bg-paper p-6 text-sm shadow-soft">
            <p className="font-semibold">Ligação privada</p>
            <p className="mt-2 text-fg-muted">Guarde esta ligação para acompanhar a solicitação. Não a partilhe.</p>
            <CopyButton className="mt-4" value={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${vipPath(vip.request_code, token)}`} label="Copiar ligação" />
          </div>
          <Link to="/#ingressos" className="block text-center text-sm font-medium text-gold-deep hover:underline">Voltar aos ingressos</Link>
        </aside>
      </div>

      <Dialog
        open={confirm !== null}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm === 'accept' ? 'Aceitar a proposta VIP?' : 'Recusar a proposta?'}
        description={
          confirm === 'accept' && p
            ? `Será criado um pedido de pagamento de ${formatKz(p.total_kz)} para ${p.tickets} ingresso(s) VIP. O ingresso só é emitido após a confirmação do pagamento.`
            : 'A organização será informada. Esta acção não pode ser desfeita.'
        }
      >
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirm(null)}>Voltar</Button>
          {confirm === 'accept' ? (
            <Button loading={busy === 'accept'} onClick={accept}>Sim, aceitar</Button>
          ) : (
            <Button variant="danger" loading={busy === 'decline'} onClick={decline}>Sim, recusar</Button>
          )}
        </div>
      </Dialog>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="container max-w-6xl pb-24 pt-28 md:pt-36">{children}</div>;
}
