import { useState, type FormEvent } from 'react';
import { History, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/http';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKz, fromLuandaInput, toLuandaInput } from '@/lib/format';
import type { SalesStatus, TicketTypeRow } from '@/lib/types';

const STATUS_LABEL: Record<SalesStatus, string> = { abertas: 'Vendas abertas', suspensas: 'Vendas suspensas', esgotadas: 'Esgotada' };
import { useAsync } from '@/hooks/useAsync';
import { useSettings } from '@/hooks/useSettings';
import { Label, Loadable, PageHeader, Panel, Table, Td, Toggle } from '../ui';

type Draft = {
  id?: string;
  name: string;
  lot_label: string;
  description: string;
  price_kz: string;
  quantity_total: string;
  max_per_order: string;
  max_per_customer: string;
  persons_per_ticket: string;
  sales_start: string;
  sales_end: string;
  published: boolean;
  sort_order: string;
  sale_mode: 'directo' | 'consulta';
  sales_status: SalesStatus;
  benefits: string;
  badge: string;
};

const EMPTY: Draft = {
  name: '', lot_label: '', description: '', price_kz: '', quantity_total: '', max_per_order: '4', max_per_customer: '10',
  persons_per_ticket: '1', sales_start: '', sales_end: '', published: false, sort_order: '0', sale_mode: 'directo', sales_status: 'abertas', benefits: '', badge: '',
};

/** Motivos pelos quais uma categoria não está à venda no site (mesmas regras do servidor). */
function blockers(t: TicketTypeRow, salesOpen: boolean, paymentReady: boolean): string[] {
  if (t.sale_mode === 'consulta') return [];
  const r: string[] = [];
  const now = Date.now();
  if (!t.published) r.push('categoria não publicada');
  if (t.price_kz === null) r.push('sem preço');
  if (t.sales_status === 'suspensas') r.push('vendas suspensas nesta categoria');
  if (t.sales_status === 'esgotadas') r.push('marcada como esgotada');
  if (t.quantity_total === 0) r.push('quantidade por definir');
  else if (t.quantity_total - t.quantity_reserved - t.quantity_sold <= 0) r.push('esgotado');
  if (t.sales_start && new Date(t.sales_start).getTime() > now) r.push(`vendas só a partir de ${formatDateTime(t.sales_start)}`);
  if (t.sales_end && new Date(t.sales_end).getTime() <= now) r.push('período de vendas terminado');
  if (!salesOpen) r.push('vendas fechadas');
  if (!paymentReady) r.push('dados de pagamento por validar');
  return r;
}

interface PriceChange { old_price_kz: number | null; new_price_kz: number | null; changed_by: string | null; changed_at: string }

export default function TicketTypes() {
  const { settings, reload: reloadSettings } = useSettings();
  const { data = [], loading, error, reload } = useAsync(() => api<TicketTypeRow[]>('/admin/ticket-types'), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<TicketTypeRow | null>(null);
  const history = useAsync(() => (historyOf ? api<PriceChange[]>(`/admin/ticket-types/${historyOf.id}/price-history`) : Promise.resolve([])), [historyOf?.id]);

  const edit = (t?: TicketTypeRow) =>
    setDraft(
      t
        ? {
            id: t.id, name: t.name, lot_label: t.lot_label, description: t.description, price_kz: t.price_kz?.toString() ?? '',
            quantity_total: String(t.quantity_total), max_per_order: String(t.max_per_order), max_per_customer: String(t.max_per_customer),
            persons_per_ticket: String(t.persons_per_ticket), sales_start: toLuandaInput(t.sales_start), sales_end: toLuandaInput(t.sales_end),
            published: t.published, sort_order: String(t.sort_order), sale_mode: t.sale_mode ?? 'directo', sales_status: t.sales_status ?? 'abertas',
            benefits: (t.benefits ?? []).join('\n'), badge: t.badge ?? '',
          }
        : EMPTY,
    );

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setFormError(null);
    const consulta = draft.sale_mode === 'consulta';
    const price = !consulta && draft.price_kz.trim() ? Number(draft.price_kz.replace(/\s/g, '').replace(',', '.')) : null;
    if (draft.published && !consulta && (price === null || !(price > 0))) {
      setFormError('Para publicar, defina um preço válido em Kz.');
      return;
    }
    const row = {
      name: draft.name.trim(),
      lot_label: draft.lot_label.trim(),
      description: draft.description.trim(),
      price_kz: price,
      quantity_total: Number(draft.quantity_total) || 0,
      max_per_order: Number(draft.max_per_order) || 1,
      max_per_customer: Number(draft.max_per_customer) || 1,
      persons_per_ticket: Number(draft.persons_per_ticket) || 1,
      sales_start: fromLuandaInput(draft.sales_start),
      sales_end: fromLuandaInput(draft.sales_end),
      published: draft.published,
      sort_order: Number(draft.sort_order) || 0,
      sale_mode: draft.sale_mode,
      sales_status: draft.sales_status,
      benefits: draft.benefits.split('\n').map((b) => b.trim()).filter(Boolean),
      badge: draft.badge.trim(),
    };
    setBusy(true);
    try {
      if (draft.id) await api(`/admin/ticket-types/${draft.id}`, { method: 'PUT', json: row });
      else await api('/admin/ticket-types', { json: row });
      setDraft(null);
      setMsg('Ingresso guardado.');
      await reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: TicketTypeRow) => {
    if (!confirm(`Eliminar a categoria "${t.name}"? Só é possível se não tiver pedidos.`)) return;
    try {
      await api(`/admin/ticket-types/${t.id}`, { method: 'DELETE' });
      setMsg('Categoria eliminada.');
    } catch (e) {
      setMsg(errorMessage(e));
    }
    await reload();
  };

  // Mudança rápida do estado de venda de uma categoria (efeito imediato no site)
  const setStatus = async (t: TicketTypeRow, status: SalesStatus) => {
    if (status === t.sales_status) return;
    if (!confirm(`Alterar “${t.name}” para “${STATUS_LABEL[status]}”? O site é actualizado de imediato.`)) return;
    try {
      await api(`/admin/ticket-types/${t.id}`, { method: 'PUT', json: { ...t, sales_status: status } });
      setMsg(`${t.name}: ${STATUS_LABEL[status]}.`);
    } catch (e) {
      setMsg(errorMessage(e));
    }
    await reload();
  };

  const toggleSales = async (v: boolean) => {
    try {
      await api('/admin/settings', { method: 'PUT', json: { sales_open: v } });
      setMsg(v ? 'Vendas abertas.' : 'Vendas fechadas.');
    } catch (e) {
      setMsg(errorMessage(e));
    }
    await reloadSettings();
  };

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  return (
    <div>
      <PageHeader
        title="Ingressos, lotes e stock"
        description="Defina categorias, preços em Kz, lotes e quantidades. Os preços só ficam visíveis ao público quando a categoria é publicada."
        actions={<Button size="sm" onClick={() => edit()}><Plus className="h-4 w-4" /> Nova categoria</Button>}
      />
      <Panel className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Estado das vendas</p>
            <p className="text-xs text-fg/50">Com as vendas fechadas, o site mostra “{settings.sales_closed_message}” e não aceita pedidos.</p>
          </div>
          <Toggle checked={settings.sales_open} onChange={toggleSales} label={settings.sales_open ? 'Vendas abertas' : 'Vendas fechadas'} />
        </div>
      </Panel>
      {msg && <Alert tone="info" className="mb-4">{msg}</Alert>}
      {data.length > 0 && (
        <Panel title="Estado de venda no site" className="mb-4">
          {!settings.payment_ready && (
            <Alert tone="warn" className="mb-3" title="Dados de pagamento por validar">
              Um administrador tem de confirmar as coordenadas bancárias oficiais em “Evento e conteúdos” antes de qualquer venda.
            </Alert>
          )}
          <ul className="divide-y divide-fg/10 text-sm">
            {data.map((t) => {
              const b = blockers(t, settings.sales_open, settings.payment_ready);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="flex items-center gap-3">
                    <span className="font-semibold">{t.name}</span>
                    <select aria-label={`Estado de venda de ${t.name}`} className="admin-input h-8 w-auto py-0 text-xs" value={t.sales_status} onChange={(e) => setStatus(t, e.target.value as SalesStatus)}>
                      <option value="abertas">Abertas</option>
                      <option value="suspensas">Suspensas</option>
                      <option value="esgotadas">Esgotada</option>
                    </select>
                  </span>
                  {t.sale_mode === 'consulta' ? (
                    <Badge tone="info">Por consulta — só por proposta VIP</Badge>
                  ) : b.length === 0 ? (
                    <Badge tone="ok">À venda — botão “Comprar bilhete” activo</Badge>
                  ) : (
                    <span className="text-right text-xs text-amber-900">Bloqueado: {b.join(' · ')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      <Panel>
        <Loadable loading={loading} error={error} empty={data.length === 0 ? 'Ainda não existem categorias. Crie a primeira com o preço confirmado pela organização.' : false}>
          <Table head={['Categoria', 'Preço', 'Stock (total / reservado / vendido)', 'Limites', 'Período de vendas', 'Estado', '']}>
            {data.map((t) => (
              <tr key={t.id}>
                <Td className="font-semibold">{t.name}{t.lot_label && <span className="block text-xs font-normal text-gold">{t.lot_label}</span>}</Td>
                <Td>
                  {t.sale_mode === 'consulta' ? <Badge tone="warn">Por consulta</Badge> : formatKz(t.price_kz)}
                  {t.badge && <span className="block text-xs text-gold-deep">{t.badge}</span>}
                </Td>
                <Td>{t.quantity_total} / {t.quantity_reserved} / {t.quantity_sold}<span className="block text-xs text-fg/50">Disponíveis: {t.quantity_total - t.quantity_reserved - t.quantity_sold}</span></Td>
                <Td className="text-xs">{t.max_per_order}/pedido · {t.max_per_customer}/cliente{t.persons_per_ticket > 1 && <span className="block">{t.persons_per_ticket} pessoas/ingresso</span>}</Td>
                <Td className="text-xs">{t.sales_start ? formatDateTime(t.sales_start) : 'Imediato'} → {t.sales_end ? formatDateTime(t.sales_end) : 'sem fim'}</Td>
                <Td>
                  {t.published ? <Badge tone="ok">Visível</Badge> : <Badge>Oculta</Badge>}
                  <span className="mt-1 block"><Badge tone={t.sales_status === 'abertas' ? 'info' : 'warn'}>{STATUS_LABEL[t.sales_status ?? 'abertas']}</Badge></span>
                </Td>
                <Td className="whitespace-nowrap">
                  <Button size="icon" variant="ghost" aria-label={`Editar ${t.name}`} onClick={() => edit(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Histórico de preços de ${t.name}`} onClick={() => setHistoryOf(t)}><History className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Eliminar ${t.name}`} onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Loadable>
      </Panel>

      <Dialog open={!!historyOf} onOpenChange={(v) => !v && setHistoryOf(null)} title={`Histórico de preços · ${historyOf?.name ?? ''}`} description="Os pedidos guardam sempre o preço em vigor no momento da compra.">
        <Loadable loading={history.loading} error={history.error} empty={(history.data ?? []).length === 0 && 'Sem alterações de preço registadas.'}>
          <ul className="divide-y divide-fg/10 text-sm">
            {(history.data ?? []).map((h, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{formatKz(h.old_price_kz)} → <strong>{formatKz(h.new_price_kz)}</strong></span>
                <span className="text-xs text-fg-muted">{formatDateTime(h.changed_at)} · {h.changed_by ?? '—'}</span>
              </li>
            ))}
          </ul>
        </Loadable>
      </Dialog>

      {draft && (
        <Dialog open onOpenChange={(v) => !v && setDraft(null)} title={draft.id ? 'Editar categoria' : 'Nova categoria'} className="max-w-2xl">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="tn">Nome *</Label><input id="tn" className="admin-input" value={draft.name} onChange={set('name')} required minLength={2} maxLength={80} /></div>
            <div><Label htmlFor="tl">Lote</Label><input id="tl" className="admin-input" placeholder="ex.: 1.º Lote" value={draft.lot_label} onChange={set('lot_label')} /></div>
            <div className="sm:col-span-2"><Label htmlFor="td">Descrição</Label><textarea id="td" className="admin-input min-h-[70px]" value={draft.description} onChange={set('description')} /></div>
            <div>
              <Label htmlFor="tsm">Modo de venda</Label>
              <select id="tsm" className="admin-input" value={draft.sale_mode} onChange={(e) => setDraft({ ...draft, sale_mode: e.target.value as Draft['sale_mode'] })}>
                <option value="directo">Compra directa no site (preço público)</option>
                <option value="consulta">Por consulta (VIP — proposta individual)</option>
              </select>
            </div>
            {draft.sale_mode === 'directo' ? (
              <div><Label htmlFor="tp">Preço (Kz)</Label><input id="tp" className="admin-input" inputMode="decimal" value={draft.price_kz} onChange={set('price_kz')} placeholder="Obrigatório para publicar" /></div>
            ) : (
              <p className="self-end text-xs text-fg-muted">Sem preço público. O valor é definido em cada proposta VIP (menu “Gestão VIP”).</p>
            )}
            <div className="sm:col-span-2"><Label htmlFor="tb">Benefícios (um por linha, máx. 15)</Label><textarea id="tb" className="admin-input min-h-[90px]" value={draft.benefits} onChange={set('benefits')} /></div>
            <div><Label htmlFor="tbg">Destaque (etiqueta)</Label><input id="tbg" className="admin-input" maxLength={40} placeholder="ex.: Mais exclusivo" value={draft.badge} onChange={set('badge')} /></div>
            <div><Label htmlFor="tq">Quantidade total *</Label><input id="tq" type="number" min={0} className="admin-input" value={draft.quantity_total} onChange={set('quantity_total')} required /></div>
            <div><Label htmlFor="tmo">Máx. por pedido</Label><input id="tmo" type="number" min={1} max={100} className="admin-input" value={draft.max_per_order} onChange={set('max_per_order')} /></div>
            <div><Label htmlFor="tmc">Máx. por cliente (email)</Label><input id="tmc" type="number" min={1} max={500} className="admin-input" value={draft.max_per_customer} onChange={set('max_per_customer')} /></div>
            <div><Label htmlFor="tpp">Pessoas por ingresso</Label><input id="tpp" type="number" min={1} max={50} className="admin-input" value={draft.persons_per_ticket} onChange={set('persons_per_ticket')} /></div>
            <div><Label htmlFor="ts">Ordem</Label><input id="ts" type="number" className="admin-input" value={draft.sort_order} onChange={set('sort_order')} /></div>
            <div><Label htmlFor="tss">Início das vendas (hora de Luanda)</Label><input id="tss" type="datetime-local" className="admin-input" value={draft.sales_start} onChange={set('sales_start')} /></div>
            <div><Label htmlFor="tse">Fim das vendas (hora de Luanda)</Label><input id="tse" type="datetime-local" className="admin-input" value={draft.sales_end} onChange={set('sales_end')} /></div>
            <div>
              <Label htmlFor="tst">Estado das vendas desta categoria</Label>
              <select id="tst" className="admin-input" value={draft.sales_status} onChange={(e) => setDraft({ ...draft, sales_status: e.target.value as SalesStatus })}>
                <option value="abertas">Abertas (se as vendas gerais estiverem abertas)</option>
                <option value="suspensas">Suspensas</option>
                <option value="esgotadas">Esgotada</option>
              </select>
            </div>
            <div className="self-end pb-2"><Toggle checked={draft.published} onChange={(v) => setDraft({ ...draft, published: v })} label="Publicado no site" /></div>
            {formError && <Alert tone="bad" className="sm:col-span-2">{formError}</Alert>}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={busy}>Guardar</Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
