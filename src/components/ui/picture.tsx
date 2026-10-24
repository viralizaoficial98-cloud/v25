import { useState } from 'react';
import { officialImage, type OfficialImage } from '@/lib/images';
import { cn } from '@/lib/cn';

interface Props {
  name: OfficialImage;
  alt: string;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}

/** Fotografia oficial com AVIF/WebP responsivos e placeholder desfocado (sem recortes forçados). */
export function OfficialPicture({ name, alt, sizes = '100vw', className, imgClassName, priority }: Props) {
  const img = officialImage(name);
  const [loaded, setLoaded] = useState(false);
  return (
    <picture className={cn('relative block overflow-hidden', className)} style={{ backgroundImage: `url(${img.blur})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <source type="image/avif" srcSet={img.avifSrcSet} sizes={sizes} />
      <source type="image/webp" srcSet={img.webpSrcSet} sizes={sizes} />
      <img
        src={img.fallback}
        alt={alt}
        width={img.width}
        height={img.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        // @ts-expect-error fetchpriority ainda não está nos tipos do React 18
        fetchpriority={priority ? 'high' : 'auto'}
        onLoad={() => setLoaded(true)}
        className={cn('h-full w-full transition-opacity duration-700', loaded ? 'opacity-100' : 'opacity-0', imgClassName)}
      />
    </picture>
  );
}
