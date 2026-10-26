import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Calendar, Camera, Images, MapPin, Play } from 'lucide-react';
import { Alert, CmsHeading, EmptyState, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { fetchGalleryAlbum, fetchGalleryAlbums, mediaUrl } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useSite } from '@/hooks/useSite';
import { cn } from '@/lib/cn';
import type { GalleryAlbum, GalleryItem } from '@/lib/types';
import { Lightbox, type LightboxItem } from './Lightbox';

const PAGE = 24;
const ALBUMS_VISIBLE = 6;

function itemThumb(i: GalleryItem): string | null {
  if (i.kind === 'video_url') return null;
  return mediaUrl(i.thumb_path || i.path);
}

function toLightbox(i: GalleryItem, album: GalleryAlbum): LightboxItem {
  const alt = i.alt_text || i.caption || `${album.title} — Vibes — Grupo Vocal`;
  if (i.kind === 'video_url') return { src: i.embed_url ?? '', alt, caption: i.caption, kind: 'embed' };
  return { src: mediaUrl(i.path) ?? '', alt, caption: i.caption, kind: i.kind === 'video' ? 'video' : 'foto' };
}

function AlbumView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const reduce = useReducedMotion();
  const more = useSite().content.event_gallery.more_label;
  const [album, setAlbum] = useState<GalleryAlbum | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [index, setIndex] = useState<number | null>(null);

  const load = async (offset: number) => {
    setLoading(true);
    try {
      const r = await fetchGalleryAlbum(slug, offset, PAGE);
      setAlbum(r.album);
      setTotal(r.total);
      setItems((prev) => (offset === 0 ? r.items : [...prev, ...r.items]));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (error) return <Alert tone="bad" title="Não foi possível abrir o álbum">{errorMessage(error)}</Alert>;
  return (
    <div>
      <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-gold-deep hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todos os álbuns
      </button>
      {album && (
        <header className="mb-8 max-w-3xl">
          {album.category && <p className="eyebrow">{album.category}</p>}
          <h3 className="mt-2 font-display text-3xl font-semibold text-fg md:text-4xl">{album.title}</h3>
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-muted">
            {album.event_date && <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-gold" aria-hidden />{formatDate(album.event_date)}</span>}
            {album.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-gold" aria-hidden />{album.location}</span>}
          </p>
          {album.description && <p className="mt-4 whitespace-pre-line text-fg-muted">{album.description}</p>}
        </header>
      )}
      {!loading && items.length === 0 ? (
        <EmptyState icon={<Camera className="h-8 w-8" />} title="Álbum sem fotografias">As fotografias serão publicadas em breve.</EmptyState>
      ) : (
        <div className="columns-2 gap-3 md:columns-3 lg:columns-4 [&>*]:mb-3">
          {items.map((it, i) => {
            const thumb = itemThumb(it);
            return (
              <motion.button
                key={it.id}
                type="button"
                onClick={() => setIndex(i)}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="group relative block w-full break-inside-avoid overflow-hidden rounded-2xl bg-paper-muted shadow-soft ring-1 ring-fg/5"
                aria-label={`Abrir ${it.kind === 'foto' ? 'fotografia' : 'vídeo'}: ${it.alt_text || it.caption || album?.title || ''}`}
              >
                {thumb && it.kind === 'foto' ? (
                  <img src={thumb} alt={it.alt_text || it.caption || ''} loading="lazy" decoding="async"
                    width={it.width ?? undefined} height={it.height ?? undefined} className="w-full transition duration-700 group-hover:scale-[1.04]" />
                ) : it.kind === 'video' ? (
                  <video src={mediaUrl(it.path) ?? ''} preload="metadata" muted playsInline className="w-full" />
                ) : (
                  <span className="flex aspect-video w-full items-center justify-center bg-gold-soft text-sm font-semibold text-gold-deep">Vídeo</span>
                )}
                {it.kind !== 'foto' && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-paper/90 text-gold-deep shadow-card"><Play className="ml-1 h-6 w-6" aria-hidden /></span>
                  </span>
                )}
                {it.caption && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-left text-xs text-white opacity-0 transition group-hover:opacity-100">{it.caption}</span>}
              </motion.button>
            );
          })}
        </div>
      )}
      <div className="mt-10 flex justify-center">
        {loading ? <Spinner /> : items.length < total && (
          <Button variant="outline" onClick={() => load(items.length)}>
            <Images className="h-4 w-4" aria-hidden /> {more}
          </Button>
        )}
      </div>
      {album && <Lightbox items={items.map((i) => toLightbox(i, album))} index={index} onIndex={setIndex} />}
    </div>
  );
}

export function EventGallery() {
  const s = useSite().content.event_gallery;
  const reduce = useReducedMotion();
  const [year, setYear] = useState<number | null>(null);
  const [category, setCategory] = useState('');
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchGalleryAlbums({ year, category })
      .then((r) => {
        if (!alive) return;
        setAlbums(r.albums);
        setYears(r.years);
        setCategories(r.categories);
        setError(null);
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [year, category]);

  const openAlbum = (slug: string) => {
    setOpen(slug);
    document.getElementById('galeria')?.scrollIntoView({ behavior: 'smooth' });
  };
  const visible = showAll ? albums : albums.slice(0, ALBUMS_VISIBLE);
  const chip = (active: boolean) =>
    cn('rounded-full border px-4 py-2 text-xs font-semibold tracking-wide transition', active ? 'border-gold bg-gold-pale text-gold-deep' : 'border-fg/15 bg-paper text-fg-muted hover:border-gold/60 hover:text-fg');

  return (
    <section id="galeria" className="section" aria-labelledby="galeria-titulo">
      <div className="container">
        <CmsHeading id="galeria-titulo" s={s} />

        {open ? (
          <AlbumView slug={open} onBack={() => setOpen(null)} />
        ) : (
          <>
            {(years.length > 0 || categories.length > 0) && (
              <div className="mb-10 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Filtrar álbuns">
                <button type="button" className={chip(year === null && !category)} aria-pressed={year === null && !category} onClick={() => { setYear(null); setCategory(''); }}>
                  Todos
                </button>
                {years.map((y) => (
                  <button key={y} type="button" className={chip(year === y)} aria-pressed={year === y} onClick={() => setYear(year === y ? null : y)}>{y}</button>
                ))}
                {categories.length > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-fg/15" />}
                {categories.map((c) => (
                  <button key={c} type="button" className={chip(category === c)} aria-pressed={category === c} onClick={() => setCategory(category === c ? '' : c)}>{c}</button>
                ))}
              </div>
            )}

            {error ? (
              <Alert tone="bad" title="Não foi possível carregar a galeria" className="mx-auto max-w-xl">{errorMessage(error)}</Alert>
            ) : loading && albums.length === 0 ? (
              <div className="flex justify-center"><Spinner /></div>
            ) : albums.length === 0 ? (
              <EmptyState icon={<Camera className="h-8 w-8" />} title="A galeria está a ser preparada">
                Em breve publicaremos aqui os álbuns dos eventos do Vibes — Grupo Vocal.
              </EmptyState>
            ) : (
              <>
                <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((a, i) => {
                    const cover = a.cover ? itemThumb(a.cover) : null;
                    return (
                      <motion.li
                        key={a.id}
                        initial={reduce ? false : { opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: (i % 3) * 0.08 }}
                      >
                        <button type="button" onClick={() => openAlbum(a.slug)} className="group block w-full overflow-hidden rounded-[1.5rem] border border-fg/10 bg-paper text-left shadow-card transition hover:-translate-y-1 hover:border-gold/50">
                          <span className="relative block aspect-[4/3] overflow-hidden bg-gold-soft">
                            {cover ? (
                              <img src={cover} alt={a.cover?.alt_text || a.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                            ) : (
                              <span className="flex h-full items-center justify-center text-gold-deep"><Camera className="h-10 w-10" aria-hidden /></span>
                            )}
                            {a.year && <span className="absolute left-4 top-4 rounded-full bg-paper/95 px-3 py-1 text-xs font-bold text-gold-deep shadow-soft">{a.year}</span>}
                          </span>
                          <span className="block p-5">
                            {a.category && <span className="eyebrow block">{a.category}</span>}
                            <span className="mt-1 block font-display text-2xl font-semibold text-fg">{a.title}</span>
                            <span className="mt-2 block text-xs text-fg-muted">
                              {a.photos} fotografia{a.photos === 1 ? '' : 's'}
                              {a.videos > 0 && ` · ${a.videos} vídeo${a.videos === 1 ? '' : 's'}`}
                              {a.location && ` · ${a.location}`}
                            </span>
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
                {albums.length > ALBUMS_VISIBLE && !showAll && (
                  <div className="mt-10 flex justify-center">
                    <Button variant="outline" onClick={() => setShowAll(true)}>
                      <Images className="h-4 w-4" aria-hidden /> {s.more_label}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
