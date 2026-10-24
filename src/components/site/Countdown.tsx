import { useCountdown } from '@/hooks/useCountdown';
import { cn } from '@/lib/cn';

export function Countdown({ target, className }: { target: string; className?: string }) {
  const r = useCountdown(target);
  if (r.done) {
    return <p className={cn('font-display text-2xl text-gold-light', className)}>O legado está a acontecer agora.</p>;
  }
  const units = [
    { v: r.days, l: r.days === 1 ? 'Dia' : 'Dias' },
    { v: r.hours, l: 'Horas' },
    { v: r.minutes, l: 'Min' },
    { v: r.seconds, l: 'Seg' },
  ];
  return (
    <div className={cn('flex gap-2.5 sm:gap-4', className)} role="timer" aria-label={`Faltam ${r.days} dias, ${r.hours} horas e ${r.minutes} minutos para o evento`}>
      {units.map((u) => (
        <div key={u.l} className="glass flex min-w-[4.1rem] flex-col items-center rounded-2xl px-3 py-3 sm:min-w-[5.2rem] sm:px-4">
          <span className="font-display text-3xl font-semibold tabular-nums text-cream sm:text-4xl" aria-hidden>
            {String(u.v).padStart(2, '0')}
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold" aria-hidden>
            {u.l}
          </span>
        </div>
      ))}
    </div>
  );
}
