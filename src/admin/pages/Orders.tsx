import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Link2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, CopyButton, StatusBadge } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { requireSupabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKz } from '@/lib/format';
import { ORDER_STATUS } from '@/lib/status';
import { orderUrl } from '@/lib/orderAccess';
import type { OrderRow, OrderStatus } from '@/lib/types';
import { useAsync } from '@/hooks/useAsync';
import { Label, Loadable, PageHeader, Panel, Table, Td } from '../ui';
import { useAdmin } from '../session';

const PAGE = 25;
type Row = OrderRow & { ticket_types: { name: string; lot_label: string } | null };

export default function Orders({ preset }: { preset?: 'review' }) {
  const [status, setStatus] = useState<string>(preset === 'review' ? 'review' : 'all');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => setStatus(preset === 'review' ? 'review' : 'all'), [preset]);

  const { data, loading, error, reload } = useAsync(async () => {
    let req = requireSupabase()
      .from('orders')
      .select('*, ticket_types(name, lot_label)', { count: 'exact' })
      .order(status === 'review' ? 'updated_at' : 'created_at', { ascending: status === 'review' })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (status === 'review') req = req.in('status', ['comprovativo_enviado', 'em_analise']);
    else if (status !== 'all') req = req.eq('status', status);
    const term = query.replace(/[,()%*]/g, ' ').trim();
    if (term) req = req.or(`order_code.ilike.%${term}%,full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    const { data, error, count } = await req;
    if (error) throw error;
    return { rows: data as Row[], count: count ?? 0 };
  }, [status, query, page]);

  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE));

  return (
    <div>
      <PageHeader
        title={preset === 'review' ? 'Validação de pagamentos' : 'Inscrições e pedidos'}
        description={
          preset === 'review'
            ? 'Comprovativos a aguardar verificação manual no banco. Aprovar só depois de confirmar a entrada do valor na conta.'
            : 'Todos os pedidos, com pesquisa por código, nome, email ou telefone.'
        }
      />
      <Panel>
        <form
          className="mb-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setQuery(q);
          }}
        >
          <select className="admin-input sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Filtrar por estado">
            <option value="all">Todos os estados</option>
            <option value="review">Em análise (comprovativo recebido)</option>
            {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{ORDER_STATUS[s].label}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-cream/40" />
            <input className="admin-input pl-9" placeholder="Pesquisar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar pedidos" />
          </div>
          <Button type="submit" size="sm" variant="subtle">Pesquisar</Button>
        </form>

        <Loadable loading={loading && !data} error={error} empty={data && data.rows.length === 0 ? 'Nenhum pedido encontrado.' : false}>
          <Table head={['Pedido', 'Cliente', 'Ingresso', 'Total', 'Estado', 'Data', '']}>
            {data?.rows.map((o) => (
              <tr key={o.id} className="hover:bg-white/[0.02]">
                <Td className="font-mono font-semibold">{o.order_code}</Td>
                <Td>
                  {o.full_name}
                  <span className="block text-xs text-cream/45">{o.email}</span>
                </Td>
                <Td>{o.quantity} × {o.ticket_types?.name}</Td>
                <Td>{formatKz(o.total_kz)}</Td>
                <Td><StatusBadge status={o.status} /></Td>
                <Td className="whitespace-nowrap text-xs text-cream/60">{formatDateTime(o.created_at)}</Td>
                <Td><Button size="sm" variant="outline" onClick={() => setSelected(o.id)}><Eye className="h-4 w-4" /> Abrir</Button></Td>
              </tr>
            ))}
          </Table>
          <div className="mt-4 flex items-center justify-between text-xs text-cream/50">
            <span>{data?.count ?? 0} pedidos</span>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              Página {page + 1} de {pages}
              <Button size="icon" variant="ghost" aria-label="Página seguinte" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </Loadable>
      </Panel>

      {selected && <OrderDetail id={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </div>
  );
}

interface Proof { id: string; storage_path: string; mime_type: string; size_bytes: number; status: string; uploaded_at: string; duplicate_of: string | null }
interface TicketRow { id: string; ticket_code: string; seq: number; status: string; checked_in_at: string | null }
interface EventRow { id: number; status: OrderStatus; note: string | null; created_at: string }

function OrderDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { role } = useAdmin();
  const sb = requireSupabase();
  const { data, loading, error, reload } = useAsync(async () => {
    const [o, p, t, e] = await Promise.all([
      sb.from('orders').select('*, ticket_types(name, lot_label)').eq('id', id).single(),
      sb.from('payment_proofs').select('*').eq('order_id', id).order('uploaded_at', { ascending: false }),
      sb.from('tickets').select('id, ticket_code, seq, status, checked_in_at').eq('order_id', id).order('seq'),
      sb.from('order_events').select('*').eq('order_id', id).order('created_at'),
    ]);
    for (const r of [o, p, t, e]) if (r.error) throw r.error;
    return { order: o.data as Row, proofs: p.data as Proof[], tickets: t.data as TicketRow[], events: e.data as EventRow[] };
  }, [id]);

  const [mode, setMode] = useState<'approve' | 'reject' | 'cancel' | null>(null);
  const [ref, setRef] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const run = async (fn: () => PromiseLike<{ error: unknown; data?: unknown }>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const { error, data } = await fn();
      if (error) throw error;
      const already = (data as { already_processed?: boolean } | null)?.already_processed;
      setMsg({ tone: 'ok', text: already ? 'Este pedido já tinha sido processado — nada foi alterado.' : ok });
      setMode(null);
      await reload();
      onChanged();
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const viewProof = async (p: Proof) => {
    // Abre a janela já no clique (evita bloqueio de pop-ups) e só depois define o URL assinado
    const w = window.open('about:blank', '_blank');
    if (w) w.opener = null;
    const { data: signed, error } = await sb.storage.from('proofs').createSignedUrl(p.storage_path, 300);
    if (error || !signed) {
      w?.close();
      setMsg({ tone: 'bad', text: errorMessage(error) });
      return;
    }
    if (w) w.location.href = signed.signedUrl;
    else window.open(signed.signedUrl, '_blank', 'noopener');
    if (data?.order.status === 'comprovativo_enviado') {
      await sb.rpc('admin_mark_in_review', { p_order_id: id });
      await reload();
      onChanged();
    }
  };

  const o = data?.order;
  const reviewable = o && ['comprovativo_enviado', 'em_analise'].includes(o.status);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={o ? `Pedido ${o.order_code}` : 'Pedido'} className="max-w-3xl">
      <Loadable loading={loading && !data} error={error}>
        {o && data && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={o.status} />
              <span className="text-cream/50">Criado {formatDateTime(o.created_at)}</span>
              {o.expires_at && <span className="text-amber-200">Expira {formatDateTime(o.expires_at)}</span>}
            </div>
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['Nome', o.full_name],
                ['Email', o.email],
                ['Telefone', o.phone],
                ['Ingresso', `${o.ticket_types?.name ?? ''}${o.ticket_types?.lot_label ? ` · ${o.ticket_types.lot_label}` : ''}`],
                ['Quantidade / convidados', `${o.quantity} / ${o.guests_total}`],
                ['Total', formatKz(o.total_kz)],
                ['Consentimento', `${formatDateTime(o.consent_at)} (${o.consent_version})`],
                ['Referência bancária', o.payment_reference ?? '—'],
                ['Valor confirmado', o.amount_confirmed_kz ? formatKz(o.amount_confirmed_kz) : '—'],
                ['Revisto em', o.reviewed_at ? formatDateTime(o.reviewed_at) : '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-cream/45">{k}</dt>
                  <dd className="mt-0.5 break-words text-cream">{v}</dd>
                </div>
              ))}
            </dl>
            {o.rejection_reason && <Alert tone="bad" title="Último motivo de rejeição">{o.rejection_reason}</Alert>}
            {o.cancel_reason && o.status === 'cancelado' && <Alert tone="bad" title="Motivo de cancelamento">{o.cancel_reason}</Alert>}

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold">Comprovativos</h3>
              {data.proofs.length === 0 ? (
                <p className="text-cream/50">Nenhum comprovativo enviado.</p>
              ) : (
                <ul className="space-y-2">
                  {data.proofs.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
                      <span>
                        {formatDateTime(p.uploaded_at)} · {p.mime_type} · {(p.size_bytes / 1024).toFixed(0)} KB · <em>{p.status}</em>
                        {p.duplicate_of && (
                          <span className="ml-2 inline-flex items-center gap-1 text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> ficheiro idêntico noutro pedido</span>
                        )}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => viewProof(p)}><Eye className="h-4 w-4" /> Ver (link temporário)</Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {data.tickets.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold">Ingressos</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {data.tickets.map((t) => (
                    <li key={t.id} className="rounded-xl bg-white/5 px-3 py-2 font-mono">
                      {t.ticket_code} · {t.status}
                      {t.checked_in_at && <span className="block font-sans text-xs text-cream/50">Entrada {formatDateTime(t.checked_in_at)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gold">Histórico</h3>
              <ol className="space-y-1 text-xs text-cream/65">
                {data.events.map((e) => (
                  <li key={e.id}>{formatDateTime(e.created_at)} — {ORDER_STATUS[e.status]?.label ?? e.status}{e.note ? `: ${e.note}` : ''}</li>
                ))}
              </ol>
            </div>

            {mode === 'approve' && (
              <form
                className="space-y-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => sb.rpc('admin_approve_order', { p_order_id: id, p_payment_reference: ref, p_amount_confirmed: Number(amount.replace(/\s/g, '').replace(',', '.')), p_note: note || null }),
                    'Pagamento aprovado e ingressos emitidos.',
                  );
                }}
              >
                <p className="font-semibold">Aprovar pagamento de {formatKz(o.total_kz)}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label htmlFor="ref">Referência/ID da transacção no banco *</Label><input id="ref" className="admin-input" value={ref} onChange={(e) => setRef(e.target.value)} required minLength={4} /></div>
                  <div><Label htmlFor="amt">Valor confirmado no extracto (Kz) *</Label><input id="amt" className="admin-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
                </div>
                <div><Label htmlFor="note">Nota interna</Label><input id="note" className="admin-input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
                <label className="flex items-start gap-2 text-xs text-cream/75">
                  <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 accent-[#c9a45c]" />
                  Confirmo que verifiquei a entrada deste valor na conta bancária (o comprovativo, por si só, não é prova suficiente).
                </label>
                <div className="flex gap-2">
                  <Button type="submit" variant="success" loading={busy} disabled={!checked}>Aprovar e emitir ingressos</Button>
                  <Button variant="ghost" onClick={() => setMode(null)}>Cancelar</Button>
                </div>
              </form>
            )}
            {(mode === 'reject' || mode === 'cancel') && (
              <form
                className="space-y-3 rounded-2xl border border-rose-400/30 bg-rose-500/5 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void (mode === 'reject'
                    ? run(() => sb.rpc('admin_reject_order', { p_order_id: id, p_reason: reason }), 'Pagamento rejeitado. O cliente pode enviar novo comprovativo.')
                    : run(() => sb.rpc('admin_cancel_order', { p_order_id: id, p_reason: reason }), 'Pedido cancelado e lugares libertados.'));
                }}
              >
                <Label htmlFor="reason">{mode === 'reject' ? 'Motivo da rejeição (visível para o cliente) *' : 'Motivo do cancelamento *'}</Label>
                <textarea id="reason" className="admin-input min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} />
                <div className="flex gap-2">
                  <Button type="submit" variant="danger" loading={busy}>{mode === 'reject' ? 'Rejeitar pagamento' : 'Cancelar pedido'}</Button>
                  <Button variant="ghost" onClick={() => setMode(null)}>Voltar</Button>
                </div>
              </form>
            )}

            {link && (
              <Alert tone="info" title="Ligação segura gerada">
                <span className="break-all font-mono text-xs">{link}</span>
                <CopyButton className="mt-2" value={link} label="Copiar ligação" />
              </Alert>
            )}

            {!mode && (
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                {reviewable && <Button variant="success" size="sm" onClick={() => setMode('approve')}>Aprovar pagamento</Button>}
                {reviewable && <Button variant="danger" size="sm" onClick={() => setMode('reject')}>Rejeitar</Button>}
                {o.status === 'emitido' && (
                  <Button size="sm" variant="subtle" loading={busy} onClick={() => run(() => sb.rpc('admin_resend_tickets', { p_order_id: id }), 'Reenvio dos ingressos colocado na fila de email.')}>
                    Reenviar ingressos por email
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={async () => {
                    const { data: r, error } = await sb.rpc('admin_issue_access_link', { p_order_id: id });
                    if (error) setMsg({ tone: 'bad', text: errorMessage(error) });
                    else setLink(orderUrl((r as { order_code: string }).order_code, (r as { access_token: string }).access_token));
                  }}
                >
                  <Link2 className="h-4 w-4" /> Gerar ligação para o cliente
                </Button>
                {role === 'admin' && o.status !== 'cancelado' && (
                  <Button size="sm" variant="ghost" className="text-rose-200" onClick={() => setMode('cancel')}>Cancelar pedido</Button>
                )}
              </div>
            )}
          </div>
        )}
      </Loadable>
    </Dialog>
  );
}
