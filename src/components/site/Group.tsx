import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Expand, UserRound } from 'lucide-react';
import { SectionHeading } from '@/components/ui/misc';
import { OfficialPicture } from '@/components/ui/picture';
import { fetchMedia, fetchMembers, mediaUrl } from '@/lib/api';
import { OFFICIAL_PHOTOS, officialImage } from '@/lib/images';
import { useAsync } from '@/hooks/useAsync';
import { Lightbox, type LightboxItem } from './Lightbox';

export function Group() {
  const reduce = useReducedMotion();
  const media = useAsync(() => fetchMedia('grupo', 0, 23), []);
  const members = useAsync(fetchMembers, []);
  const [index, setIndex] = useState<number | null>(null);

  const items: (LightboxItem & { official?: (typeof OFFICIAL_PHOTOS)[number]['name']; w?: number | null; h?: number | null })[] = useMemo(() => {
    const official = OFFICIAL_PHOTOS.map((p) => {
      const img = officialImage(p.name);
      return { src: img.largest, srcSet: img.webpSrcSet, alt: p.alt, official: p.name };
    });
    const extra = (media.data ?? [])
      .filter((m) => m.kind === 'foto' && m.storage_path)
      .map((m) => ({ src: mediaUrl(m.storage_path)!, alt: m.title || 'Fotografia do Vibes – Grupo Vocal', caption: m.caption, w: m.width, h: m.height }));
    return [...official, ...extra];
  }, [media.data]);

  const current = (members.data ?? []).filter((m) => m.is_current);
  const former = (members.data ?? []).filter((m) => !m.is_current);

  return (
    <section id="grupo" className="section" aria-labelledby="grupo-titulo">
      <div className="container">
        <SectionHeading
          eyebrow="O grupo"
          title={<span id="grupo-titulo">Vozes que se tornaram <span className="text-gold-metal">família</span></span>}
          intro="Antigos e actuais integrantes reúnem-se para celebrar 25 anos de harmonia."
        />

        {/* Masonry responsivo com CSS columns (sem recortes) */}
        <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-5">
          {items.map((it, i) => (
            <motion.button
              key={it.src}
              type="button"
              onClick={() => setIndex(i)}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.7, delay: (i % 3) * 0.08 }}
              className="group relative block w-full break-inside-avoid overflow-hidden rounded-3xl ring-1 ring-gold/15"
              aria-label={`Ampliar: ${it.alt}`}
            >
              {it.official ? (
                <OfficialPicture name={it.official} alt={it.alt} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" imgClassName="transition duration-700 group-hover:scale-[1.03]" />
              ) : (
                <img src={it.src} alt={it.alt} loading="lazy" width={it.w ?? undefined} height={it.h ?? undefined} className="w-full transition duration-700 group-hover:scale-[1.03]" />
              )}
              <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent opacity-0 transition group-hover:opacity-100" />
              <Expand aria-hidden className="absolute bottom-4 right-4 h-5 w-5 text-gold-light opacity-0 transition group-hover:opacity-100" />
            </motion.button>
          ))}
        </div>

        {(current.length > 0 || former.length > 0) && (
          <div className="mt-20 space-y-14">
            {[
              { title: 'Integrantes actuais', list: current },
              { title: 'Antigos integrantes', list: former },
            ]
              .filter((g) => g.list.length)
              .map((g) => (
                <div key={g.title}>
                  <h3 className="mb-6 text-center font-display text-3xl text-cream">{g.title}</h3>
                  <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    {g.list.map((m) => (
                      <li key={m.id} className="glass rounded-2xl p-4 text-center">
                        {m.photo_path ? (
                          <img src={mediaUrl(m.photo_path) ?? ''} alt={m.name} loading="lazy" className="mx-auto aspect-square w-24 rounded-full object-cover object-top ring-2 ring-gold/40" />
                        ) : (
                          <span className="mx-auto flex aspect-square w-24 items-center justify-center rounded-full bg-ink-700 ring-2 ring-gold/20">
                            <UserRound className="h-10 w-10 text-gold/50" aria-hidden />
                          </span>
                        )}
                        <p className="mt-3 font-display text-lg text-cream">{m.name}</p>
                        {m.voice && <p className="text-xs uppercase tracking-[0.18em] text-gold">{m.voice}</p>}
                        {m.period_label && <p className="mt-1 text-xs text-cream/50">{m.period_label}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </div>
      <Lightbox items={items} index={index} onIndex={setIndex} />
    </section>
  );
}
