import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Ticket, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonVariants } from '@/components/ui/button';
import { useSite } from '@/hooks/useSite';
import { RenewLogo } from './RenewLogo';
import type { SectionKey } from '@/lib/siteDefaults';

export const NAV: { href: string; label: string; section: SectionKey }[] = [
  { href: '#evento', label: 'O Evento', section: 'about' },
  { href: '#historia', label: '25 Anos', section: 'history' },
  { href: '#grupo', label: 'O Grupo', section: 'group' },
  { href: '#informacoes', label: 'Informações', section: 'event_info' },
  { href: '#ingressos', label: 'Ingressos', section: 'tickets' },
  { href: '#galeria', label: 'Galeria', section: 'event_gallery' },
  { href: '#faq', label: 'FAQ', section: 'faq' },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-baseline gap-2 font-display leading-none', className)}>
      <span className="text-gold-metal text-2xl font-bold tracking-tight md:text-[1.7rem]">V25</span>
      <span className="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.34em] text-fg/80">O Legado</span>
    </span>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const href = (h: string) => (onHome ? h : `/${h}`);
  const { enabled } = useSite();
  const nav = NAV.filter((n) => enabled(n.section));

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-all duration-500',
        scrolled || !onHome ? 'border-b border-fg/10 bg-paper/90 shadow-soft backdrop-blur-xl' : 'bg-paper/60 backdrop-blur-sm',
      )}
    >
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-fg">
        Saltar para o conteúdo
      </a>
      <nav className="container flex h-16 items-center justify-between md:h-20" aria-label="Principal">
        <Link
          to="/"
          aria-label="V25 — O Legado, página inicial"
          onClick={() => window.scrollTo({ top: 0 })}
          className="flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {/* Mesmo logótipo do rodapé (asset oficial), apenas redimensionado */}
          <RenewLogo eager className="h-9 md:h-11" />
        </Link>
        <ul className="hidden items-center gap-7 lg:flex">
          {nav.map((n) => (
            <li key={n.href}>
              <a href={href(n.href)} className="text-[13px] font-medium text-fg/75 transition hover:text-gold-deep">
                {n.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link to="/consultar" className="hidden text-[13px] font-medium text-fg/75 hover:text-gold-deep md:inline">
            Consultar pedido
          </Link>
          <a href={href('#ingressos')} className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}>
            <Ticket className="h-4 w-4" aria-hidden /> Ingressos
          </a>
          <button
            type="button"
            className="rounded-full p-2.5 text-fg lg:hidden"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            aria-controls="menu-movel"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            id="menu-movel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-16 z-40 bg-paper backdrop-blur-xl lg:hidden"
          >
            <motion.ul
              className="container flex flex-col gap-1 pt-8"
              initial="h"
              animate="s"
              variants={{ s: { transition: { staggerChildren: 0.04 } } }}
            >
              {[...nav, { href: '/consultar', label: 'Consultar pedido' }].map((n) => (
                <motion.li key={n.href} variants={{ h: { opacity: 0, x: -16 }, s: { opacity: 1, x: 0 } }}>
                  {n.href.startsWith('/') ? (
                    <Link to={n.href} onClick={() => setOpen(false)} className="block border-b border-fg/5 py-4 font-display text-3xl text-fg">
                      {n.label}
                    </Link>
                  ) : (
                    <a href={href(n.href)} onClick={() => setOpen(false)} className="block border-b border-fg/5 py-4 font-display text-3xl text-fg">
                      {n.label}
                    </a>
                  )}
                </motion.li>
              ))}
              <li className="pt-8">
                <a href={href('#ingressos')} onClick={() => setOpen(false)} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
                  Garante já o teu ingresso
                </a>
              </li>
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
