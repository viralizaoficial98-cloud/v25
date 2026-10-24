import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { requireSupabase } from '@/lib/supabase';
import { formatKz } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { Loadable, PageHeader, Panel, Table, Td } from '../ui';
import { useAdmin } from '../session';

interface Stats {
  orders_total: number;
  orders_pending_payment: number;
  proofs_in_review: number;
  payments_approved: number;
  payments_rejected: number;
  orders_cancelled: number;
  tickets_issued: number;
  tickets_used: number;
  revenue_confirmed_kz: number | null;
  guests_confirmed: number;
  capacity: number | null;
  by_type: { id: string; name: string; lot_label: string; price_kz: number | null; total: number; reserved: number; sold: number; available: number; published: boolean }[];
}

export default function Dashboard() {
  const { role } = useAdmin();
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await requireSupabase().rpc('admin_dashboard');
    if (error) throw error;
    return data as Stats;
  }, []);

  const finance = role === 'admin' || role === 'financeiro';
  const cards = data
    ? [
        { label: 'Total de inscrições', value: data.orders_total },
        { label: 'Pedidos pendentes de pagamento', value: data.orders_pending_payment },
        { label: 'Comprovativos em análise', value: data.proofs_in_review, to: finance ? '/admin/pagamentos' : undefined, highlight: data.proofs_in_review > 0 },
        { label: 'Pagamentos aprovados', value: data.payments_approved },
        { label: 'Pagamentos rejeitados', value: data.payments_rejected },
        { label: 'Ingressos emitidos', value: data.tickets_issued },
        { label: 'Ingressos utilizados', value: data.tickets_used },
        ...(data.revenue_confirmed_kz !== null ? [{ label: 'Receita confirmada', value: formatKz(data.revenue_confirmed_kz) }] : []),
        {
          label: 'Convidados confirmados / capacidade',
          value: `${data.guests_confirmed}${data.capacity ? ` / ${data.capacity}` : ''}`,
        },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visão geral em tempo real das inscrições, pagamentos e entradas."
        actions={<Button variant="subtle" size="sm" onClick={() => reload()} loading={loading}><RefreshCw className="h-4 w-4" /> Actualizar</Button>}
      />
      <Loadable loading={loading && !data} error={error}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const body = (
              <div className={`h-full rounded-2xl border p-5 ${c.highlight ? 'border-gold/50 bg-gold/10' : 'border-white/10 bg-ink-800/70'}`}>
                <p className="text-xs uppercase tracking-[0.14em] text-cream/50">{c.label}</p>
                <p className="mt-2 font-display text-4xl text-cream">{c.value}</p>
              </div>
            );
            return c.to ? <Link key={c.label} to={c.to}>{body}</Link> : <div key={c.label}>{body}</div>;
          })}
        </div>
        {data && (
          <Panel title="Capacidade e disponibilidade por categoria" className="mt-6">
            {data.by_type.length === 0 ? (
              <p className="text-sm text-cream/50">Ainda não existem categorias de ingresso. {role === 'admin' && <Link to="/admin/ingressos" className="text-gold-light underline">Criar ingressos</Link>}</p>
            ) : (
              <Table head={['Categoria', 'Preço', 'Total', 'Reservados', 'Vendidos', 'Disponíveis', 'Ocupação', 'Estado']}>
                {data.by_type.map((t) => {
                  const pct = t.total ? Math.round(((t.sold + t.reserved) / t.total) * 100) : 0;
                  return (
                    <tr key={t.id}>
                      <Td className="font-semibold">{t.name}{t.lot_label && <span className="block text-xs font-normal text-cream/50">{t.lot_label}</span>}</Td>
                      <Td>{formatKz(t.price_kz)}</Td>
                      <Td>{t.total}</Td>
                      <Td>{t.reserved}</Td>
                      <Td>{t.sold}</Td>
                      <Td>{t.available}</Td>
                      <Td>
                        <div className="h-2 w-24 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gold" style={{ width: `${pct}%` }} /></div>
                        <span className="text-xs text-cream/50">{pct}%</span>
                      </Td>
                      <Td>{t.published ? <Badge tone="ok">Publicado</Badge> : <Badge>Rascunho</Badge>}</Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Panel>
        )}
      </Loadable>
    </div>
  );
}
