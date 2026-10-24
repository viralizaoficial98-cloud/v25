import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Camera, Play } from 'lucide-react';
import { Alert, EmptyState, SectionHeading, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { fetchMedia, mediaUrl } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { MediaItem } from '@/lib/types';
import { Lightbox, type LightboxItem } from './Lightbox';

const PAGE = 12;

/** Vídeo do YouTube "leve": só carrega o iframe (domínio sem cookies) quando o visitante clica. */
function YouTubeLite({ id, title }: { id: string; title: string }) {
  const [play, setPlay] = useState(false);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-ink-700 ring-1 ring-gold/15">
      {play ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button type="button" onClick={() => setPlay(true)} className="group absolute inset-0" aria-label={`Reproduzir vídeo: ${title}`}>
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-metal text-ink shadow-glow transition group-hover:scale-110">
              <Play className="ml-1 h-7 w-7" aria-hidden />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

export function Memories() {
  const reduce = useReducedMotion();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [hasMore, setHasMore] = useState(false);
  const [index, setIndex] = useState<number | null>(null);

  const load = async (from: number) => {
    setLoading(true);
    try {
      const page = await fetchMedia('memorias', from, from + PAGE - 1);
      setItems((prev) => (from === 0 ? page : [...prev, ...page]));
      setHasMore(page.length === PAGE);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(0);
  }, []);

  const visual = items.filter((m) => m.kind !== 'youtube');
  const lightboxItems: LightboxItem[] = visual.map((m) => ({
    src: mediaUrl(m.storage_path) ?? '',
    alt: m.title || 'Memória do Vibes – Grupo Vocal',
    caption: m.caption || m.title,
    kind: m.kind === 'video' ? 'video' : 'foto',
  }));
  const videos = items.filter((m) => m.kind === 'youtube');

  return (
    <section id="memorias" className="section" aria-labelledby="memorias-titulo">
      <div className="container">
        <SectionHeading
          eyebrow="Memórias e galeria"
          title={<span id="memorias-titulo">Momentos que <span className="text-gold-metal">ficam</span></span>}
          intro="Fotografias e vídeos de 25 anos de palco, ensaios e amizade."
        />

        {error ? (
          <Alert tone="bad" title="Não foi possível carregar a galeria" className="mx-auto max-w-xl">{errorMessage(error)}</Alert>
        ) : !loading && items.length === 0 ? (
          <EmptyState icon={<Camera className="h-8 w-8" />} title="A galeria está a ser preparada">
            Em breve partilharemos aqui fotografias e vídeos marcantes da história do grupo.
          </EmptyState>
        ) : (
          <>
            {videos.length > 0 && (
              <div className="mb-8 grid gap-5 md:grid-cols-2">
                {videos.map((v) => (
                  <figure key={v.id}>
                    <YouTubeLite id={v.youtube_id!} title={v.title || 'Vídeo do Vibes – Grupo Vocal'} />
                    {v.title && <figcaption className="mt-3 text-sm text-cream/60">{v.title}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
            <div className="columns-2 gap-4 md:columns-3 lg:columns-4 [&>*]:mb-4">
              {visual.map((m, i) => (
                <motion.button
                  key={m.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  className="group relative block w-full break-inside-avoid overflow-hidden rounded-2xl bg-ink-700 ring-1 ring-gold/10"
                  aria-label={`Abrir: ${m.title || 'memória'}`}
                >
                  {m.kind === 'video' ? (
                    <span className="relative block">
                      <video src={mediaUrl(m.storage_path) ?? ''} preload="metadata" muted playsInline className="w-full" />
                      <Play className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-gold-light" aria-hidden />
                    </span>
                  ) : (
                    <img
                      src={mediaUrl(m.storage_path) ?? ''}
                      alt={m.title || 'Memória do Vibes – Grupo Vocal'}
                      loading="lazy"
                      decoding="async"
                      width={m.width ?? undefined}
                      height={m.height ?? undefined}
                      className="w-full transition duration-700 group-hover:scale-[1.04]"
                    />
                  )}
                </motion.button>
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              {loading ? <Spinner /> : hasMore && <Button variant="outline" onClick={() => load(items.length)}>Carregar mais memórias</Button>}
            </div>
          </>
        )}
      </div>
      <Lightbox items={lightboxItems} index={index} onIndex={setIndex} />
    </section>
  );
}
