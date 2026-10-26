import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { api } from '@/lib/http';
import { errorMessage } from '@/lib/errors';
import { fromLuandaInput, toLuandaInput } from '@/lib/format';
import type { EventSettings, SocialNetwork } from '@/lib/types';
import { useSettings } from '@/hooks/useSettings';
import { Label, PageHeader, Panel } from '../ui';

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
      TEXT('bank_account_name', 'Nome da conta'),
      TEXT('bank_account_number', 'Número da conta'),
      TEXT('bank_iban', 'IBAN'),
      TEXT('express_number', 'Número Transferência Express'),
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
  const { settings, reload } = useSettings();
  const [form, setForm] = useState<EventSettings>(settings);
  const [startsAt, setStartsAt] = useState(toLuandaInput(settings.starts_at));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  useEffect(() => {
    setForm(settings);
    setStartsAt(toLuandaInput(settings.starts_at));
  }, [settings]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
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
