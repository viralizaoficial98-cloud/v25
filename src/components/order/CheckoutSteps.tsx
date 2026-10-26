import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export const CHECKOUT_STEPS = ['Seleção', 'Dados', 'Resumo', 'Pagamento', 'Confirmação'];

/** Indicador das etapas do checkout (1–3 na página de compra, 4–5 na página do pedido). */
export function CheckoutSteps({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1.5 sm:gap-3" aria-label="Etapas da compra">
      {CHECKOUT_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className="flex flex-col gap-2">
            <span className={cn('h-1.5 rounded-full', done || active ? 'bg-gold-metal' : 'bg-fg/10')} />
            <span className={cn('flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] sm:text-[11px]', active ? 'text-gold-deep' : done ? 'text-fg' : 'text-fg/40')}>
              <span className={cn('hidden h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] sm:flex', active ? 'border-gold bg-gold text-paper' : done ? 'border-gold text-gold-deep' : 'border-fg/20')}>
                {done ? <Check className="h-3 w-3" aria-hidden /> : i + 1}
              </span>
              <span className="truncate">{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
