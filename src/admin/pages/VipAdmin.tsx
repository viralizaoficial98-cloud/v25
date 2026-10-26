import { useState, type FormEvent } from 'react';
import { ArrowLeft, Crown, Link2, Send } from 'lucide-react';
import { Alert, Badge, CopyButton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { api } from '@/lib/http';
import { downloadBlob } from '@/lib/csv';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKz } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { vipPath } from '@/lib/orderAccess';
import type { VipProposal, VipStatus } from '@/lib/types';
import { ConfirmButton, Loadable, PageHeader, Panel, Table, Td } from '../ui';

interface VipRow {
  id: string;
  request_code: string;
  full_name: string;
  email: string;
  phone: string;
  participants: number;
  status: VipStatus;
  created_at: string;
  proposal: VipProposal | null;
}
interface VipDetail {
  request: VipRow & { message: string | null; status_reason: string | null; admin_notes: string | null; consent_at: string };
  proposals: VipProposal[];
  vip_available: number;
}

export const VIP_STATUS: Record<VipStatus, { label: string; tone: 'info' | 'warn' | 'ok' | 'bad' | 'neutral' }> = {
  nova: { label: 'Nova', tone: 'warn' },
  em_analise: { label: 'Em análise', tone: 'info' },
  proposta_enviada: { label: 'Proposta enviada', tone: 'info' },
  aceite: { label: 'Aceite (pedido criado)', tone: 'ok' },
  recusada_cliente: { label: 'Recusada pelo cliente', tone: 'neutral' },
  rejeitada: { label: 'Rejeitada', tone: 'bad' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
};
const PROPOSAL_STATUS: Record<VipProposal['status'], string> = { enviada: 'Enviada', aceite: 'Aceite', recusada: 'Recusada', expirada: 'Expirada', substituida: 'Substituída' };
const OPEN: VipStatus[] = ['nova', 'em_analise', 'proposta_enviada'];

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, loading, error, reload } = useAsync(() => api<VipDetail>(`/admin/vip/${id}`), [id]);
  const [notes, setNotes] = useState<string | null>(null);
  const [tickets, setTickets] = useState('');
  const [total, setTotal] = useState('');
  const [conditions, setConditions] = useState('');
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (name: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
      await reload();
      setMsg({ tone: 'ok', text: ok });
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
      throw e;
    } finally {
      setBusy(null);
    }
  };

  const propose = (e: FormEvent) => {
    e.preventDefault();
    void run('propose', () => api(`/admin/vip/${id}/proposals`, {
      json: { tickets: Number(tickets), total_kz: Number(total.replace(/\s/g, '').replace(',', '.')), conditions, valid_days: Number(days) },
    }), 'Proposta enviada ao cliente (email + página privada).').catch(() => undefined);
  };

  if (loading && !data) return <Loadable loading error={null}>{null}</Loadable>;
  if (error || !data) return <Alert tone="bad">{errorMessage(error)}</Alert>;
  const r = data.request;
  const st = VIP_STATUS[r.status];
  const open = OPEN.includes(r.status);
  const canPropose = open || r.status === 'recusada_cliente';
  const unit = Number(tickets) > 0 && Number(total) > 0 ? Number(total) / Number(tickets) : null;

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-gold-deep hover:underline"><ArrowLeft className="h-4 w-4" /> Todas as solicitações</button>
      <PageHeader title={`VIP ${r.request_code}`} description={<>Recebida em {formatDateTime(r.created_at)} · <Badge tone={st.tone}>{st.label}</Badge></>} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          <Panel title="Cliente">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-fg-muted">Nome</dt><dd className="font-semibold">{r.full_name}</dd></div>
              <div><dt className="text-xs text-fg-muted">Participantes</dt><dd className="font-semibold">{r.participants}</dd></div>
              <div><dt className="text-xs text-fg-muted">Email</dt><dd><a className="text-gold-deep underline" href={`mailto:${r.email}`}>{r.email}</a></dd></div>
              <div><dt className="text-xs text-fg-muted">Telefone</dt><dd><a className="text-gold-deep underline" href={`tel:${r.phone}`}>{r.phone}</a></dd></div>
            </dl>
            {r.message && <p className="mt-4 whitespace-pre-line rounded-xl bg-paper-soft p-3 text-sm">{r.message}</p>}
            {r.status_reason && <p className="mt-3 text-sm text-fg-muted">Motivo: {r.status_reason}</p>}
            <p className="mt-4 text-xs text-fg-muted">Lugares VIP disponíveis: <strong className="text-fg">{data.vip_available}</strong> (defina a quantidade em “Ingressos, lotes e stock”).</p>
          </Panel>
          <Panel title="Notas internas">
            <Textarea value={notes ?? r.admin_notes ?? ''} onChange={(e) => setNotes(e.target.value)} maxLength={5000} aria-label="Notas internas" placeholder="Só visível para a equipa." />
            <Button className="mt-3" variant="outline" size="sm" loading={busy === 'notes'} disabled={notes === null}
              onClick={() => run('notes', () => api(`/admin/vip/${id}`, { method: 'PUT', json: { admin_notes: notes } }), 'Notas guardadas.').then(() => setNotes(null)).catch(() => undefined)}>
              Guardar notas
            </Button>
          </Panel>
          <Panel title="Acções">
            <div className="flex flex-wrap gap-2">
              {r.status === 'nova' && (
                <Button variant="outline" size="sm" loading={busy === 'analise'} onClick={() => run('analise', () => api(`/admin/vip/${id}`, { method: 'PUT', json: { status: 'em_analise' } }), 'Marcada como em análise.').catch(() => undefined)}>
                  Marcar em análise
                </Button>
              )}
              <Button variant="outline" size="sm" loading={busy === 'link'}
                onClick={() => run('link', async () => {
                  const l = await api<{ request_code: string; access_token: string }>(`/admin/vip/${id}/access-link`, { method: 'POST' });
                  setLink(`${window.location.origin}${vipPath(l.request_code, l.access_token)}`);
                }, 'Nova ligação privada gerada (a anterior deixa de funcionar).').catch(() => undefined)}>
                <Link2 className="h-4 w-4" /> Gerar ligação para o cliente
              </Button>
            </div>
            {link && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-paper-soft p-3">
                <code className="min-w-0 flex-1 break-all text-xs">{link}</code>
                <CopyButton value={link} label="Copiar" />
              </div>
            )}
            {open && (
              <div className="mt-5 space-y-3 border-t border-fg/10 pt-4">
                <Field label="Motivo (obrigatório para rejeitar)">{(fid) => <Input id={fid} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}</Field>
                <div className="flex flex-wrap gap-2">
                  <ConfirmButton danger title="Rejeitar a solicitação?" description="O cliente é informado por email com o motivo indicado. Propostas em aberto deixam de ser válidas." confirmLabel="Rejeitar"
                    onConfirm={() => run('reject', () => api(`/admin/vip/${id}`, { method: 'PUT', json: { status: 'rejeitada', reason } }), 'Solicitação rejeitada.')}>
                    Rejeitar
                  </ConfirmButton>
                  <ConfirmButton title="Cancelar a solicitação?" description="Propostas em aberto deixam de ser válidas." confirmLabel="Cancelar solicitação"
                    onConfirm={() => run('cancel', () => api(`/admin/vip/${id}`, { method: 'PUT', json: { status: 'cancelada', reason } }), 'Solicitação cancelada.')}>
                    Cancelar
                  </ConfirmButton>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          {canPropose && (
            <Panel title={r.status === 'proposta_enviada' ? 'Enviar nova proposta (substitui a actual)' : 'Enviar proposta'}>
              <form onSubmit={propose} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="N.º de ingressos" required>{(fid) => <Input id={fid} inputMode="numeric" value={tickets} onChange={(e) => setTickets(e.target.value.replace(/\D/g, '').slice(0, 3))} required />}</Field>
                  <Field label="Valor total (Kz)" required hint={unit ? `${formatKz(unit)} por ingresso` : undefined}>{(fid, d) => <Input id={fid} aria-describedby={d} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.,\s]/g, ''))} required />}</Field>
                  <Field label="Validade">
                    {(fid) => (
                      <Select id={fid} value={days} onChange={(e) => setDays(e.target.value)}>
                        {[2, 3, 5, 7, 10, 14, 30].map((d) => <option key={d} value={d}>{d} dias</option>)}
                      </Select>
                    )}
                  </Field>
                </div>
                <Field label="Condições individuais" required hint="Benefícios, mesa, lugares, prazos de pagamento, etc. O cliente vê este texto antes de aceitar.">
                  {(fid, d) => <Textarea id={fid} aria-describedby={d} value={conditions} maxLength={3000} onChange={(e) => setConditions(e.target.value)} required />}
                </Field>
                <Alert tone="info">O cliente só paga depois de aceitar. Ao aceitar, é criado automaticamente um pedido de pagamento com este valor; o ingresso VIP é emitido após a validação financeira.</Alert>
                <Button type="submit" loading={busy === 'propose'}><Send className="h-4 w-4" /> Enviar proposta</Button>
              </form>
            </Panel>
          )}
          <Panel title="Propostas">
            {data.proposals.length === 0 ? (
              <p className="text-sm text-fg-muted">Ainda não foi enviada nenhuma proposta.</p>
            ) : (
              <ul className="space-y-3">
                {data.proposals.map((p) => (
                  <li key={p.id} className="rounded-xl border border-fg/10 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{p.tickets} ingresso(s) · {formatKz(p.total_kz)}</span>
                      <Badge tone={p.status === 'aceite' ? 'ok' : p.status === 'enviada' ? 'info' : 'neutral'}>{PROPOSAL_STATUS[p.status]}</Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-fg-muted">{p.conditions}</p>
                    <p className="mt-2 text-xs text-fg-muted">Enviada {formatDateTime(p.created_at)} · válida até {formatDateTime(p.valid_until)}{p.responded_at && ` · respondida ${formatDateTime(p.responded_at)}`}</p>
                    {p.order_code && (
                      <p className="mt-2 text-xs">
                        Pedido de pagamento: <a className="font-mono font-semibold text-gold-deep underline" href={`/admin/pedidos?q=${encodeURIComponent(p.order_code)}`}>{p.order_code}</a>
                        {' '}— acompanhe o pagamento em “Validação de pagamentos”.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function VipAdmin() {
  const [status, setStatus] = useState('abertas');
  const [open, setOpen] = useState<string | null>(null);
  const { data = [], loading, error, reload } = useAsync(() => api<VipRow[]>(`/admin/vip?status=${status}`), [status]);
  if (open) return <Detail id={open} onBack={() => { setOpen(null); void reload(); }} />;
  return (
    <div>
      <PageHeader
        title="Gestão VIP"
        description="Solicitações de acesso VIP: análise, proposta individual (valor e condições), aceitação pelo cliente e pedido de pagamento."
        actions={
          <>
            <Select aria-label="Filtrar por estado" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 py-1 text-sm">
              <option value="abertas">Em aberto</option>
              <option value="todas">Todas</option>
              {Object.entries(VIP_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Button size="sm" variant="outline" onClick={async () => downloadBlob(await api<Blob>('/admin/reports/vip.csv', { blob: true }), `v25-vip-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8')}>
              Exportar CSV
            </Button>
          </>
        }
      />
      <Panel>
        <Loadable loading={loading} error={error} empty={data.length === 0 && 'Sem solicitações neste filtro.'}>
          <Table head={['Código', 'Cliente', 'Participantes', 'Estado', 'Proposta', 'Recebida', '']}>
            {data.map((r) => (
              <tr key={r.id} className="hover:bg-fg/[0.02]">
                <Td className="font-mono font-semibold">{r.request_code}</Td>
                <Td><span className="font-semibold">{r.full_name}</span><br /><span className="text-xs text-fg-muted">{r.email}</span></Td>
                <Td>{r.participants}</Td>
                <Td><Badge tone={VIP_STATUS[r.status].tone}>{VIP_STATUS[r.status].label}</Badge></Td>
                <Td>{r.proposal ? <>{formatKz(r.proposal.total_kz)}<br /><span className="text-xs text-fg-muted">{PROPOSAL_STATUS[r.proposal.status]}</span></> : '—'}</Td>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</Td>
                <Td><Button size="sm" variant="outline" onClick={() => setOpen(r.id)}><Crown className="h-4 w-4" /> Abrir</Button></Td>
              </tr>
            ))}
          </Table>
        </Loadable>
      </Panel>
    </div>
  );
}
