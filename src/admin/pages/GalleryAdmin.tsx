import { useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Film, ImagePlus, Link2, Pencil, Plus, RefreshCw, Star, Trash2, Upload } from 'lucide-react';
import { Alert, Badge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Dialog } from '@/components/ui/dialog';
import { api } from '@/lib/http';
import { mediaUrl } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useAsync } from '@/hooks/useAsync';
import type { GalleryAlbum, GalleryItem } from '@/lib/types';
import { ConfirmButton, Loadable, PageHeader, Panel, Toggle } from '../ui';
import { replaceGalleryFile, uploadGalleryFile } from '../upload';

interface AlbumForm {
  title: string;
  category: string;
  event_date: string;
  location: string;
  description: string;
  published: boolean;
  sort_order: number;
}
const EMPTY: AlbumForm = { title: '', category: '', event_date: '', location: '', description: '', published: false, sort_order: 0 };

function AlbumDialog({ album, open, onOpenChange, onSaved }: { album: GalleryAlbum | null; open: boolean; onOpenChange: (v: boolean) => void; onSaved: (a: GalleryAlbum) => void }) {
  const [f, setF] = useState<AlbumForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setError(null);
    setF(album ? { title: album.title, category: album.category, event_date: album.event_date ?? '', location: album.location, description: album.description, published: !!album.published, sort_order: album.sort_order ?? 0 } : EMPTY);
  } else if (!open && lastOpen) setLastOpen(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, event_date: f.event_date || null };
      // A API devolve { album, items }
      const r = album
        ? await api<{ album: GalleryAlbum }>(`/admin/gallery/albums/${album.id}`, { method: 'PUT', json: body })
        : await api<{ album: GalleryAlbum }>('/admin/gallery/albums', { json: body });
      onSaved(r.album);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const set = <K extends keyof AlbumForm>(k: K, v: AlbumForm[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={album ? 'Editar álbum' : 'Novo álbum'} className="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome do evento / álbum" required>{(id) => <Input id={id} value={f.title} maxLength={160} onChange={(e) => set('title', e.target.value)} required />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoria" hint="Ex.: Concertos, Ensaios, Aniversários">{(id, d) => <Input id={id} aria-describedby={d} value={f.category} maxLength={60} onChange={(e) => set('category', e.target.value)} />}</Field>
          <Field label="Data do evento">{(id) => <Input id={id} type="date" value={f.event_date} onChange={(e) => set('event_date', e.target.value)} />}</Field>
        </div>
        <Field label="Local">{(id) => <Input id={id} value={f.location} maxLength={160} onChange={(e) => set('location', e.target.value)} />}</Field>
        <Field label="Descrição">{(id) => <Textarea id={id} value={f.description} maxLength={5000} onChange={(e) => set('description', e.target.value)} />}</Field>
        <Field label="Ordem" hint="Menor aparece primeiro">{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={f.sort_order} onChange={(e) => set('sort_order', Number(e.target.value.replace(/[^\d-]/g, '')) || 0)} />}</Field>
        <Toggle checked={f.published} onChange={(v) => set('published', v)} label="Publicado no site" />
        {error && <Alert tone="bad">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" loading={busy}>Guardar</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ItemDialog({ item, onClose, onSaved }: { item: GalleryItem | null; onClose: () => void; onSaved: (i: GalleryItem) => void }) {
  const [caption, setCaption] = useState('');
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  if (item && item.id !== id) {
    setId(item.id);
    setCaption(item.caption);
    setAlt(item.alt_text);
    setError(null);
  }
  const save = async () => {
    if (!item) return;
    setBusy(true);
    try {
      onSaved(await api<GalleryItem>(`/admin/gallery/items/${item.id}`, { method: 'PUT', json: { caption, alt_text: alt } }));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()} title="Legenda e texto alternativo">
      <div className="space-y-4">
        <Field label="Legenda">{(fid) => <Textarea id={fid} value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} />}</Field>
        <Field label="Texto alternativo (acessibilidade)" hint="Descreva o que se vê na imagem.">{(fid, d) => <Input id={fid} aria-describedby={d} value={alt} maxLength={255} onChange={(e) => setAlt(e.target.value)} />}</Field>
        {error && <Alert tone="bad">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={save}>Guardar</Button>
        </div>
      </div>
    </Dialog>
  );
}

interface UploadState { name: string; status: 'a enviar' | 'ok' | 'erro'; error?: string }

function AlbumDetail({ albumId, onBack }: { albumId: string; onBack: () => void }) {
  const { data, loading, error, reload, setData } = useAsync(() => api<{ album: GalleryAlbum; items: GalleryItem[] }>(`/admin/gallery/albums/${albumId}`), [albumId]);
  const [editAlbum, setEditAlbum] = useState(false);
  const [editItem, setEditItem] = useState<GalleryItem | null>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoCaption, setVideoCaption] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<string | null>(null);

  const items = data?.items ?? [];
  const album = data?.album;
  const patchItems = (fn: (list: GalleryItem[]) => GalleryItem[]) => {
    if (data) setData({ ...data, items: fn(data.items) });
  };

  const uploadMany = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    setUploads(list.map((f) => ({ name: f.name, status: 'a enviar' })));
    // Envio sequencial: evita sobrecarregar o alojamento partilhado e mostra o progresso por ficheiro
    for (let i = 0; i < list.length; i++) {
      try {
        await uploadGalleryFile(albumId, list[i]);
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, status: 'ok' } : x)));
      } catch (e) {
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, status: 'erro', error: errorMessage(e) } : x)));
      }
    }
    await reload();
  };

  const addVideo = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api(`/admin/gallery/albums/${albumId}/videos`, { json: { url: videoUrl.trim(), caption: videoCaption } });
      setVideoUrl('');
      setVideoCaption('');
      await reload();
      setMsg({ tone: 'ok', text: 'Vídeo adicionado.' });
    } catch (err) {
      setMsg({ tone: 'bad', text: errorMessage(err) });
    }
  };

  const move = async (idx: number, d: -1 | 1) => {
    const ids = items.map((i) => i.id);
    const j = idx + d;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    try {
      await api(`/admin/gallery/albums/${albumId}/order`, { method: 'PUT', json: { ids } });
      await reload();
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    }
  };

  const setCover = async (itemId: string) => {
    if (!album) return;
    try {
      const r = await api<{ album: GalleryAlbum }>(`/admin/gallery/albums/${albumId}`, { method: 'PUT', json: { cover_item_id: itemId } });
      if (data) setData({ ...data, album: r.album });
      setMsg({ tone: 'ok', text: 'Capa do álbum actualizada.' });
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    }
  };

  const doReplace = async (file?: File | null) => {
    if (!file || !replacing) return;
    try {
      const it = await replaceGalleryFile(replacing, file);
      patchItems((l) => l.map((x) => (x.id === it.id ? it : x)));
      setMsg({ tone: 'ok', text: 'Ficheiro substituído.' });
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    } finally {
      setReplacing(null);
    }
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-gold-deep hover:underline"><ArrowLeft className="h-4 w-4" /> Todos os álbuns</button>
      <Loadable loading={loading && !data} error={error}>
        {album && (
          <div className="space-y-6">
            <PageHeader
              title={album.title}
              description={<>{album.category || 'Sem categoria'} · {album.event_date ? formatDate(album.event_date) : 'sem data'} · {album.photos} fotografias · {album.videos} vídeos {album.published ? <Badge tone="ok">publicado</Badge> : <Badge>rascunho</Badge>}</>}
              actions={<Button variant="outline" size="sm" onClick={() => setEditAlbum(true)}><Pencil className="h-4 w-4" /> Editar dados</Button>}
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Carregar fotografias e vídeos">
                <p className="text-sm text-fg-muted">JPG, PNG ou WebP até 15 MB (convertidas para WebP com miniatura); MP4/WebM até 50 MB. Pode seleccionar vários ficheiros.</p>
                <Button className="mt-4" onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> Seleccionar ficheiros</Button>
                <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="sr-only" aria-label="Ficheiros para o álbum"
                  onChange={(e) => { void uploadMany(e.target.files); e.target.value = ''; }} />
                {uploads.length > 0 && (
                  <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto text-xs" aria-live="polite">
                    {uploads.map((u, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="truncate">{u.name}</span>
                        <span className={u.status === 'erro' ? 'text-rose-800' : u.status === 'ok' ? 'text-emerald-800' : 'text-fg-muted'}>{u.status === 'erro' ? u.error : u.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Adicionar vídeo (YouTube ou Vimeo)">
                <form onSubmit={addVideo} className="space-y-3">
                  <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=… ou https://vimeo.com/…" aria-label="Ligação do vídeo" required />
                  <Input value={videoCaption} onChange={(e) => setVideoCaption(e.target.value)} placeholder="Legenda (opcional)" aria-label="Legenda do vídeo" maxLength={500} />
                  <Button type="submit" variant="outline" size="sm"><Link2 className="h-4 w-4" /> Adicionar vídeo</Button>
                </form>
              </Panel>
            </div>
            {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <Panel title={`Itens do álbum (${items.length})`}>
              {items.length === 0 ? (
                <p className="py-8 text-center text-sm text-fg-muted">Ainda sem fotografias ou vídeos.</p>
              ) : (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                  {items.map((it, i) => {
                    const thumb = it.kind === 'foto' ? mediaUrl(it.thumb_path || it.path) : null;
                    const isCover = (album.cover_item_id ?? album.cover?.id) === it.id;
                    return (
                      <li key={it.id} className="overflow-hidden rounded-xl border border-fg/10 bg-paper">
                        <div className="relative aspect-square bg-paper-muted">
                          {thumb ? <img src={thumb} alt={it.alt_text} loading="lazy" className="h-full w-full object-cover" /> : (
                            <span className="flex h-full flex-col items-center justify-center gap-1 text-xs text-fg-muted"><Film className="h-6 w-6 text-gold" />{it.kind === 'video_url' ? 'Vídeo incorporado' : 'Vídeo'}</span>
                          )}
                          {isCover && <Badge tone="warn" className="absolute left-2 top-2">Capa</Badge>}
                        </div>
                        <div className="space-y-2 p-2">
                          <p className="line-clamp-2 min-h-[2rem] text-xs text-fg-muted">{it.caption || <em>sem legenda</em>}</p>
                          <div className="flex flex-wrap gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mover para trás" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4 -rotate-90" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mover para a frente" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4 -rotate-90" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Editar legenda" onClick={() => setEditItem(it)}><Pencil className="h-4 w-4" /></Button>
                            {it.kind === 'foto' && !isCover && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Definir como capa" onClick={() => setCover(it.id)}><Star className="h-4 w-4" /></Button>}
                            {it.kind !== 'video_url' && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Substituir ficheiro" onClick={() => { setReplacing(it.id); replaceInput.current?.click(); }}><RefreshCw className="h-4 w-4" /></Button>}
                            <ConfirmButton variant="ghost" title="Eliminar este item?" description="O ficheiro é apagado do servidor. Esta acção não pode ser desfeita." confirmLabel="Eliminar" danger
                              onConfirm={async () => { await api(`/admin/gallery/items/${it.id}`, { method: 'DELETE' }); await reload(); }}>
                              <Trash2 className="h-4 w-4 text-rose-800" /><span className="sr-only">Eliminar</span>
                            </ConfirmButton>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <input ref={replaceInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="sr-only" aria-label="Ficheiro de substituição"
                onChange={(e) => { void doReplace(e.target.files?.[0]); e.target.value = ''; }} />
            </Panel>
            <div className="flex justify-end">
              <ConfirmButton title="Eliminar o álbum completo?" description={`Serão apagados ${items.length} itens e os respectivos ficheiros. Esta acção não pode ser desfeita.`} confirmLabel="Eliminar álbum" danger
                onConfirm={async () => { await api(`/admin/gallery/albums/${albumId}`, { method: 'DELETE' }); onBack(); }}>
                <Trash2 className="h-4 w-4" /> Eliminar álbum
              </ConfirmButton>
            </div>
            <AlbumDialog album={album} open={editAlbum} onOpenChange={setEditAlbum} onSaved={(a) => { if (data) setData({ ...data, album: a }); }} />
            <ItemDialog item={editItem} onClose={() => setEditItem(null)} onSaved={(it) => patchItems((l) => l.map((x) => (x.id === it.id ? it : x)))} />
          </div>
        )}
      </Loadable>
    </div>
  );
}

export default function GalleryAdmin() {
  const { data = [], loading, error, reload } = useAsync(() => api<GalleryAlbum[]>('/admin/gallery/albums'), []);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (open) return <AlbumDetail albumId={open} onBack={() => { setOpen(null); void reload(); }} />;
  return (
    <div>
      <PageHeader
        title="Galeria dos Eventos"
        description="Álbuns por evento, com fotografias, vídeos, capa, legendas e filtros por ano e categoria no site."
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo álbum</Button>}
      />
      <Loadable loading={loading} error={error} empty={data.length === 0 && 'Ainda não há álbuns. Crie o primeiro.'}>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((a) => {
            const cover = a.cover && a.cover.kind === 'foto' ? mediaUrl(a.cover.thumb_path || a.cover.path) : null;
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpen(a.id)} className="block w-full overflow-hidden rounded-2xl border border-fg/10 bg-paper text-left shadow-soft transition hover:border-gold/60">
                  <span className="block aspect-[16/9] bg-gold-soft">
                    {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-gold-deep"><ImagePlus className="h-8 w-8" /></span>}
                  </span>
                  <span className="block space-y-1 p-4">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{a.title}</span>
                      {a.published ? <Badge tone="ok">publicado</Badge> : <Badge>rascunho</Badge>}
                    </span>
                    <span className="block text-xs text-fg-muted">{a.category || 'Sem categoria'} · {a.year ?? 'sem data'} · {a.photos} fotos · {a.videos} vídeos</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Loadable>
      <AlbumDialog album={null} open={creating} onOpenChange={setCreating} onSaved={(a) => setOpen(a.id)} />
    </div>
  );
}
