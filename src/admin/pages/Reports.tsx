import { useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { requireSupabase } from '@/lib/supabase';
import { downloadBlob, toCsv } from '@/lib/csv';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKz } from '@/lib/format';
import { ORDER_STATUS } from '@/lib/status';
import type { OrderRow } from '@/lib/types';
import { PageHeader, Panel } from '../ui';
import { useAdmin } from '../session';

async function fetchAll<T>(table: string, select: string, order = 'created_at'): Promise<T[]> {
  const sb = requireSupabase();
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) return out;
  }
}

type OrderX = OrderRow & { ticket_types: { name: string; lot_label: string } | null };
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

export default function Reports() {
  const { role } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
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

  const ordersCsv = () =>
    run('orders', async () => {
      const rows = await fetchAll<OrderX>('orders', '*, ticket_types(name, lot_label)');
      const csv = toCsv(
        rows.map((o) => ({
          ...o,
          estado: ORDER_STATUS[o.status].label,
          categoria: `${o.ticket_types?.name ?? ''}${o.ticket_types?.lot_label ? ` (${o.ticket_types.lot_label})` : ''}`,
          criado: formatDateTime(o.created_at),
          revisto: o.reviewed_at ? formatDateTime(o.reviewed_at) : '',
        })),
        [
          { key: 'order_code', label: 'Pedido' }, { key: 'estado', label: 'Estado' }, { key: 'full_name', label: 'Nome' },
          { key: 'email', label: 'Email' }, { key: 'phone', label: 'Telefone' }, { key: 'categoria', label: 'Categoria' },
          { key: 'quantity', label: 'Quantidade' }, { key: 'guests_total', label: 'Convidados' }, { key: 'unit_price_kz', label: 'Preço unitário (Kz)' },
          { key: 'total_kz', label: 'Total (Kz)' }, { key: 'payment_reference', label: 'Referência bancária' },
          { key: 'amount_confirmed_kz', label: 'Valor confirmado (Kz)' }, { key: 'criado', label: 'Criado' }, { key: 'revisto', label: 'Revisto' },
          { key: 'rejection_reason', label: 'Motivo rejeição' }, { key: 'cancel_reason', label: 'Motivo cancelamento' },
        ],
      );
      downloadBlob(csv, `v25-pedidos-${stamp()}.csv`, 'text/csv;charset=utf-8');
    });

  const ticketsCsv = () =>
    run('tickets', async () => {
      type T = { ticket_code: string; seq: number; holder_name: string; status: string; issued_at: string; checked_in_at: string | null; orders: { order_code: string } | null; ticket_types: { name: string } | null };
      const rows = await fetchAll<T>('tickets', 'ticket_code, seq, holder_name, status, issued_at, checked_in_at, orders(order_code), ticket_types(name)', 'issued_at');
      const csv = toCsv(
        rows.map((t) => ({ ...t, pedido: t.orders?.order_code, categoria: t.ticket_types?.name, emitido: formatDateTime(t.issued_at), entrada: t.checked_in_at ? formatDateTime(t.checked_in_at) : '' })),
        [
          { key: 'ticket_code', label: 'Ingresso' }, { key: 'pedido', label: 'Pedido' }, { key: 'seq', label: 'N.º' }, { key: 'holder_name', label: 'Titular' },
          { key: 'categoria', label: 'Categoria' }, { key: 'status', label: 'Estado' }, { key: 'emitido', label: 'Emitido' }, { key: 'entrada', label: 'Entrada' },
        ],
      );
      downloadBlob(csv, `v25-ingressos-${stamp()}.csv`, 'text/csv;charset=utf-8');
    });

  const summaryPdf = () =>
    run('pdf', async () => {
      const sb = requireSupabase();
      const [{ data: stats, error }, rows] = await Promise.all([sb.rpc('admin_dashboard'), fetchAll<OrderX>('orders', '*, ticket_types(name, lot_label)')]);
      if (error) throw error;
      const s = stats as Record<string, number> & { by_type: { name: string; lot_label: string; price_kz: number | null; total: number; reserved: number; sold: number; available: number }[] };
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('V25 — O Legado · Relatório de vendas', 14, 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Gerado em ${formatDateTime(new Date().toISOString(), { second: '2-digit' })} (hora de Luanda)`, 14, 24);
      autoTable(doc, {
        startY: 30,
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
        body: rows.map((o) => [o.order_code, o.full_name, o.ticket_types?.name ?? '', o.quantity, formatKz(o.total_kz), ORDER_STATUS[o.status].label, o.payment_reference ?? '']),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [140, 90, 43] },
      });
      doc.save(`v25-relatorio-${stamp()}.pdf`);
    });

  const checkinsCsv = () =>
    run('checkins', async () => {
      type C = { created_at: string; input_code: string | null; result: string; staff_id: string | null };
      const rows = await fetchAll<C>('checkin_log', 'created_at, input_code, result, staff_id');
      downloadBlob(
        toCsv(rows.map((r) => ({ ...r, data: formatDateTime(r.created_at, { second: '2-digit' }) })), [
          { key: 'data', label: 'Data' }, { key: 'input_code', label: 'Código' }, { key: 'result', label: 'Resultado' }, { key: 'staff_id', label: 'Operador (ID)' },
        ]),
        `v25-checkins-${stamp()}.csv`,
        'text/csv;charset=utf-8',
      );
    });

  return (
    <div>
      <PageHeader title="Relatórios" description="Exportações em CSV (Excel) e PDF. Contêm dados pessoais — guarde-as em local seguro." />
      {msg && <Alert tone="bad" className="mb-4">{msg}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Pedidos e pagamentos">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={busy === 'orders'} onClick={ordersCsv}><FileSpreadsheet className="h-4 w-4" /> Pedidos (CSV)</Button>
            <Button size="sm" variant="outline" loading={busy === 'pdf'} onClick={summaryPdf}><FileDown className="h-4 w-4" /> Relatório de vendas (PDF)</Button>
          </div>
        </Panel>
        <Panel title="Ingressos e entradas">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={busy === 'tickets'} onClick={ticketsCsv}><FileSpreadsheet className="h-4 w-4" /> Ingressos (CSV)</Button>
            {role === 'admin' && <Button size="sm" variant="outline" loading={busy === 'checkins'} onClick={checkinsCsv}><FileSpreadsheet className="h-4 w-4" /> Registo de check-in (CSV)</Button>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
