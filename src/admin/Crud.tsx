import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { mediaUrl } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { api } from '@/lib/http';
import { useAsync } from '@/hooks/useAsync';
import { Label, Loadable, PageHeader, Panel, Toggle } from './ui';
import { uploadImage } from './upload';

export type FieldDef =
  | { key: string; label: string; type: 'text' | 'textarea'; required?: boolean; placeholder?: string; hint?: string }
  | { key: string; label: string; type: 'bool' }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'image'; folder: 'historia' | 'integrantes' };

type Row = Record<string, unknown> & { id: string; sort_order: number; published?: boolean };

interface Props {
  type: 'timeline' | 'members' | 'faqs';
  title: string;
  description: ReactNode;
  fields: FieldDef[];
  empty: string;
  defaults: Record<string, unknown>;
  render: (row: Row) => ReactNode;
}

/** CRUD genérico para conteúdos editáveis (linha do tempo, integrantes, FAQ). */
export function CrudPage({ type, title, description, fields, empty, defaults, render }: Props) {
  const base = `/admin/content/${type}`;
  const { data = [], loading, error, reload } = useAsync(() => api<Row[]>(base), [type]);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setErr(null);
    try {
      const row: Record<string, unknown> = {};
      for (const f of fields) row[f.key] = draft[f.key] ?? (f.type === 'bool' ? false : f.type === 'image' ? null : '');
      const img = fields.find((f) => f.type === 'image') as Extract<FieldDef, { type: 'image' }> | undefined;
      if (img && file) {
        // A imagem anterior é apagada pelo servidor quando o conteúdo é guardado
        row[img.key] = (await uploadImage(file, img.folder)).path;
      }
      if (draft.id) await api(`${base}/${draft.id as string}`, { method: 'PUT', json: row });
      else await api(base, { json: row });
      setDraft(null);
      setFile(null);
      await reload();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Row) => {
    if (!confirm('Eliminar este item?')) return;
    try {
      await api(`${base}/${r.id}`, { method: 'DELETE' });
    } catch (e) {
      setErr(errorMessage(e));
    }
    await reload();
  };

  const move = async (i: number, d: -1 | 1) => {
    const a = data[i];
    const b = data[i + d];
    if (!a || !b) return;
    try {
      await api(`${base}/${a.id}`, { method: 'PUT', json: { sort_order: b.sort_order } });
      await api(`${base}/${b.id}`, { method: 'PUT', json: { sort_order: a.sort_order === b.sort_order ? a.sort_order + d : a.sort_order } });
    } catch (e) {
      setErr(errorMessage(e));
    }
    await reload();
  };

  return (
    <div>
      <PageHeader title={title} description={description} actions={<Button size="sm" onClick={() => { setErr(null); setDraft({ ...defaults }); }}><Plus className="h-4 w-4" /> Adicionar</Button>} />
      {err && !draft && <Alert tone="bad" className="mb-4">{err}</Alert>}
      <Panel>
        <Loadable loading={loading} error={error} empty={data.length === 0 ? empty : false}>
          <ul className="divide-y divide-white/5">
            {data.map((r, i) => (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <div className="flex flex-col">
                  <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-cream/40 hover:text-cream disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" aria-label="Descer" disabled={i === data.length - 1} onClick={() => move(i, 1)} className="p-1 text-cream/40 hover:text-cream disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button>
                </div>
                <div className="min-w-0 flex-1">{render(r)}</div>
                {'published' in r && (r.published ? <Badge tone="ok">Publicado</Badge> : <Badge>Rascunho</Badge>)}
                <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => { setErr(null); setDraft({ ...r }); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Eliminar" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        </Loadable>
      </Panel>

      {draft && (
        <Dialog open onOpenChange={(v) => { if (!v) { setDraft(null); setFile(null); } }} title={draft.id ? 'Editar' : 'Adicionar'} className="max-w-2xl">
          <form onSubmit={save} className="space-y-3">
            {fields.map((f) => {
              const id = `f-${f.key}`;
              const v = draft[f.key];
              if (f.type === 'bool') return <Toggle key={f.key} checked={Boolean(v)} onChange={(x) => setDraft({ ...draft, [f.key]: x })} label={f.label} />;
              if (f.type === 'select')
                return (
                  <div key={f.key}>
                    <Label htmlFor={id}>{f.label}</Label>
                    <select id={id} className="admin-input" value={String(v ?? '')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                );
              if (f.type === 'image')
                return (
                  <div key={f.key}>
                    <Label htmlFor={id}>{f.label}</Label>
                    {typeof v === 'string' && v && !file && <img src={mediaUrl(v) ?? ''} alt="" className="mb-2 h-24 rounded-lg object-contain" />}
                    <input id={id} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    {typeof v === 'string' && v && (
                      <button type="button" className="ml-3 text-xs text-rose-200 underline" onClick={() => setDraft({ ...draft, [f.key]: null })}>Remover imagem</button>
                    )}
                  </div>
                );
              return (
                <div key={f.key}>
                  <Label htmlFor={id}>{f.label}{f.required && ' *'}</Label>
                  {f.type === 'textarea' ? (
                    <textarea id={id} className="admin-input min-h-[110px]" required={f.required} value={String(v ?? '')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                  ) : (
                    <input id={id} className="admin-input" required={f.required} placeholder={f.placeholder} value={String(v ?? '')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                  )}
                  {f.hint && <p className="mt-1 text-xs text-cream/45">{f.hint}</p>}
                </div>
              );
            })}
            {err && <Alert tone="bad">{err}</Alert>}
            <div className="flex gap-2 pt-2">
              <Button type="submit" loading={busy}>Guardar</Button>
              <Button variant="ghost" onClick={() => { setDraft(null); setFile(null); }}>Cancelar</Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
