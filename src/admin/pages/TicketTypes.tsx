import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/http';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKz, fromLuandaInput, toLuandaInput } from '@/lib/format';
import type { TicketTypeRow } from '@/lib/types';
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
};

const EMPTY: Draft = {
  name: '', lot_label: '', description: '', price_kz: '', quantity_total: '', max_per_order: '4', max_per_customer: '10',
  persons_per_ticket: '1', sales_start: '', sales_end: '', published: false, sort_order: '0',
};

export default function TicketTypes() {
  const { settings, reload: reloadSettings } = useSettings();
  const { data = [], loading, error, reload } = useAsync(() => api<TicketTypeRow[]>('/admin/ticket-types'), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const edit = (t?: TicketTypeRow) =>
    setDraft(
      t
        ? {
            id: t.id, name: t.name, lot_label: t.lot_label, description: t.description, price_kz: t.price_kz?.toString() ?? '',
            quantity_total: String(t.quantity_total), max_per_order: String(t.max_per_order), max_per_customer: String(t.max_per_customer),
            persons_per_ticket: String(t.persons_per_ticket), sales_start: toLuandaInput(t.sales_start), sales_end: toLuandaInput(t.sales_end),
            published: t.published, sort_order: String(t.sort_order),
          }
        : EMPTY,
    );

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setFormError(null);
    const price = draft.price_kz.trim() ? Number(draft.price_kz.replace(/\s/g, '').replace(',', '.')) : null;
    if (draft.published && (price === null || !(price > 0))) {
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
      <Panel>
        <Loadable loading={loading} error={error} empty={data.length === 0 ? 'Ainda não existem categorias. Crie a primeira com o preço confirmado pela organização.' : false}>
          <Table head={['Categoria', 'Preço', 'Stock (total / reservado / vendido)', 'Limites', 'Período de vendas', 'Estado', '']}>
            {data.map((t) => (
              <tr key={t.id}>
                <Td className="font-semibold">{t.name}{t.lot_label && <span className="block text-xs font-normal text-gold">{t.lot_label}</span>}</Td>
                <Td>{formatKz(t.price_kz)}</Td>
                <Td>{t.quantity_total} / {t.quantity_reserved} / {t.quantity_sold}<span className="block text-xs text-fg/50">Disponíveis: {t.quantity_total - t.quantity_reserved - t.quantity_sold}</span></Td>
                <Td className="text-xs">{t.max_per_order}/pedido · {t.max_per_customer}/cliente{t.persons_per_ticket > 1 && <span className="block">{t.persons_per_ticket} pessoas/ingresso</span>}</Td>
                <Td className="text-xs">{t.sales_start ? formatDateTime(t.sales_start) : 'Imediato'} → {t.sales_end ? formatDateTime(t.sales_end) : 'sem fim'}</Td>
                <Td>{t.published ? <Badge tone="ok">Publicado</Badge> : <Badge>Rascunho</Badge>}</Td>
                <Td className="whitespace-nowrap">
                  <Button size="icon" variant="ghost" aria-label={`Editar ${t.name}`} onClick={() => edit(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={`Eliminar ${t.name}`} onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Loadable>
      </Panel>

      {draft && (
        <Dialog open onOpenChange={(v) => !v && setDraft(null)} title={draft.id ? 'Editar categoria' : 'Nova categoria'} className="max-w-2xl">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="tn">Nome *</Label><input id="tn" className="admin-input" value={draft.name} onChange={set('name')} required minLength={2} maxLength={80} /></div>
            <div><Label htmlFor="tl">Lote</Label><input id="tl" className="admin-input" placeholder="ex.: 1.º Lote" value={draft.lot_label} onChange={set('lot_label')} /></div>
            <div className="sm:col-span-2"><Label htmlFor="td">Descrição</Label><textarea id="td" className="admin-input min-h-[70px]" value={draft.description} onChange={set('description')} /></div>
            <div><Label htmlFor="tp">Preço (Kz)</Label><input id="tp" className="admin-input" inputMode="decimal" value={draft.price_kz} onChange={set('price_kz')} placeholder="Obrigatório para publicar" /></div>
            <div><Label htmlFor="tq">Quantidade total *</Label><input id="tq" type="number" min={0} className="admin-input" value={draft.quantity_total} onChange={set('quantity_total')} required /></div>
            <div><Label htmlFor="tmo">Máx. por pedido</Label><input id="tmo" type="number" min={1} max={100} className="admin-input" value={draft.max_per_order} onChange={set('max_per_order')} /></div>
            <div><Label htmlFor="tmc">Máx. por cliente (email)</Label><input id="tmc" type="number" min={1} max={500} className="admin-input" value={draft.max_per_customer} onChange={set('max_per_customer')} /></div>
            <div><Label htmlFor="tpp">Pessoas por ingresso</Label><input id="tpp" type="number" min={1} max={50} className="admin-input" value={draft.persons_per_ticket} onChange={set('persons_per_ticket')} /></div>
            <div><Label htmlFor="ts">Ordem</Label><input id="ts" type="number" className="admin-input" value={draft.sort_order} onChange={set('sort_order')} /></div>
            <div><Label htmlFor="tss">Início das vendas (hora de Luanda)</Label><input id="tss" type="datetime-local" className="admin-input" value={draft.sales_start} onChange={set('sales_start')} /></div>
            <div><Label htmlFor="tse">Fim das vendas (hora de Luanda)</Label><input id="tse" type="datetime-local" className="admin-input" value={draft.sales_end} onChange={set('sales_end')} /></div>
            <div className="sm:col-span-2"><Toggle checked={draft.published} onChange={(v) => setDraft({ ...draft, published: v })} label="Publicado no site" /></div>
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
