import { mediaUrl } from '@/lib/api';
import { OfficialPicture } from './picture';
import type { OfficialImage } from '@/lib/images';
import { cn } from '@/lib/cn';

/**
 * Imagem gerida no painel (carregada para uploads/media). Sem imagem definida,
 * mostra a fotografia oficial correspondente (AVIF/WebP responsivos).
 */
export function CmsImage({
  path,
  fallback,
  alt,
  sizes,
  className,
  imgClassName,
  priority,
}: {
  path: string | null | undefined;
  fallback: OfficialImage;
  alt: string;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}) {
  const url = path ? mediaUrl(path) : null;
  if (!url) return <OfficialPicture name={fallback} alt={alt} sizes={sizes} className={className} imgClassName={imgClassName} priority={priority} />;
  return (
    <picture className={cn('relative block overflow-hidden bg-paper-muted', className)}>
      <img src={url} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" className={cn('h-full w-full', imgClassName)} />
    </picture>
  );
}
