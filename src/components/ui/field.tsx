import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const base =
  'w-full rounded-xl border bg-ink-700/80 px-4 py-3 text-[15px] text-cream placeholder:text-cream/30 transition focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-60';

interface FieldProps {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
  required?: boolean;
}

export function Field({ label, error, hint, children, className, required }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-[0.16em] text-cream/70">
        {label}
        {required && <span className="ml-1 text-gold" aria-hidden>*</span>}
      </label>
      {children(id, [hintId, errId].filter(Boolean).join(' ') || undefined)}
      {hint && !error && (
        <p id={hintId} className="text-xs text-cream/50">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, invalid ? 'border-rose-400/70' : 'border-white/10 focus:border-gold/60', className)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, 'appearance-none pr-10', invalid ? 'border-rose-400/70' : 'border-white/10 focus:border-gold/60', className)}
      {...props}
    />
  ),
);
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(base, 'min-h-[110px]', invalid ? 'border-rose-400/70' : 'border-white/10 focus:border-gold/60', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
