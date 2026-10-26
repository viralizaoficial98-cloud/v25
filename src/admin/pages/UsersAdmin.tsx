import { useState, type FormEvent } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/misc';
import { api } from '@/lib/http';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import type { StaffRole } from '@/lib/types';
import { useAsync } from '@/hooks/useAsync';
import { Label, Loadable, PageHeader, Panel, Table, Td } from '../ui';
import { ROLE_LABEL, useAdmin } from '../session';

interface Staff { user_id: string; email: string; full_name: string; role: StaffRole; active: boolean; has_password: boolean; last_login_at: string | null; created_at: string }

const PERMS: Record<StaffRole, string> = {
  admin: 'Acesso total: ingressos e preços, conteúdos, configurações, emails, equipa, auditoria, pagamentos e check-in.',
  financeiro: 'Pedidos e participantes, comprovativos, aprovação/rejeição de pagamentos, reenvio de ingressos, relatórios e dashboard.',
  checkin: 'Apenas scanner/validação de ingressos à entrada e indicadores básicos.',
};

export default function UsersAdmin() {
  const { user } = useAdmin();
  const { data = [], loading, error, reload } = useAsync(() => api<Staff[]>('/admin/users'), []);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('checkin');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'ok', text: ok });
      await reload();
      return true;
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () => api('/admin/users', { json: { email: email.trim(), full_name: name, role, password } }),
      password ? 'Utilizador criado.' : 'Utilizador criado. Foi colocado na fila um email de convite para definir a palavra-passe.',
    );
    if (ok) {
      setEmail('');
      setName('');
      setPassword('');
    }
  };

  return (
    <div>
      <PageHeader title="Utilizadores e permissões" description="Contas da equipa e respectivos perfis. As permissões são sempre verificadas no servidor." />
      {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Novo utilizador">
          <form className="space-y-3" onSubmit={create}>
            <div><Label htmlFor="ue">Email *</Label><input id="ue" type="email" required className="admin-input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label htmlFor="un">Nome (aparece no registo de check-in)</Label><input id="un" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div>
              <Label htmlFor="ur">Perfil</Label>
              <select id="ur" className="admin-input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="up">Palavra-passe inicial (opcional)</Label>
              <input id="up" type="password" autoComplete="new-password" className="admin-input" value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="mt-1 text-xs text-fg/45">Vazio = envia convite por email (válido 72 h). Mínimo 10 caracteres com letras e números.</p>
            </div>
            <Button type="submit" size="sm" loading={busy}><UserPlus className="h-4 w-4" /> Criar</Button>
          </form>
        </Panel>
        <Panel title="Perfis disponíveis">
          <dl className="space-y-3 text-sm">
            {(Object.keys(PERMS) as StaffRole[]).map((r) => (
              <div key={r}><dt className="font-semibold text-gold-light">{ROLE_LABEL[r]}</dt><dd className="text-fg/60">{PERMS[r]}</dd></div>
            ))}
          </dl>
        </Panel>
      </div>
      <Panel title="Equipa">
        <Loadable loading={loading} error={error}>
          <Table head={['Utilizador', 'Perfil', 'Estado', 'Último acesso', '']}>
            {data.map((s) => {
              const self = s.user_id === user?.id;
              return (
                <tr key={s.user_id}>
                  <Td>{s.full_name || '—'}<span className="block text-xs text-fg/50">{s.email}</span></Td>
                  <Td>
                    <select
                      className="admin-input w-auto"
                      disabled={self || busy}
                      value={s.role}
                      onChange={(e) => run(() => api(`/admin/users/${s.user_id}`, { method: 'PUT', json: { role: e.target.value } }), 'Perfil actualizado.')}
                      aria-label={`Perfil de ${s.email}`}
                    >
                      {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </Td>
                  <Td>
                    {s.active ? <Badge tone="ok">Activo</Badge> : <Badge tone="bad">Desactivado</Badge>}
                    {!s.has_password && <Badge tone="warn" className="ml-1">Convite pendente</Badge>}
                  </Td>
                  <Td className="text-xs">{s.last_login_at ? formatDateTime(s.last_login_at) : '—'}</Td>
                  <Td className="whitespace-nowrap">
                    {!self && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/admin/users/${s.user_id}`, { method: 'PUT', json: { active: !s.active } }), s.active ? 'Utilizador desactivado.' : 'Utilizador reactivado.')}>
                        {s.active ? 'Desactivar' : 'Reactivar'}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/admin/users/${s.user_id}/reset`, { method: 'POST' }), 'Email de redefinição colocado na fila.')}>
                      <KeyRound className="h-4 w-4" /> {s.has_password ? 'Redefinir' : 'Reenviar convite'}
                    </Button>
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
