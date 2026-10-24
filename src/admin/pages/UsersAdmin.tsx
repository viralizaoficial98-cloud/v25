import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/misc';
import { requireSupabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import type { StaffRole } from '@/lib/types';
import { useAsync } from '@/hooks/useAsync';
import { Label, Loadable, PageHeader, Panel, Table, Td } from '../ui';
import { ROLE_LABEL, useAdmin } from '../session';

interface Staff { user_id: string; email: string; full_name: string; role: StaffRole; active: boolean; created_at: string }

const PERMS: Record<StaffRole, string> = {
  admin: 'Acesso total: ingressos e preços, conteúdos, configurações, emails, equipa, auditoria, pagamentos e check-in.',
  financeiro: 'Pedidos, comprovativos, aprovação/rejeição de pagamentos, reenvio de ingressos, relatórios e dashboard.',
  checkin: 'Apenas scanner/validação de ingressos à entrada e indicadores básicos.',
};

export default function UsersAdmin() {
  const sb = requireSupabase();
  const { session } = useAdmin();
  const { data = [], loading, error, reload } = useAsync(async () => {
    const { data, error } = await sb.from('staff').select('*').order('created_at');
    if (error) throw error;
    return data as Staff[];
  }, []);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('checkin');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const setStaff = async (p: { email: string; role: StaffRole; name?: string; active: boolean }) => {
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await sb.rpc('admin_set_staff', { p_email: p.email, p_role: p.role, p_full_name: p.name ?? '', p_active: p.active });
      if (error) throw error;
      setMsg({ tone: 'ok', text: 'Permissões actualizadas.' });
      await reload();
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Utilizadores e permissões" description="As contas são criadas no Supabase (Authentication → Users → Add user / Invite). Aqui atribui o perfil." />
      {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Atribuir perfil">
          <form
            className="space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void setStaff({ email, role, name, active: true }).then(() => { setEmail(''); setName(''); });
            }}
          >
            <div><Label htmlFor="ue">Email da conta *</Label><input id="ue" type="email" required className="admin-input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label htmlFor="un">Nome (aparece no registo de check-in)</Label><input id="un" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <Label htmlFor="ur">Perfil</Label>
              <select id="ur" className="admin-input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <Button type="submit" size="sm" loading={busy}><UserPlus className="h-4 w-4" /> Guardar</Button>
          </form>
        </Panel>
        <Panel title="Perfis disponíveis">
          <dl className="space-y-3 text-sm">
            {(Object.keys(PERMS) as StaffRole[]).map((r) => (
              <div key={r}><dt className="font-semibold text-gold-light">{ROLE_LABEL[r]}</dt><dd className="text-cream/60">{PERMS[r]}</dd></div>
            ))}
          </dl>
        </Panel>
      </div>
      <Panel title="Equipa">
        <Loadable loading={loading} error={error}>
          <Table head={['Utilizador', 'Perfil', 'Estado', 'Desde', '']}>
            {data.map((s) => {
              const self = s.user_id === session?.user.id;
              return (
                <tr key={s.user_id}>
                  <Td>{s.full_name || '—'}<span className="block text-xs text-cream/50">{s.email}</span></Td>
                  <Td>
                    <select className="admin-input w-auto" disabled={self || busy} value={s.role} onChange={(e) => setStaff({ email: s.email, role: e.target.value as StaffRole, active: s.active })} aria-label={`Perfil de ${s.email}`}>
                      {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </Td>
                  <Td>{s.active ? <Badge tone="ok">Activo</Badge> : <Badge tone="bad">Desactivado</Badge>}</Td>
                  <Td className="text-xs">{formatDateTime(s.created_at)}</Td>
                  <Td>
                    {!self && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStaff({ email: s.email, role: s.role, active: !s.active })}>
                        {s.active ? 'Desactivar' : 'Reactivar'}
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Loadable>
      </Panel>
    </div>
  );
}
