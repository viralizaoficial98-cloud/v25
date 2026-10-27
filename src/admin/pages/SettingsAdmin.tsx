import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/http';
import { errorMessage } from '@/lib/errors';
import { fromLuandaInput, toLuandaInput } from '@/lib/format';
import type { EventSettings, SocialNetwork } from '@/lib/types';
import { useSettings } from '@/hooks/useSettings';
import { useAsync } from '@/hooks/useAsync';
import { ConfirmButton, Label, Loadable, PageHeader, Panel } from '../ui';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/misc';

const PAYMENT_FIELDS = ['bank_account_name', 'bank_name', 'bank_account_number', 'bank_iban', 'express_number'] as const;

const SOCIALS: SocialNetwork[] = ['instagram', 'facebook', 'youtube', 'tiktok', 'spotify', 'whatsapp'];

type Key = keyof EventSettings;
const TEXT = (k: Key, label: string, opts: { area?: boolean; hint?: string; rows?: number } = {}) => ({ k, label, ...opts });

const GROUPS: { title: string; fields: ReturnType<typeof TEXT>[] }[] = [
  {
    title: 'Identidade do evento',
    fields: [
      TEXT('event_name', 'Nome'),
      TEXT('subtitle', 'Subtítulo'),
      TEXT('slogan', 'Slogan'),
      TEXT('group_name', 'Grupo'),
      TEXT('about_text', 'Texto institucional (Sobre o evento)', { area: true, rows: 8, hint: 'Separe parágrafos com uma linha em branco.' }),
      TEXT('closing_message', 'Mensagem final (rodapé)'),
    ],
  },
  {
    title: 'Local',
    fields: [
      TEXT('venue', 'Local'),
      TEXT('address', 'Morada'),
      TEXT('maps_url', 'Ligação Google Maps', { hint: 'Use a ligação “Partilhar” do Google Maps quando o local exacto estiver confirmado.' }),
    ],
  },
  {
    title: 'Pagamento (transferência)',
    fields: [
      TEXT('bank_account_name', 'Titular da conta'),
      TEXT('bank_name', 'Banco', { hint: 'Nome do banco tal como consta no documento bancário oficial. Deixe vazio se não estiver confirmado.' }),
      TEXT('bank_account_number', 'Número da conta'),
      TEXT('bank_iban', 'IBAN'),
      TEXT('express_number', 'Número Transferência Express', { hint: 'Deixe vazio se o número não estiver confirmado: o método deixa de ser oferecido.' }),
      TEXT('payment_instructions', 'Instruções adicionais', { area: true, rows: 3 }),
    ],
  },
  {
    title: 'Contactos e rodapé',
    fields: [
      TEXT('contact_email', 'Email de contacto'),
      TEXT('contact_phone', 'Telefone de contacto'),
      TEXT('copyright_text', 'Copyright', { hint: 'Vazio = “© ano Vibes – Grupo Vocal. Todos os direitos reservados.”' }),
      TEXT('credits_text', 'Créditos'),
    ],
  },
  {
    title: 'Emails',
    fields: [TEXT('email_sender_name', 'Nome do remetente'), TEXT('email_reply_to', 'Responder para (reply-to)')],
  },
  {
    title: 'Textos legais',
    fields: [
      TEXT('privacy_text', 'Política de privacidade', { area: true, rows: 8, hint: 'Vazio = texto base da plataforma.' }),
      TEXT('terms_text', 'Termos e condições', { area: true, rows: 8, hint: 'Vazio = texto base da plataforma.' }),
    ],
  },
];

export default function SettingsAdmin() {
  const { reload: reloadPublic } = useSettings();
  // Configuração completa (inclui dados bancários, que já não são públicos)
  const full = useAsync(() => api<EventSettings>('/admin/settings'), []);
  const settings = full.data;
  const [form, setForm] = useState<EventSettings | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    if (!settings) return;
    setForm(settings);
    setStartsAt(toLuandaInput(settings.starts_at));
  }, [settings]);
  const reload = async () => {
    await Promise.all([full.reload(), reloadPublic()]);
  };

  if (!form || !settings) {
    return (
      <div>
        <PageHeader title="Evento e conteúdos" />
        <Loadable loading={full.loading} error={full.error}>{null}</Loadable>
      </div>
    );
  }

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setMsg(null);
    try {
      const socials = Object.fromEntries(Object.entries(form.socials ?? {}).filter(([, v]) => v && /^https?:\/\//.test(v)));
      await api('/admin/settings', {
        method: 'PUT',
        json: {
          ...Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((f) => [f.k, (form[f.k] as string) ?? '']))),
          starts_at: fromLuandaInput(startsAt) ?? settings.starts_at,
          sales_closed_message: form.sales_closed_message,
          capacity: form.capacity || null,
          reservation_hours: form.reservation_hours,
          socials,
        },
      });
      await reload();
      setMsg({ tone: 'ok', text: 'Configurações guardadas.' });
    } catch (err) {
      setMsg({ tone: 'bad', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <PageHeader title="Evento e conteúdos" description="Todas as alterações ficam registadas na auditoria." actions={<Button type="submit" loading={busy}><Save className="h-4 w-4" /> Guardar</Button>} />
      {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}
      <Panel title="Validação dos dados de pagamento" className="mb-4">
        {(() => {
          const unsaved = PAYMENT_FIELDS.some((k) => ((form[k] as string) ?? '').trim() !== ((settings[k] as string) ?? '').trim());
          return (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl space-y-1 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  Estado:{' '}
                  {settings.payment_ready ? <Badge tone="ok">Confirmados</Badge> : <Badge tone="warn">Por validar — vendas bloqueadas</Badge>}
                </p>
                {settings.payment_ready ? (
                  <p className="text-fg-muted">Confirmados por {settings.payment_confirmed_by} em {formatDateTime(settings.payment_confirmed_at)}. Qualquer alteração ao titular, banco, conta, IBAN ou número Express anula esta confirmação.</p>
                ) : (
                  <p className="text-fg-muted">Os compradores só vêem as coordenadas bancárias, e só é possível comprar, depois de um administrador confirmar que os dados abaixo são os oficiais (verificados no documento do banco).</p>
                )}
                {unsaved && <p className="font-semibold text-amber-800">Há alterações aos dados de pagamento por guardar. Guarde antes de confirmar.</p>}
              </div>
              {settings.payment_ready ? (
                <ConfirmButton danger title="Retirar a confirmação?" description="As vendas ficam bloqueadas e os compradores deixam de ver as coordenadas bancárias até nova confirmação." confirmLabel="Retirar confirmação"
                  onConfirm={async () => { await api('/admin/settings/payment-confirmation', { json: { confirm: false } }); await reload(); }}>
                  Retirar confirmação
                </ConfirmButton>
              ) : (
                <ConfirmButton variant="gold" size="md" disabled={unsaved} title="Confirmar os dados de pagamento?"
                  description={<>Confirma que estes são os dados oficiais da conta para receber os pagamentos: <strong>{settings.bank_account_name || '—'}</strong>{settings.bank_name && ` · ${settings.bank_name}`} · IBAN {settings.bank_iban || '—'} · Conta {settings.bank_account_number || '—'} · Express {settings.express_number || '—'}. A confirmação fica registada na auditoria.</>}
                  confirmLabel="Sim, são os dados oficiais"
                  onConfirm={async () => { await api('/admin/settings/payment-confirmation', { json: { confirm: true } }); await reload(); setMsg({ tone: 'ok', text: 'Dados de pagamento confirmados.' }); }}>
                  Confirmar dados de pagamento
                </ConfirmButton>
              )}
            </div>
          );
        })()}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Data e vendas">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="sa">Data e hora (hora de Luanda)</Label><input id="sa" type="datetime-local" className="admin-input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></div>
            <div><Label htmlFor="cap">Capacidade total (pessoas)</Label><input id="cap" type="number" min={1} className="admin-input" value={form.capacity ?? ''} onChange={(e) => setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : null })} placeholder="Sem limite global" /></div>
            <div><Label htmlFor="rh">Prazo da reserva (horas)</Label><input id="rh" type="number" min={1} max={720} className="admin-input" value={form.reservation_hours} onChange={(e) => setForm({ ...form, reservation_hours: Number(e.target.value) || 48 })} /></div>
            <div><Label htmlFor="scm">Mensagem com vendas fechadas</Label><input id="scm" className="admin-input" value={form.sales_closed_message} onChange={(e) => setForm({ ...form, sales_closed_message: e.target.value })} /></div>
          </div>
          <p className="mt-3 text-xs text-fg/45">Abrir/fechar vendas: página “Ingressos, lotes e stock”. Estado actual: <strong>{settings.sales_open ? 'abertas' : 'fechadas'}</strong>.</p>
        </Panel>
        {GROUPS.map((g) => (
          <Panel key={g.title} title={g.title}>
            <div className="space-y-3">
              {g.fields.map((f) => (
                <div key={f.k}>
                  <Label htmlFor={f.k}>{f.label}</Label>
                  {f.area ? (
                    <textarea id={f.k} rows={f.rows ?? 4} className="admin-input" value={(form[f.k] as string) ?? ''} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                  ) : (
                    <input id={f.k} className="admin-input" value={(form[f.k] as string) ?? ''} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                  )}
                  {f.hint && <p className="mt-1 text-xs text-fg/45">{f.hint}</p>}
                </div>
              ))}
            </div>
          </Panel>
        ))}
        <Panel title="Redes sociais (apenas as preenchidas aparecem no site)">
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIALS.map((s) => (
              <div key={s}>
                <Label htmlFor={`s-${s}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</Label>
                <input id={`s-${s}`} type="url" className="admin-input" placeholder="https://…" value={form.socials?.[s] ?? ''} onChange={(e) => setForm({ ...form, socials: { ...form.socials, [s]: e.target.value } })} />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </form>
  );
}
