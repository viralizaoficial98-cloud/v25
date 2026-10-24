import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Ticket, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonVariants } from '@/components/ui/button';

export const NAV = [
  { href: '#evento', label: 'O Evento' },
  { href: '#historia', label: '25 Anos' },
  { href: '#grupo', label: 'O Grupo' },
  { href: '#informacoes', label: 'Informações' },
  { href: '#ingressos', label: 'Ingressos' },
  { href: '#memorias', label: 'Memórias' },
  { href: '#faq', label: 'FAQ' },
];

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-baseline gap-2 font-display leading-none', className)}>
      <span className="text-gold-metal text-2xl font-bold tracking-tight md:text-[1.7rem]">V25</span>
      <span className="text-[0.68rem] font-sans font-semibold uppercase tracking-[0.34em] text-cream/80">O Legado</span>
    </span>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const href = (h: string) => (onHome ? h : `/${h}`);

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
        scrolled || !onHome ? 'border-b border-gold/10 bg-ink/85 backdrop-blur-xl' : 'bg-gradient-to-b from-ink/70 to-transparent',
      )}
    >
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-ink">
        Saltar para o conteúdo
      </a>
      <nav className="container flex h-16 items-center justify-between md:h-20" aria-label="Principal">
        <Link to="/" aria-label="V25 — O Legado, início" onClick={() => window.scrollTo({ top: 0 })}>
          <Logo />
        </Link>
        <ul className="hidden items-center gap-7 lg:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={href(n.href)} className="text-[13px] font-medium text-cream/70 transition hover:text-gold-light">
                {n.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link to="/consultar" className="hidden text-[13px] font-medium text-cream/70 hover:text-gold-light md:inline">
            Consultar pedido
          </Link>
          <a href={href('#ingressos')} className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}>
            <Ticket className="h-4 w-4" aria-hidden /> Ingressos
          </a>
          <button
            type="button"
            className="rounded-full p-2.5 text-cream lg:hidden"
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
            className="fixed inset-0 top-16 z-40 bg-ink/97 backdrop-blur-xl lg:hidden"
          >
            <motion.ul
              className="container flex flex-col gap-1 pt-8"
              initial="h"
              animate="s"
              variants={{ s: { transition: { staggerChildren: 0.04 } } }}
            >
              {[...NAV, { href: '/consultar', label: 'Consultar pedido' }].map((n) => (
                <motion.li key={n.href} variants={{ h: { opacity: 0, x: -16 }, s: { opacity: 1, x: 0 } }}>
                  {n.href.startsWith('/') ? (
                    <Link to={n.href} onClick={() => setOpen(false)} className="block border-b border-white/5 py-4 font-display text-3xl text-cream">
                      {n.label}
                    </Link>
                  ) : (
                    <a href={href(n.href)} onClick={() => setOpen(false)} className="block border-b border-white/5 py-4 font-display text-3xl text-cream">
                      {n.label}
                    </a>
                  )}
                </motion.li>
              ))}
              <li className="pt-8">
                <a href={href('#ingressos')} onClick={() => setOpen(false)} className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
                  Garantir o meu ingresso
                </a>
              </li>
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
