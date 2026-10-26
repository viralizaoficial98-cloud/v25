import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, History, ImagePlus, Plus, Save, Send, Trash2, Undo2, X } from 'lucide-react';
import { Alert, Badge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/http';
import { mediaUrl } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/cn';
import { ConfirmButton, Label, Loadable, PageHeader, Panel, Toggle } from '../ui';
import { uploadImage } from '../upload';

type FieldDef = [string, number?, Record<string, FieldDef>?];
type Data = Record<string, unknown>;
interface AdminSection {
  key: string;
  label: string;
  sort_order: number;
  enabled: boolean;
  has_draft: boolean;
  draft: Data;
  published: Data;
  published_at: string | null;
  updated_at: string | null;
  schema: Record<string, FieldDef>;
}
interface Revision {
  id: number;
  action: 'rascunho' | 'publicado' | 'restaurado' | 'visibilidade';
  data: Data;
  user_email: string | null;
  created_at: string;
}

/** Nomes legíveis dos campos do CMS. */
const LABELS: Record<string, string> = {
  eyebrow: 'Antetítulo', title: 'Título', title_highlight: 'Destaque do título (dourado)', subtitle: 'Subtítulo', description: 'Descrição',
  slogan: 'Slogan', cta_primary: 'Botão principal', cta_secondary: 'Botão secundário', image: 'Imagem', image_alt: 'Texto alternativo da imagem',
  show_countdown: 'Mostrar contagem regressiva', body: 'Texto (separe parágrafos com uma linha em branco)', pillars: 'Pilares', items: 'Banners',
  intro: 'Introdução', buy_label: 'Texto do botão de compra', vip_label: 'Texto do botão VIP', note: 'Nota sobre o pagamento',
  maps_label: 'Texto do botão do mapa', empty_text: 'Texto quando ainda não há conteúdo', more_label: 'Texto do botão “ver mais”',
  closing_message: 'Mensagem de encerramento', tagline: 'Frase do rodapé', show_partner_logo: 'Mostrar logótipo da organização (Renew)',
  partner_label: 'Legenda do logótipo', meta_title: 'Título da página (SEO, máx. 70)', meta_description: 'Descrição (SEO, máx. 300)',
  og_image: 'Imagem de partilha (redes sociais)', text: 'Texto', cta_label: 'Texto do botão', cta_href: 'Ligação do botão',
};
const label = (k: string) => LABELS[k] ?? k;
const HREF_HINT = 'Âncora (#ingressos), caminho (/consultar) ou https://…';

function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const r = await uploadImage(f, 'site');
      onChange(r.path);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const url = value ? mediaUrl(value) : null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-xl bg-paper-muted ring-1 ring-fg/10">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="px-2 text-center text-[11px] text-fg-muted">Fotografia oficial (por omissão)</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" loading={busy} onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" /> {value ? 'Substituir' : 'Carregar imagem'}</Button>
        {value && <Button variant="ghost" size="sm" onClick={() => onChange('')}><X className="h-4 w-4" /> Remover</Button>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Escolher imagem"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p role="alert" className="w-full text-xs text-rose-800">{error}</p>}
    </div>
  );
}

function FieldEditor({ name, def, value, onChange }: { name: string; def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const [type, max, sub] = def;
  const id = `f-${name}`;
  const str = typeof value === 'string' ? value : '';
  const counter = max ? <span className={cn('ml-2 font-normal', str.length > max ? 'text-rose-800' : 'text-fg/40')}>{str.length}/{max}</span> : null;
  switch (type) {
    case 'text':
      return <div><Label htmlFor={id}>{label(name)}{counter}</Label><Input id={id} value={str} maxLength={max} onChange={(e) => onChange(e.target.value)} /></div>;
    case 'textarea':
      return <div><Label htmlFor={id}>{label(name)}{counter}</Label><Textarea id={id} value={str} maxLength={max} rows={name === 'body' ? 10 : 3} onChange={(e) => onChange(e.target.value)} /></div>;
    case 'href':
      return <div><Label htmlFor={id}>{label(name)}</Label><Input id={id} value={str} placeholder={HREF_HINT} onChange={(e) => onChange(e.target.value)} /></div>;
    case 'bool':
      return <Toggle checked={Boolean(value)} onChange={onChange} label={label(name)} />;
    case 'image':
      return <div><Label>{label(name)}</Label><ImageField value={str} onChange={onChange} /></div>;
    case 'link': {
      const l = (value && typeof value === 'object' ? value : { label: '', href: '' }) as { label: string; href: string };
      return (
        <fieldset className="rounded-xl border border-fg/10 p-3">
          <legend className="px-1 text-xs font-semibold text-fg/60">{label(name)}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor={`${id}-l`}>Texto</Label><Input id={`${id}-l`} value={l.label} maxLength={60} onChange={(e) => onChange({ ...l, label: e.target.value })} /></div>
            <div><Label htmlFor={`${id}-h`}>Ligação</Label><Input id={`${id}-h`} value={l.href} placeholder={HREF_HINT} onChange={(e) => onChange({ ...l, href: e.target.value })} /></div>
          </div>
        </fieldset>
      );
    }
    case 'list': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>
          <Label>{label(name)} <span className="font-normal text-fg/40">(máx. {max})</span></Label>
          <div className="space-y-2">
            {list.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input value={v} maxLength={120} aria-label={`${label(name)} ${i + 1}`} onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} />
                <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => onChange(list.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            {list.length < (max ?? 8) && <Button variant="outline" size="sm" onClick={() => onChange([...list, ''])}><Plus className="h-4 w-4" /> Adicionar</Button>}
          </div>
        </div>
      );
    }
    case 'items': {
      const rows = Array.isArray(value) ? (value as Data[]) : [];
      const empty = Object.fromEntries(Object.keys(sub ?? {}).map((k) => [k, '']));
      return (
        <div className="space-y-3">
          <Label>{label(name)} <span className="font-normal text-fg/40">(máx. {max})</span></Label>
          {rows.map((row, i) => (
            <fieldset key={i} className="space-y-3 rounded-xl border border-fg/10 p-4">
              <legend className="flex items-center gap-2 px-1 text-xs font-semibold text-fg/60">
                {i + 1}.
                <button type="button" className="text-rose-800 hover:underline" onClick={() => onChange(rows.filter((_, j) => j !== i))}>remover</button>
              </legend>
              {Object.entries(sub ?? {}).map(([k, d]) => (
                <FieldEditor key={k} name={`${name}.${i}.${k}`.split('.').pop()!} def={d} value={row[k]} onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))} />
              ))}
            </fieldset>
          ))}
          {rows.length < (max ?? 5) && <Button variant="outline" size="sm" onClick={() => onChange([...rows, empty])}><Plus className="h-4 w-4" /> Adicionar banner</Button>}
        </div>
      );
    }
    default:
      return null;
  }
}

function Revisions({ section, onRestored }: { section: AdminSection; onRestored: (s: AdminSection) => void }) {
  const { data = [], loading, error } = useAsync(() => api<Revision[]>(`/admin/site/${section.key}/revisions`), [section.key, section.updated_at]);
  const ACTION: Record<Revision['action'], string> = { rascunho: 'Rascunho guardado', publicado: 'Publicado', restaurado: 'Revisão restaurada', visibilidade: 'Visibilidade' };
  return (
    <Loadable loading={loading} error={error} empty={data.length === 0 && 'Sem histórico.'}>
      <ul className="max-h-[60vh] divide-y divide-fg/10 overflow-y-auto text-sm">
        {data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold">{ACTION[r.action]}{r.action === 'visibilidade' && ` · ${(r.data as { enabled?: boolean }).enabled ? 'visível' : 'oculta'}`}</p>
              <p className="text-xs text-fg-muted">{formatDateTime(r.created_at)} · {r.user_email ?? '—'}</p>
            </div>
            {r.action !== 'visibilidade' && (
              <ConfirmButton
                title="Restaurar esta versão?"
                description="O conteúdo desta versão passa a ser o rascunho actual. O site público só muda quando publicar."
                confirmLabel="Restaurar como rascunho"
                onConfirm={async () => onRestored(await api<AdminSection>(`/admin/site/${section.key}/restore`, { json: { revision_id: r.id } }))}
              >
                <Undo2 className="h-4 w-4" /> Restaurar
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>
    </Loadable>
  );
}

export default function SiteAdmin() {
  const { data, loading, error, reload, setData } = useAsync(() => api<AdminSection[]>('/admin/site'), []);
  const [selected, setSelected] = useState<string>('hero');
  const [draft, setDraft] = useState<Data>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [history, setHistory] = useState(false);
  const sections = useMemo(() => data ?? [], [data]);
  const current = sections.find((s) => s.key === selected);

  useEffect(() => {
    if (current) {
      setDraft(current.draft);
      setDirty(false);
    }
    // Só ao mudar de secção ou depois de guardar (updated_at)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key, current?.updated_at, current?.has_draft]);

  const replace = (s: AdminSection) => setData(sections.map((x) => (x.key === s.key ? s : x)));
  const run = async (name: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'ok', text: ok });
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const persist = async (publish: boolean) => {
    replace(await api<AdminSection>(`/admin/site/${selected}`, { method: 'PUT', json: { data: draft, publish } }));
    setDirty(false);
  };
  const save = () => run('save', () => persist(false), 'Rascunho guardado. Use “Pré-visualizar rascunhos” para ver antes de publicar.');

  const move = (key: string, d: -1 | 1) => {
    const keys = sections.map((s) => s.key);
    const i = keys.indexOf(key);
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    void run('order', async () => setData(await api<AdminSection[]>('/admin/site/order', { method: 'PUT', json: { keys } })), 'Ordem das secções actualizada.');
  };

  const choose = (key: string) => {
    if (dirty && !window.confirm('Há alterações por guardar nesta secção. Descartar?')) return;
    setSelected(key);
    setMsg(null);
  };

  return (
    <div>
      <PageHeader
        title="Gestão do Website"
        description="Textos, imagens, botões, banners, ordem e visibilidade das secções. As alterações ficam em rascunho até serem publicadas."
        actions={
          <a href="/?preview=1" target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-2 rounded-full border border-fg/20 bg-paper px-4 text-xs font-semibold hover:border-gold">
            <Eye className="h-4 w-4" /> Pré-visualizar rascunhos
          </a>
        }
      />
      <Loadable loading={loading} error={error}>
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Panel title="Secções (ordem do site)">
            <ul className="space-y-1.5">
              {sections.map((s, i) => (
                <li key={s.key} className={cn('flex items-center gap-1 rounded-xl px-2 py-1.5', s.key === selected ? 'bg-gold-pale/60 ring-1 ring-gold/40' : 'hover:bg-fg/5')}>
                  <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => choose(s.key)}>
                    <span className={cn('block truncate font-semibold', !s.enabled && 'text-fg/40 line-through')}>{s.label}</span>
                    <span className="flex gap-1">
                      {s.has_draft && <Badge tone="warn">rascunho</Badge>}
                      {!s.enabled && <Badge>oculta</Badge>}
                    </span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Subir ${s.label}`} disabled={i === 0 || busy === 'order'} onClick={() => move(s.key, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Descer ${s.label}`} disabled={i === sections.length - 1 || busy === 'order'} onClick={() => move(s.key, 1)}><ArrowDown className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          </Panel>

          {current && (
            <Panel
              title={current.label}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setHistory(true)}><History className="h-4 w-4" /> Histórico</Button>
                  {!['seo', 'footer'].includes(current.key) && (
                    <ConfirmButton
                      title={current.enabled ? `Ocultar “${current.label}”?` : `Mostrar “${current.label}”?`}
                      description={current.enabled ? 'A secção deixa de aparecer no site público de imediato.' : 'A secção volta a aparecer no site público de imediato.'}
                      confirmLabel={current.enabled ? 'Ocultar secção' : 'Mostrar secção'}
                      danger={current.enabled}
                      onConfirm={async () => replace(await api<AdminSection>(`/admin/site/${current.key}/visibility`, { method: 'PUT', json: { enabled: !current.enabled } }))}
                    >
                      {current.enabled ? <><EyeOff className="h-4 w-4" /> Ocultar</> : <><Eye className="h-4 w-4" /> Mostrar</>}
                    </ConfirmButton>
                  )}
                </div>
              }
            >
              <p className="mb-5 text-xs text-fg-muted">
                Publicado: {current.published_at ? formatDateTime(current.published_at) : 'nunca'}
                {current.has_draft && ' · existe um rascunho por publicar'}
                {dirty && ' · alterações por guardar'}
              </p>
              <div className="space-y-5">
                {Object.entries(current.schema).map(([k, def]) => (
                  <FieldEditor key={k} name={k} def={def} value={draft[k]} onChange={(v) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); }} />
                ))}
              </div>
              {msg && <Alert tone={msg.tone} className="mt-5">{msg.text}</Alert>}
              <div className="mt-6 flex flex-wrap gap-2 border-t border-fg/10 pt-5">
                <Button variant="outline" loading={busy === 'save'} disabled={!dirty} onClick={save}><Save className="h-4 w-4" /> Guardar rascunho</Button>
                <ConfirmButton
                  variant="gold"
                  size="md"
                  title="Publicar no site?"
                  description="Os visitantes passam a ver esta versão imediatamente. Recomenda-se pré-visualizar antes."
                  confirmLabel="Publicar agora"
                  disabled={!dirty && !current.has_draft}
                  onConfirm={async () => {
                    if (dirty) await persist(true);
                    else replace(await api<AdminSection>(`/admin/site/${current.key}/publish`, { method: 'POST' }));
                    setMsg({ tone: 'ok', text: 'Publicado. O site público já mostra esta versão.' });
                  }}
                >
                  <Send className="h-4 w-4" /> Publicar
                </ConfirmButton>
                {current.has_draft && (
                  <ConfirmButton
                    variant="ghost"
                    title="Descartar o rascunho?"
                    description="O rascunho volta a ser igual à versão publicada. Pode recuperá-lo depois no histórico."
                    confirmLabel="Descartar"
                    danger
                    onConfirm={async () => replace(await api<AdminSection>(`/admin/site/${current.key}/discard`, { method: 'POST' }))}
                  >
                    <Trash2 className="h-4 w-4" /> Descartar rascunho
                  </ConfirmButton>
                )}
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => reload()}>Recarregar</Button>
              </div>
            </Panel>
          )}
        </div>
      </Loadable>
      {current && (
        <Dialog open={history} onOpenChange={setHistory} title={`Histórico · ${current.label}`} description="Últimas 50 alterações. Restaurar cria um rascunho; nada é publicado automaticamente." className="max-w-2xl">
          <Revisions section={current} onRestored={(s) => { replace(s); setHistory(false); setMsg({ tone: 'ok', text: 'Versão restaurada como rascunho.' }); }} />
        </Dialog>
      )}
    </div>
  );
}
