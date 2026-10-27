import { cn } from '@/lib/cn';

/**
 * Logótipo oficial Renew (mesmo ficheiro no cabeçalho e no rodapé — não redesenhar).
 * Original 1796×502: a largura acompanha a altura definida em `className`.
 */
export function RenewLogo({ className, eager }: { className?: string; eager?: boolean }) {
  const base = import.meta.env.BASE_URL;
  return (
    <picture>
      <source type="image/webp" srcSet={`${base}images/renew-logo-480.webp 480w, ${base}images/renew-logo-960.webp 960w`} sizes="200px" />
      <img
        src={`${base}images/renew-logo-480.png`}
        alt="Renew — Criando momentos épicos para si"
        width={1796}
        height={502}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={cn('block h-auto w-auto', className)}
      />
    </picture>
  );
}
