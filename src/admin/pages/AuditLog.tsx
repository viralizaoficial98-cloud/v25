import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requireSupabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { Loadable, PageHeader, Panel, Table, Td } from '../ui';

interface Entry { id: number; actor_email: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown>; created_at: string }
const PAGE = 50;

export default function AuditLog() {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const { data, loading, error } = useAsync(async () => {
    const { data, error, count } = await requireSupabase()
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('id', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    return { rows: data as Entry[], count: count ?? 0 };
  }, [page]);
  const pages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE));

  return (
    <div>
      <PageHeader title="Registo de auditoria" description="Aprovações, rejeições, cancelamentos, alterações de preços, configurações e equipa. Registo apenas de leitura." />
      <Panel>
        <Loadable loading={loading && !data} error={error} empty={data?.rows.length === 0 ? 'Sem registos.' : false}>
          <Table head={['Data', 'Utilizador', 'Acção', 'Entidade', 'Detalhes']}>
            {data?.rows.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(e.created_at, { second: '2-digit' })}</Td>
                <Td className="text-xs">{e.actor_email ?? 'sistema'}</Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td className="text-xs">{e.entity}{e.entity_id ? ` · ${e.entity_id.slice(0, 8)}` : ''}</Td>
                <Td>
                  <button type="button" className="text-xs text-gold-light underline" onClick={() => setOpen(open === e.id ? null : e.id)}>
                    {open === e.id ? 'Ocultar' : 'Ver'}
                  </button>
                  {open === e.id && <pre className="mt-2 max-h-64 max-w-xl overflow-auto rounded-lg bg-black/40 p-2 text-[11px] text-cream/70">{JSON.stringify(e.details, null, 2)}</pre>}
                </Td>
              </tr>
            ))}
          </Table>
          <div className="mt-4 flex items-center justify-end gap-2 text-xs text-cream/50">
            <Button size="icon" variant="ghost" aria-label="Anterior" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            Página {page + 1} de {pages}
            <Button size="icon" variant="ghost" aria-label="Seguinte" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </Loadable>
      </Panel>
    </div>
  );
}
