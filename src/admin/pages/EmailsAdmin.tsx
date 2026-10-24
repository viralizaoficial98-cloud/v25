import { useState, type FormEvent } from 'react';
import { BellRing, PlayCircle, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/misc';
import { requireSupabase } from '@/lib/supabase';
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
  pedido_cancelado: 'Pedido cancelado',
  teste_smtp: 'Teste SMTP',
};

export default function EmailsAdmin() {
  const sb = requireSupabase();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');

  const status = useAsync(async () => {
    const { data, error } = await sb.functions.invoke('send-emails', { body: { action: 'status' } });
    if (error) return null; // função ainda não publicada
    return data as SmtpStatus;
  }, []);
  const outbox = useAsync(async () => {
    const { data, error } = await sb.from('email_outbox').select('id, template, to_email, status, attempts, last_error, created_at, sent_at').order('id', { ascending: false }).limit(100);
    if (error) throw error;
    return data as Outbox[];
  }, []);

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
      const { data, error } = await sb.functions.invoke('send-emails', { body: { action: 'process' } });
      if (error) throw new Error('A função "send-emails" não respondeu. Verifique se foi publicada (docs/DEPLOY.md).');
      const r = data as { sent: number; failed: number; skipped?: string };
      if (r.skipped) return r.skipped;
      return `Processados: ${r.sent} enviados, ${r.failed} com falha.`;
    });

  const pending = (outbox.data ?? []).filter((o) => o.status === 'pendente').length;

  return (
    <div>
      <PageHeader title="Emails e SMTP" description="As mensagens ficam numa fila e são enviadas pela Edge Function “send-emails” através do servidor SMTP configurado." />
      {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Estado da integração SMTP" actions={<Button size="sm" variant="ghost" onClick={() => status.reload()}><RefreshCw className="h-4 w-4" /></Button>}>
          {status.loading ? (
            <p className="text-sm text-cream/50">A verificar…</p>
          ) : !status.data ? (
            <Alert tone="warn" title="Integração pendente">
              A Edge Function <code>send-emails</code> ainda não está publicada neste projecto Supabase. Os emails ficam em fila (estado “pendente”) e <strong>não são enviados</strong> até a função e as credenciais SMTP estarem configuradas.
            </Alert>
          ) : status.data.configured ? (
            <div className="space-y-1 text-sm">
              <Badge tone="ok">Configurado</Badge>
              <p className="text-cream/70">Servidor: {status.data.host}:{status.data.port}</p>
              <p className="text-cream/70">Remetente: {status.data.from}</p>
            </div>
          ) : (
            <Alert tone="warn" title="SMTP por configurar">
              Faltam os segredos: {status.data.missing.join(', ')}. Defina-os com <code>supabase secrets set</code> (ver docs/DEPLOY.md). As credenciais nunca ficam no site nem na base de dados.
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
                    const { data, error } = await sb.rpc('admin_queue_event_reminders');
                    if (error) throw error;
                    return `${data} lembrete(s) colocados na fila.`;
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
                  const { error } = await sb.rpc('admin_queue_test_email', { p_to: testTo });
                  if (error) throw error;
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
                <Td className="text-xs text-cream/50">{o.id}</Td>
                <Td>{TEMPLATE_LABEL[o.template] ?? o.template}</Td>
                <Td className="text-xs">{o.to_email}</Td>
                <Td>
                  <Badge tone={o.status === 'enviado' ? 'ok' : o.status === 'falhou' ? 'bad' : 'warn'}>{o.status}</Badge>
                  {o.last_error && <span className="mt-1 block max-w-[220px] truncate text-xs text-rose-200" title={o.last_error}>{o.last_error}</span>}
                </Td>
                <Td>{o.attempts}</Td>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(o.created_at)}</Td>
                <Td className="whitespace-nowrap text-xs">{o.sent_at ? formatDateTime(o.sent_at) : '—'}</Td>
                <Td>
                  {o.status === 'falhou' && (
                    <Button size="icon" variant="ghost" aria-label="Tentar de novo" onClick={() => act('retry', async () => {
                      const { error } = await sb.rpc('admin_retry_email', { p_id: o.id });
                      if (error) throw error;
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
