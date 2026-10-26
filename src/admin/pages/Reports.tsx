import { useState } from 'react';
import { Crown, FileDown, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/http';
import { downloadBlob } from '@/lib/csv';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKz } from '@/lib/format';
import { ORDER_STATUS } from '@/lib/status';
import type { OrderStatus, TicketTypeRow } from '@/lib/types';
import { useAsync } from '@/hooks/useAsync';
import { Label, PageHeader, Panel } from '../ui';
import { useAdmin } from '../session';

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

interface Summary {
  stats: Record<string, number> & { by_type: { name: string; lot_label: string; price_kz: number | null; total: number; reserved: number; sold: number; available: number }[] };
  orders: { order_code: string; status: OrderStatus; full_name: string; category: string; quantity: number; total_kz: number; payment_reference: string | null }[];
}

export default function Reports() {
  const { can } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState({ status: '', category: '', source: '', from: '', to: '' });
  const cats = useAsync(() => (can('ticket_types.manage') ? api<TicketTypeRow[]>('/admin/ticket-types') : Promise.resolve([] as TicketTypeRow[])), []);
  const qs = () => {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    return p.toString() ? `?${p}` : '';
  };
  const filterLabel = () =>
    [
      f.status && `Estado: ${ORDER_STATUS[f.status as OrderStatus]?.label ?? f.status}`,
      f.category && `Categoria: ${cats.data?.find((c) => c.id === f.category)?.name ?? ''}`,
      f.source && `Origem: ${f.source === 'vip' ? 'VIP' : 'Checkout'}`,
      f.from && `De ${f.from}`,
      f.to && `até ${f.to}`,
    ].filter(Boolean).join(' · ') || 'Sem filtros';
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  // CSV gerado no servidor (Excel: ";" + BOM UTF-8, com protecção contra injecção de fórmulas)
  const csv = (name: 'orders' | 'tickets' | 'checkins' | 'vip', file: string) =>
    run(name, async () => {
      const blob = await api<Blob>(`/admin/reports/${name}.csv${name === 'orders' ? qs() : ''}`, { blob: true });
      downloadBlob(blob, `v25-${file}-${stamp()}.csv`, 'text/csv;charset=utf-8');
    });

  const summaryPdf = () =>
    run('pdf', async () => {
      const { stats: s, orders: rows } = await api<Summary>(`/admin/reports/summary${qs()}`);
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('V25 — O Legado · Relatório de vendas', 14, 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Gerado em ${formatDateTime(new Date().toISOString(), { second: '2-digit' })} (hora de Luanda)`, 14, 24);
      doc.text(`Filtros: ${filterLabel()}`, 14, 29);
      autoTable(doc, {
        startY: 34,
        head: [['Indicador', 'Valor']],
        body: [
          ['Total de inscrições', String(s.orders_total)],
          ['Pendentes de pagamento', String(s.orders_pending_payment)],
          ['Comprovativos em análise', String(s.proofs_in_review)],
          ['Pagamentos aprovados', String(s.payments_approved)],
          ['Pagamentos rejeitados', String(s.payments_rejected)],
          ['Cancelados', String(s.orders_cancelled)],
          ['Ingressos emitidos', String(s.tickets_issued)],
          ['Ingressos utilizados', String(s.tickets_used)],
          ['Receita confirmada', formatKz(s.revenue_confirmed_kz)],
          ...(s.checkins !== undefined ? [['Check-ins', String(s.checkins)]] : []),
          ...(s.vip_requests_total !== undefined ? [['Solicitações VIP', String(s.vip_requests_total)]] : []),
          ['Convidados confirmados', String(s.guests_confirmed)],
        ],
        headStyles: { fillColor: [140, 90, 43] },
      });
      autoTable(doc, {
        head: [['Categoria', 'Preço', 'Total', 'Reservados', 'Vendidos', 'Disponíveis']],
        body: s.by_type.map((t) => [`${t.name}${t.lot_label ? ` (${t.lot_label})` : ''}`, formatKz(t.price_kz), t.total, t.reserved, t.sold, t.available]),
        headStyles: { fillColor: [140, 90, 43] },
      });
      autoTable(doc, {
        head: [['Pedido', 'Nome', 'Categoria', 'Qtd', 'Total', 'Estado', 'Referência']],
        body: rows.map((o) => [o.order_code, o.full_name, o.category, o.quantity, formatKz(o.total_kz), ORDER_STATUS[o.status]?.label ?? o.status, o.payment_reference ?? '']),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [140, 90, 43] },
      });
      doc.save(`v25-relatorio-${stamp()}.pdf`);
    });

  return (
    <div>
      <PageHeader title="Relatórios" description="Exportações em CSV (Excel) e PDF. Contêm dados pessoais — guarde-as em local seguro. Cada exportação fica registada na auditoria." />
      {msg && <Alert tone="bad" className="mb-4">{msg}</Alert>}
      <Panel title="Filtros (pedidos CSV e relatório PDF)" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <Label htmlFor="rf-st">Estado</Label>
            <select id="rf-st" className="admin-input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">Todos</option>
              {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((k) => <option key={k} value={k}>{ORDER_STATUS[k].label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="rf-cat">Categoria</Label>
            <select id="rf-cat" className="admin-input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="">Todas</option>
              {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="rf-src">Origem</Label>
            <select id="rf-src" className="admin-input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
              <option value="">Todas</option>
              <option value="checkout">Checkout</option>
              <option value="vip">Proposta VIP</option>
            </select>
          </div>
          <div><Label htmlFor="rf-from">De (data)</Label><input id="rf-from" type="date" className="admin-input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
          <div><Label htmlFor="rf-to">Até (data)</Label><input id="rf-to" type="date" className="admin-input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Pedidos, participantes e pagamentos">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={busy === 'orders'} onClick={() => csv('orders', 'pedidos')}><FileSpreadsheet className="h-4 w-4" /> Pedidos (CSV)</Button>
            <Button size="sm" variant="outline" loading={busy === 'pdf'} onClick={summaryPdf}><FileDown className="h-4 w-4" /> Relatório de vendas (PDF)</Button>
          </div>
        </Panel>
        {can('vip.manage') && (
          <Panel title="VIP">
            <Button size="sm" variant="outline" loading={busy === 'vip'} onClick={() => csv('vip', 'vip')}><Crown className="h-4 w-4" /> Solicitações e propostas VIP (CSV)</Button>
          </Panel>
        )}
        <Panel title="Ingressos e entradas">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={busy === 'tickets'} onClick={() => csv('tickets', 'ingressos')}><FileSpreadsheet className="h-4 w-4" /> Ingressos (CSV)</Button>
            {can('reports.checkins') && (
              <Button size="sm" variant="outline" loading={busy === 'checkins'} onClick={() => csv('checkins', 'checkins')}><FileSpreadsheet className="h-4 w-4" /> Registo de check-in (CSV)</Button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
