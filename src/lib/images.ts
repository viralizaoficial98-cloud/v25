import manifest from './images.generated.json';

export type OfficialImage = keyof typeof manifest;

export interface ImageInfo {
  width: number;
  height: number;
  widths: number[];
  blur: string;
}

const base = import.meta.env.BASE_URL;

export function officialImage(name: OfficialImage) {
  const m = manifest[name] as ImageInfo;
  const src = (w: number, ext: 'avif' | 'webp') => `${base}images/${name}-${w}.${ext}`;
  return {
    ...m,
    avifSrcSet: m.widths.map((w) => `${src(w, 'avif')} ${w}w`).join(', '),
    webpSrcSet: m.widths.map((w) => `${src(w, 'webp')} ${w}w`).join(', '),
    fallback: src(m.widths[m.widths.length - 1], 'webp'),
    largest: src(m.widths[m.widths.length - 1], 'webp'),
  };
}

export const OFFICIAL_PHOTOS: { name: OfficialImage; alt: string }[] = [
  { name: 'vibes-grupo', alt: 'Integrantes do Vibes – Grupo Vocal reunidos em estúdio, com microfones nas mãos' },
  { name: 'vibes-ao-vivo', alt: 'Integrantes do Vibes – Grupo Vocal a cantar em conjunto, ao microfone' },
];
