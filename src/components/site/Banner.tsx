import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/ui/misc';
import { buttonVariants } from '@/components/ui/button';
import { mediaUrl } from '@/lib/api';
import { safeHref } from '@/lib/siteDefaults';
import { useSite } from '@/hooks/useSite';
import { cn } from '@/lib/cn';

/** Chamadas/banners geridos no painel (ex.: “VEM FAZER PARTE DESTA HISTÓRIA!”). */
export function Banner() {
  const items = useSite().content.banner.items.filter((b) => b.title || b.text);
  if (items.length === 0) return null;
  return (
    <section aria-label="Destaques" className="py-10 md:py-14">
      <div className="container space-y-6">
        {items.map((b, i) => {
          const img = b.image ? mediaUrl(b.image) : null;
          return (
            <Reveal key={i}>
              <div className={cn('relative isolate overflow-hidden rounded-[2rem] border border-gold/30 bg-gold-soft px-6 py-12 text-center shadow-card md:px-14 md:py-16', img && 'md:text-left')}>
                {img && (
                  <>
                    <img src={img} alt="" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover" />
                    <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-paper via-paper/90 to-paper/40" />
                  </>
                )}
                <div aria-hidden className="absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-gold-bright/25 blur-3xl" />
                <p className="font-display text-3xl font-semibold leading-tight text-fg md:text-5xl">{b.title}</p>
                {b.text && <p className={cn('mt-4 max-w-2xl text-base text-fg-muted md:text-lg', !img && 'mx-auto')}>{b.text}</p>}
                {b.cta_label && (
                  <a href={safeHref(b.cta_href)} className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
                    {b.cta_label} <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                )}
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
