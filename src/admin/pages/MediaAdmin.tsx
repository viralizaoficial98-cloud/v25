import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Trash2, Upload, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/misc';
import { mediaUrl } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { api } from '@/lib/http';
import type { MediaItem } from '@/lib/types';
import { useAsync } from '@/hooks/useAsync';
import { Label, Loadable, PageHeader, Panel } from '../ui';
import { uploadMediaItem, youtubeId } from '../upload';

export default function MediaAdmin() {
  const [section, setSection] = useState<MediaItem['section']>('memorias');
  const { data = [], loading, error, reload } = useAsync(() => api<MediaItem[]>(`/admin/media?section=${section}`), [section]);
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [yt, setYt] = useState('');
  const [ytTitle, setYtTitle] = useState('');

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setMsg(null);
    let ok = 0;
    const list = [...files];
    for (let i = 0; i < list.length; i++) {
      setProgress(`A enviar ${i + 1} de ${list.length}…`);
      try {
        await uploadMediaItem(list[i], section, list[i].name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
        ok++;
      } catch (e) {
        setMsg({ tone: 'bad', text: `${list[i].name}: ${errorMessage(e)}` });
      }
    }
    setProgress(null);
    if (ok) setMsg({ tone: 'ok', text: `${ok} ficheiro(s) enviado(s) como rascunho. Reveja os títulos e publique.` });
    await reload();
  };

  const addYoutube = async (e: FormEvent) => {
    e.preventDefault();
    const id = youtubeId(yt);
    if (!id) return setMsg({ tone: 'bad', text: 'Ligação do YouTube inválida.' });
    try {
      await api('/admin/media/youtube', { json: { url: id, section, title: ytTitle.trim() } });
    } catch (err) {
      return setMsg({ tone: 'bad', text: errorMessage(err) });
    }
    setYt('');
    setYtTitle('');
    await reload();
  };

  const update = async (m: MediaItem, patch: Partial<MediaItem>) => {
    try {
      await api(`/admin/media/${m.id}`, { method: 'PUT', json: patch });
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    }
    await reload();
  };

  const remove = async (m: MediaItem) => {
    if (!confirm('Eliminar este item da galeria?')) return;
    try {
      await api(`/admin/media/${m.id}`, { method: 'DELETE' });
    } catch (e) {
      setMsg({ tone: 'bad', text: errorMessage(e) });
    }
    await reload();
  };

  return (
    <div>
      <PageHeader title="Fotografias e vídeos" description="As fotografias são apenas redimensionadas e re-codificadas pelo servidor — sem recortes nem alterações." />
      <div className="mb-4 flex gap-2">
        {(['memorias', 'grupo'] as const).map((s) => (
          <Button key={s} size="sm" variant={section === s ? 'gold' : 'subtle'} onClick={() => setSection(s)}>
            {s === 'memorias' ? 'Memórias e galeria' : 'O Grupo'}
          </Button>
        ))}
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Carregar ficheiros">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gold/25 px-4 py-8 text-center text-sm text-cream/60 hover:border-gold/60">
            <Upload className="mb-2 h-6 w-6 text-gold" />
            Fotografias (JPG, PNG, WebP) ou vídeos curtos (MP4/WebM, máx. 50 MB — confirme o limite de upload do PHP no cPanel)
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
          </label>
          {progress && <p className="mt-2 text-xs text-gold-light">{progress}</p>}
        </Panel>
        <Panel title="Adicionar vídeo do YouTube">
          <form onSubmit={addYoutube} className="space-y-2">
            <div><Label htmlFor="yt">Ligação ou ID</Label><input id="yt" className="admin-input" value={yt} onChange={(e) => setYt(e.target.value)} placeholder="https://youtu.be/…" required /></div>
            <div><Label htmlFor="ytt">Título</Label><input id="ytt" className="admin-input" value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} /></div>
            <Button type="submit" size="sm" variant="outline"><Youtube className="h-4 w-4" /> Adicionar</Button>
          </form>
        </Panel>
      </div>
      {msg && <Alert tone={msg.tone} className="mb-4">{msg.text}</Alert>}
      <Panel>
        <Loadable loading={loading} error={error} empty={data.length === 0 ? 'Sem itens nesta secção.' : false}>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((m) => (
              <li key={m.id} className="overflow-hidden rounded-xl border border-white/10 bg-ink-700">
                <div className="flex aspect-video items-center justify-center bg-black">
                  {m.kind === 'youtube' ? (
                    <img src={`https://i.ytimg.com/vi/${m.youtube_id}/mqdefault.jpg`} alt="" className="h-full w-full object-contain" />
                  ) : m.kind === 'video' ? (
                    <video src={mediaUrl(m.storage_path) ?? ''} className="h-full w-full object-contain" preload="metadata" muted />
                  ) : (
                    <img src={mediaUrl(m.storage_path) ?? ''} alt="" loading="lazy" className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <Badge>{m.kind}</Badge>
                    {m.published ? <Badge tone="ok">Publicado</Badge> : <Badge tone="warn">Rascunho</Badge>}
                  </div>
                  <input className="admin-input" aria-label="Título" defaultValue={m.title} onBlur={(e) => e.target.value !== m.title && update(m, { title: e.target.value })} />
                  <input className="admin-input" aria-label="Legenda" placeholder="Legenda" defaultValue={m.caption} onBlur={(e) => e.target.value !== m.caption && update(m, { caption: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <input className="admin-input w-20" type="number" aria-label="Ordem" defaultValue={m.sort_order} onBlur={(e) => Number(e.target.value) !== m.sort_order && update(m, { sort_order: Number(e.target.value) })} />
                    <Button size="sm" variant="subtle" onClick={() => update(m, { published: !m.published })}>
                      {m.published ? <><EyeOff className="h-4 w-4" /> Ocultar</> : <><Eye className="h-4 w-4" /> Publicar</>}
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Eliminar" onClick={() => remove(m)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Loadable>
      </Panel>
    </div>
  );
}
