import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, Copy, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ORDER_STATUS, TONE_CLASSES } from '@/lib/status';
import type { OrderStatus } from '@/lib/types';

export function Spinner({ className, label = 'A carregar…' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-fg/60', className)}>
      <Loader2 className="h-4 w-4 animate-spin text-gold" aria-hidden />
      {label}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const s = ORDER_STATUS[status];
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1', TONE_CLASSES[s.tone], className)}>
      {s.label}
    </span>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: keyof typeof TONE_CLASSES; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1', TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'bad' | 'ok';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = tone === 'info' || tone === 'ok' ? Info : AlertTriangle;
  return (
    <div role={tone === 'bad' ? 'alert' : 'note'} className={cn('flex gap-3 rounded-2xl p-4 text-sm ring-1', TONE_CLASSES[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg/80">{children}</div>}
      </div>
    </div>
  );
}

export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback para navegadores sem Clipboard API
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-gold/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-light transition hover:bg-gold/10',
        copied && 'border-emerald-400/60 text-emerald-800',
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span aria-live="polite">{copied ? 'Copiado' : label}</span>
    </button>
  );
}

export function Reveal({ children, delay = 0, className, y = 28 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({ eyebrow, title, intro, align = 'center' }: { eyebrow: string; title: ReactNode; intro?: ReactNode; align?: 'center' | 'left' }) {
  return (
    <Reveal className={cn('mb-12 max-w-3xl md:mb-16', align === 'center' && 'mx-auto text-center')}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-4xl font-semibold leading-[1.05] text-fg md:text-6xl">{title}</h2>
      {intro && <p className="mt-5 text-base leading-relaxed text-fg/65 md:text-lg">{intro}</p>}
    </Reveal>
  );
}

export function EmptyState({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center rounded-3xl border border-dashed border-gold/20 bg-paper-soft/40 px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 text-gold/70">{icon}</div>}
      <p className="font-display text-2xl text-fg">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-fg/55">{children}</div>}
    </div>
  );
}
