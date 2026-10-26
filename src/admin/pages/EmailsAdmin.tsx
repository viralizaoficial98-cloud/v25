import { useState, type FormEvent } from 'react';
import { BellRing, PlayCircle, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/misc';
import { api } from '@/lib/http';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { Label, Loadable, PageHeader, Panel, Table, Td } from '../ui';

interface Outbox { id: number; template: string; to_email: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null }
interface SmtpStatus { configured: boolean; missing: string[]; host?: string; port?: number; from?: string }

const TEMPLATE_LABEL: Record<string, string> = {
  pedido_criado: 'Pedido criado + instruções de pagamento',
  comprovativo_recebido: 'Comprovativo recebido',
  pagamento_aprovado: 'Pagamento aprovado',
  pagamento_rejeitado: 'Pagamento rejeitado',
  ingresso_disponivel: 'Ingresso digital disponível',
  lembrete_evento: 'Lembrete do evento',
  acesso_pedido: 'Recuperação de acesso',
  recuperar_senha: 'Redefinição de palavra-passe (equipa)',
  convite_equipa: 'Convite para a equipa',
  pedido_cancelado: 'Pedido cancelado',
  teste_smtp: 'Teste SMTP',
};

export default function EmailsAdmin() {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');

  const status = useAsync(() => api<SmtpStatus>('/admin/emails/status'), []);
  const outbox = useAsync(() => api<Outbox[]>('/admin/emails'), []);

  const act = async (name: string, fn: () => Promise<string>) => {
    setBusy(name);
    setMsg(null);
    try {
      setMsg({ tone: 'ok', text: await fn() });
      await outbox.reload();
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const process = () =>
    act('process', async () => {
      const r = await api<{ sent: number; failed: number; skipped?: string }>('/admin/emails/process', { method: 'POST' });
      if (r.skipped) return r.skipped;
      return `Processados: ${r.sent} enviados, ${r.failed} com falha.`;
    });

  const pending = (outbox.data ?? []).filter((o) => o.status === 'pendente').length;

  return (
    <div>
      <PageHeader title="Emails e SMTP" description="As mensagens ficam numa fila e são enviadas pelo servidor (cron do cPanel ou botão abaixo) através do SMTP configurado no ficheiro .env privado." />
      {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Estado da integração SMTP" actions={<Button size="sm" variant="ghost" onClick={() => status.reload()}><RefreshCw className="h-4 w-4" /></Button>}>
          {status.loading ? (
            <p className="text-sm text-fg/50">A verificar…</p>
          ) : !status.data ? (
            <Alert tone="bad">Não foi possível obter o estado do SMTP.</Alert>
          ) : status.data.configured ? (
            <div className="space-y-1 text-sm">
              <Badge tone="ok">Configurado</Badge>
              <p className="text-fg/70">Servidor: {status.data.host}:{status.data.port}</p>
              <p className="text-fg/70">Remetente: {status.data.from}</p>
            </div>
          ) : (
            <Alert tone="warn" title="SMTP por configurar">
              Faltam as variáveis: {status.data.missing.join(', ')}. Defina-as no ficheiro <code>.env</code> privado da API (fora de public_html — ver docs/INSTALACAO_CPANEL.md). Até lá os emails ficam na fila com estado “pendente” e <strong>não são enviados</strong>.
            </Alert>
          )}
        </Panel>
        <Panel title="Acções">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" loading={busy === 'process'} onClick={process}><PlayCircle className="h-4 w-4" /> Processar fila agora ({pending})</Button>
              <Button
                size="sm"
                variant="subtle"
                loading={busy === 'remind'}
                onClick={() =>
                  confirm('Colocar na fila um lembrete para todos os pedidos com ingresso emitido? (Cada pessoa recebe no máximo um lembrete.)') &&
                  act('remind', async () => {
                    const r = await api<{ queued: number }>('/admin/emails/reminders', { method: 'POST' });
                    return `${r.queued} lembrete(s) colocados na fila.`;
                  })
                }
              >
                <BellRing className="h-4 w-4" /> Enfileirar lembretes do evento
              </Button>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void act('test', async () => {
                  await api('/admin/emails/test', { json: { to: testTo } });
                  return 'Email de teste colocado na fila. Clique em “Processar fila agora”.';
                });
              }}
            >
              <div className="flex-1"><Label htmlFor="tt">Enviar email de teste para</Label><input id="tt" type="email" required className="admin-input" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
              <Button type="submit" size="sm" variant="outline" className="self-end" loading={busy === 'test'}><Send className="h-4 w-4" /> Testar</Button>
            </form>
          </div>
        </Panel>
      </div>

      <Panel title="Fila de emails (últimos 100)">
        <Loadable loading={outbox.loading} error={outbox.error} empty={outbox.data?.length === 0 ? 'Sem emails.' : false}>
          <Table head={['#', 'Modelo', 'Destinatário', 'Estado', 'Tentativas', 'Criado', 'Enviado', '']}>
            {outbox.data?.map((o) => (
              <tr key={o.id}>
                <Td className="text-xs text-fg/50">{o.id}</Td>
                <Td>{TEMPLATE_LABEL[o.template] ?? o.template}</Td>
                <Td className="text-xs">{o.to_email}</Td>
                <Td>
                  <Badge tone={o.status === 'enviado' ? 'ok' : o.status === 'falhou' ? 'bad' : 'warn'}>{o.status}</Badge>
                  {o.last_error && <span className="mt-1 block max-w-[220px] truncate text-xs text-rose-800" title={o.last_error}>{o.last_error}</span>}
                </Td>
                <Td>{o.attempts}</Td>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(o.created_at)}</Td>
                <Td className="whitespace-nowrap text-xs">{o.sent_at ? formatDateTime(o.sent_at) : '—'}</Td>
                <Td>
                  {o.status === 'falhou' && (
                    <Button size="icon" variant="ghost" aria-label="Tentar de novo" onClick={() => act('retry', async () => {
                      await api(`/admin/emails/${o.id}/retry`, { method: 'POST' });
                      return 'Email recolocado na fila.';
                    })}><RotateCcw className="h-4 w-4" /></Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Loadable>
      </Panel>
    </div>
  );
}
