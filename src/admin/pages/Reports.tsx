import { useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/http';
import { downloadBlob } from '@/lib/csv';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKz } from '@/lib/format';
import { ORDER_STATUS } from '@/lib/status';
import type { OrderStatus } from '@/lib/types';
import { PageHeader, Panel } from '../ui';
import { useAdmin } from '../session';

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

interface Summary {
  stats: Record<string, number> & { by_type: { name: string; lot_label: string; price_kz: number | null; total: number; reserved: number; sold: number; available: number }[] };
  orders: { order_code: string; status: OrderStatus; full_name: string; category: string; quantity: number; total_kz: number; payment_reference: string | null }[];
}

export default function Reports() {
  const { can } = useAdmin();
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

  // CSV gerado no servidor (Excel: ";" + BOM UTF-8, com protecção contra injecção de fórmulas)
  const csv = (name: 'orders' | 'tickets' | 'checkins', file: string) =>
    run(name, async () => {
      const blob = await api<Blob>(`/admin/reports/${name}.csv`, { blob: true });
      downloadBlob(blob, `v25-${file}-${stamp()}.csv`, 'text/csv;charset=utf-8');
    });

  const summaryPdf = () =>
    run('pdf', async () => {
      const { stats: s, orders: rows } = await api<Summary>('/admin/reports/summary');
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
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Pedidos, participantes e pagamentos">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={busy === 'orders'} onClick={() => csv('orders', 'pedidos')}><FileSpreadsheet className="h-4 w-4" /> Pedidos (CSV)</Button>
            <Button size="sm" variant="outline" loading={busy === 'pdf'} onClick={summaryPdf}><FileDown className="h-4 w-4" /> Relatório de vendas (PDF)</Button>
          </div>
        </Panel>
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
