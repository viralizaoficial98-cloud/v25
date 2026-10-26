import { useCallback, useEffect } from 'react';
import * as D from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface LightboxItem {
  src: string;
  srcSet?: string;
  alt: string;
  caption?: string;
  kind?: 'foto' | 'video';
}

export function Lightbox({ items, index, onIndex }: { items: LightboxItem[]; index: number | null; onIndex: (i: number | null) => void }) {
  const open = index !== null;
  const go = useCallback(
    (d: number) => {
      if (index === null) return;
      onIndex((index + d + items.length) % items.length);
    },
    [index, items.length, onIndex],
  );
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, go]);
  const item = index !== null ? items[index] : null;

  return (
    <D.Root open={open} onOpenChange={(v) => !v && onIndex(null)}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/95" />
        <D.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 focus:outline-none" aria-describedby={undefined}>
          <D.Title className="sr-only">{item?.alt ?? 'Galeria'}</D.Title>
          <AnimatePresence mode="wait">
            {item && (
              <motion.figure
                key={item.src}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex max-h-full max-w-6xl flex-col items-center"
              >
                {item.kind === 'video' ? (
                  <video src={item.src} controls autoPlay className="max-h-[80vh] max-w-full rounded-xl" />
                ) : (
                  <img src={item.src} srcSet={item.srcSet} sizes="100vw" alt={item.alt} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
                )}
                {item.caption && <figcaption className="mt-4 max-w-2xl text-center text-sm text-fg/70">{item.caption}</figcaption>}
                <p className="mt-2 text-xs text-fg/40">
                  {(index ?? 0) + 1} / {items.length}
                </p>
              </motion.figure>
            )}
          </AnimatePresence>
          {items.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Anterior" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-fg/10 p-3 text-fg hover:bg-fg/20 md:left-6">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Seguinte" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-fg/10 p-3 text-fg hover:bg-fg/20 md:right-6">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <D.Close aria-label="Fechar" className="absolute right-4 top-4 rounded-full bg-fg/10 p-3 text-fg hover:bg-fg/20">
            <X className="h-6 w-6" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
