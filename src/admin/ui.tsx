import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Alert, Spinner } from '@/components/ui/misc';
import { errorMessage } from '@/lib/errors';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold text-fg md:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg/55">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn('rounded-2xl border border-fg/10 bg-paper-soft/70 p-5', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loadable({ loading, error, children, empty }: { loading: boolean; error: unknown; children: ReactNode; empty?: ReactNode | false }) {
  if (loading) return <div className="py-10 text-center"><Spinner /></div>;
  if (error) return <Alert tone="bad">{errorMessage(error)}</Alert>;
  if (empty) return <div className="rounded-xl border border-dashed border-fg/10 py-10 text-center text-sm text-fg/45">{empty}</div>;
  return <>{children}</>;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-fg/10 text-[11px] uppercase tracking-[0.14em] text-fg/45">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-fg/5">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn('px-3 py-3 align-top', className)}>{children}</td>;

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-fg/60">{children}</label>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm text-fg/80"
    >
      <span className={cn('relative h-6 w-11 rounded-full transition', checked ? 'bg-gold' : 'bg-fg/15')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}
